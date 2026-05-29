-- Log de importações em massa de equipamentos
CREATE TABLE public.equipment_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  executed_by uuid,
  executed_by_email text,
  rows_inserted integer NOT NULL DEFAULT 0,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.equipment_import_log TO authenticated;
GRANT ALL  ON public.equipment_import_log TO service_role;

ALTER TABLE public.equipment_import_log ENABLE ROW LEVEL SECURITY;

-- Somente admin/manager podem ver os logs
CREATE POLICY equipment_import_log_select_admin
ON public.equipment_import_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE INDEX idx_eq_import_log_batch ON public.equipment_import_log(batch_id);
CREATE INDEX idx_eq_import_log_created ON public.equipment_import_log(created_at DESC);

COMMENT ON TABLE public.equipment_import_log IS
'Audit log das importações em massa de client_equipment via edge function bulk-import-equipment.';