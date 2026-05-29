-- Add new fields to client_equipment for equipment park master cadastre
ALTER TABLE public.client_equipment
  ADD COLUMN IF NOT EXISTS machine_type text,
  ADD COLUMN IF NOT EXISTS product_raw text,
  ADD COLUMN IF NOT EXISTS puk_status text,
  ADD COLUMN IF NOT EXISTS machine_status text NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS last_validation_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

-- Relax client_code NOT NULL (rows without code must be importable)
ALTER TABLE public.client_equipment ALTER COLUMN client_code DROP NOT NULL;
-- Relax created_by NOT NULL for system imports (uses service_role)
ALTER TABLE public.client_equipment ALTER COLUMN created_by DROP NOT NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_client_equipment_client_code ON public.client_equipment(client_code);
CREATE INDEX IF NOT EXISTS idx_client_equipment_serial_chassis ON public.client_equipment(serial_chassis);
CREATE INDEX IF NOT EXISTS idx_client_equipment_machine_type ON public.client_equipment(machine_type);
CREATE INDEX IF NOT EXISTS idx_client_equipment_import_batch_id ON public.client_equipment(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_client_equipment_filial_id ON public.client_equipment(filial_id);

-- Comments documenting the schema decisions
COMMENT ON COLUMN public.client_equipment.machine_type IS 'Canonical normalized type: TRATOR, COLHEITADEIRA, PLATAFORMA, PLANTADEIRA, PULVERIZADOR, JARDIM, COTTON, UTILITARIO, FORRAGEIRA, ENFARDADEIRA, SEGADEIRA, OUTROS';
COMMENT ON COLUMN public.client_equipment.product_raw IS 'Original product description from source Excel (preserved as-is)';
COMMENT ON COLUMN public.client_equipment.puk_status IS 'PUK status: yes | no | unknown';
COMMENT ON COLUMN public.client_equipment.machine_status IS 'Operational status of the machine. Default: ativa';
COMMENT ON COLUMN public.client_equipment.last_validation_at IS 'Last time a field user validated this record';
COMMENT ON COLUMN public.client_equipment.validated_by IS 'User who last validated the record in the field';
COMMENT ON COLUMN public.client_equipment.import_batch_id IS 'Groups records imported in the same batch for traceability/rollback';