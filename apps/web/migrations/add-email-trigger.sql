-- Add 'email' trigger type and email_address column for email-triggered automations
-- This allows the email-bot service to trigger automation jobs via IMAP IDLE

ALTER TYPE app.automation_trigger_type ADD VALUE IF NOT EXISTS 'email';

ALTER TABLE app.automation_jobs ADD COLUMN IF NOT EXISTS email_address text;

ALTER TABLE app.automation_jobs ADD CONSTRAINT chk_email_address
  CHECK (trigger_type != 'email' OR email_address IS NOT NULL);
