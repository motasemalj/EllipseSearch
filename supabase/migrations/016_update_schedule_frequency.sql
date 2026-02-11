-- ===========================================
-- Migration: Update Schedule Frequency Enum
-- ===========================================
-- Adds more granular frequency options for scheduled analyses

-- Add new enum values if they don't exist
DO $$ 
BEGIN
    -- Check if enum type exists and add new values
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_frequency') THEN
        -- Add 1x_daily if not exists
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = '1x_daily' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'schedule_frequency')) THEN
            ALTER TYPE schedule_frequency ADD VALUE '1x_daily';
        END IF;
        
        -- Add 3x_daily if not exists
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = '3x_daily' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'schedule_frequency')) THEN
            ALTER TYPE schedule_frequency ADD VALUE '3x_daily';
        END IF;
        
        -- Add 6x_daily if not exists
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = '6x_daily' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'schedule_frequency')) THEN
            ALTER TYPE schedule_frequency ADD VALUE '6x_daily';
        END IF;
    END IF;
END $$;

-- Comment for documentation
COMMENT ON TYPE schedule_frequency IS 'Schedule frequencies: daily, weekly, biweekly, monthly, 1x_daily, 3x_daily, 6x_daily';

