ALTER TABLE public.campaign_rules
  ADD COLUMN IF NOT EXISTS start_date date NULL,
  ADD COLUMN IF NOT EXISTS end_date date NULL;

ALTER TABLE public.campaign_rules
  DROP CONSTRAINT IF EXISTS campaign_rules_period_valid;

ALTER TABLE public.campaign_rules
  ADD CONSTRAINT campaign_rules_period_valid
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);