-- ===========================================
-- Migration: Add Trial Tracking to Organizations
-- ===========================================
-- Adds fields for tracking trial period and subscription history

-- Add trial_started_at to track when trial began
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NULL;

-- Add trial_expires_at for explicit expiration date
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add trial_converted to track if user upgraded from trial
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS trial_converted BOOLEAN DEFAULT FALSE;

-- Add subscription_started_at for paid subscription tracking
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ DEFAULT NULL;

-- Add subscription_period_end for current billing period end
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ DEFAULT NULL;

-- Update existing trial organizations to have trial dates set
UPDATE organizations
SET 
  trial_started_at = created_at,
  trial_expires_at = created_at + INTERVAL '3 days'
WHERE tier = 'trial' AND trial_started_at IS NULL;

-- Update existing free organizations (likely expired trials)
UPDATE organizations
SET 
  trial_started_at = created_at,
  trial_expires_at = created_at + INTERVAL '3 days'
WHERE tier = 'free' AND trial_started_at IS NULL;

-- ===========================================
-- Update handle_new_user function for 3-day trial
-- ===========================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  org_name TEXT;
BEGIN
  -- Get organization name from user metadata or use email domain
  org_name := COALESCE(
    NEW.raw_user_meta_data->>'organization_name',
    split_part(NEW.email, '@', 1) || ' Organization'
  );

  -- Create new organization with 3-day trial
  INSERT INTO organizations (
    name, 
    tier, 
    credits_balance,
    trial_started_at,
    trial_expires_at
  )
  VALUES (
    org_name, 
    'trial', 
    200,  -- Trial credits
    NOW(),
    NOW() + INTERVAL '3 days'
  )
  RETURNING id INTO org_id;

  -- Create profile for the new user as owner
  INSERT INTO profiles (id, organization_id, role, full_name)
  VALUES (
    NEW.id,
    org_id,
    'owner',
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Function: Check and expire trials
-- ===========================================
-- Can be called periodically or on-demand to expire trials
CREATE OR REPLACE FUNCTION expire_trials()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE organizations
  SET 
    tier = 'free',
    credits_balance = LEAST(credits_balance, 50),  -- Cap at free tier credits
    updated_at = NOW()
  WHERE 
    tier = 'trial' 
    AND trial_expires_at IS NOT NULL 
    AND trial_expires_at < NOW()
    AND trial_converted = FALSE;
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Function: Get organization subscription status
-- ===========================================
CREATE OR REPLACE FUNCTION get_subscription_status(org_id UUID)
RETURNS TABLE (
  tier TEXT,
  credits_balance INTEGER,
  trial_started_at TIMESTAMPTZ,
  trial_expires_at TIMESTAMPTZ,
  trial_days_remaining INTEGER,
  is_trial_expired BOOLEAN,
  is_paid_subscription BOOLEAN,
  subscription_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.tier,
    o.credits_balance,
    o.trial_started_at,
    o.trial_expires_at,
    GREATEST(0, EXTRACT(DAY FROM (o.trial_expires_at - NOW()))::INTEGER) as trial_days_remaining,
    (o.tier = 'trial' AND o.trial_expires_at IS NOT NULL AND o.trial_expires_at < NOW()) as is_trial_expired,
    (o.tier IN ('starter', 'pro', 'agency') AND o.stripe_subscription_status = 'active') as is_paid_subscription,
    COALESCE(o.stripe_subscription_status, 'none') as subscription_status
  FROM organizations o
  WHERE o.id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- Function: Check tier limits
-- ===========================================
CREATE OR REPLACE FUNCTION check_tier_limits(org_id UUID, check_type TEXT)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  max_allowed INTEGER,
  message TEXT
) AS $$
DECLARE
  org RECORD;
  brand_count INTEGER;
  prompt_count INTEGER;
  job_count INTEGER;
BEGIN
  -- Get organization details
  SELECT * INTO org FROM organizations WHERE id = org_id;
  
  IF org IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Organization not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check for expired trial
  IF org.tier = 'trial' AND org.trial_expires_at IS NOT NULL AND org.trial_expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Trial period has expired. Please upgrade to continue.'::TEXT;
    RETURN;
  END IF;
  
  IF check_type = 'brand' THEN
    -- Count existing brands
    SELECT COUNT(*) INTO brand_count FROM brands WHERE organization_id = org_id;
    
    -- Get max allowed based on tier
    CASE org.tier
      WHEN 'free' THEN max_allowed := 1;
      WHEN 'trial' THEN max_allowed := 2;
      WHEN 'starter' THEN max_allowed := 3;
      WHEN 'pro' THEN max_allowed := 10;
      WHEN 'agency' THEN max_allowed := 50;
      ELSE max_allowed := 1;
    END CASE;
    
    IF brand_count >= max_allowed THEN
      RETURN QUERY SELECT FALSE, brand_count, max_allowed, 
        format('Brand limit reached. Your %s plan allows %s brands.', org.tier, max_allowed)::TEXT;
    ELSE
      RETURN QUERY SELECT TRUE, brand_count, max_allowed, 'OK'::TEXT;
    END IF;
    
  ELSIF check_type = 'prompt' THEN
    -- Get max prompts per brand based on tier
    CASE org.tier
      WHEN 'free' THEN max_allowed := 10;
      WHEN 'trial' THEN max_allowed := 25;
      WHEN 'starter' THEN max_allowed := 50;
      WHEN 'pro' THEN max_allowed := 200;
      WHEN 'agency' THEN max_allowed := 500;
      ELSE max_allowed := 10;
    END CASE;
    
    RETURN QUERY SELECT TRUE, 0, max_allowed, 'OK'::TEXT;
    
  ELSIF check_type = 'credits' THEN
    IF org.credits_balance <= 0 THEN
      RETURN QUERY SELECT FALSE, org.credits_balance::INTEGER, 0, 
        'No credits remaining. Please upgrade your plan.'::TEXT;
    ELSE
      RETURN QUERY SELECT TRUE, org.credits_balance::INTEGER, org.credits_balance::INTEGER, 'OK'::TEXT;
    END IF;
    
  ELSE
    RETURN QUERY SELECT TRUE, 0, 0, 'Unknown check type'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

