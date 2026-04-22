ALTER TABLE public.campaign_clients
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS sold_trigger text;