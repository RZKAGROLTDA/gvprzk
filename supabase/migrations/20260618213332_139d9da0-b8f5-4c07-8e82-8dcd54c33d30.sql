ALTER TABLE public.client_equipment
  ADD COLUMN IF NOT EXISTS previous_client_code text,
  ADD COLUMN IF NOT EXISTS previous_client_name text,
  ADD COLUMN IF NOT EXISTS transferred_by uuid,
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_observation text,
  ADD COLUMN IF NOT EXISTS transfer_history jsonb;

CREATE INDEX IF NOT EXISTS idx_client_equipment_previous_client_code
  ON public.client_equipment(previous_client_code);

CREATE INDEX IF NOT EXISTS idx_client_equipment_transferred_at
  ON public.client_equipment(transferred_at DESC NULLS LAST);

NOTIFY pgrst, 'reload schema';