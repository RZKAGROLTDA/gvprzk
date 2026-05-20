ALTER TABLE public.special_conditions
  ADD COLUMN IF NOT EXISTS installments text,
  ADD COLUMN IF NOT EXISTS payment_type text;