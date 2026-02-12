-- ===========================================
-- Migration: Fix handle_new_user trigger
-- ===========================================
-- Adds proper error handling to the handle_new_user() function
-- so that signup failures produce actionable PostgreSQL logs
-- instead of a generic "Database error saving new user" from GoTrue.

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
  BEGIN
    INSERT INTO public.organizations (
      name,
      tier,
      credits_balance,
      trial_started_at,
      trial_expires_at
    )
    VALUES (
      org_name,
      'trial',
      200,
      NOW(),
      NOW() + INTERVAL '3 days'
    )
    RETURNING id INTO org_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user: failed to create organization for user %: % %',
      NEW.id, SQLERRM, SQLSTATE;
    RAISE;
  END;

  -- Create profile for the new user as owner
  BEGIN
    INSERT INTO public.profiles (id, organization_id, role, full_name)
    VALUES (
      NEW.id,
      org_id,
      'owner',
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user: failed to create profile for user %: % %',
      NEW.id, SQLERRM, SQLSTATE;
    RAISE;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure the trigger exists and points to the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
