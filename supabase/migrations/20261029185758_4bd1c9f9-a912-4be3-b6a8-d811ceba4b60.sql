ALTER TABLE public.special_conditions
  ADD COLUMN condition_type text,
  ADD COLUMN margin_percent numeric(12,2);

ALTER TABLE public.special_conditions
  ADD CONSTRAINT special_conditions_condition_type_valid
  CHECK (condition_type IS NULL OR condition_type IN ('safra', 'normal'));