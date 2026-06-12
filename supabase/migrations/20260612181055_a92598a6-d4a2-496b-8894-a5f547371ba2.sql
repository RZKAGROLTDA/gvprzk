ALTER TABLE public.client_equipment
  ADD COLUMN IF NOT EXISTS validation_priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_source text,
  ADD COLUMN IF NOT EXISTS validation_priority_reason text,
  ADD COLUMN IF NOT EXISTS validation_priority_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_client_equipment_validation_priority
  ON public.client_equipment (validation_priority)
  WHERE validation_priority = true;