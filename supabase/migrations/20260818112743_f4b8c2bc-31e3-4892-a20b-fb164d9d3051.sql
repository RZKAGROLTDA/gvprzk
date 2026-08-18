ALTER TABLE public.campaign_rules
  ADD COLUMN discount_periods jsonb NOT NULL DEFAULT '[]'::jsonb;