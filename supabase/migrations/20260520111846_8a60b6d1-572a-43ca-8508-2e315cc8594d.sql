
ALTER TABLE public.special_conditions
  ADD COLUMN IF NOT EXISTS payment_date date;

ALTER TABLE public.special_conditions
  ADD COLUMN IF NOT EXISTS payment_condition_days integer
  GENERATED ALWAYS AS (
    CASE
      WHEN payment_date IS NOT NULL AND sale_date IS NOT NULL
        THEN (payment_date - sale_date)
      ELSE NULL
    END
  ) STORED;
