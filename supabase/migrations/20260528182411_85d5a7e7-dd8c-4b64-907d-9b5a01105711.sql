
-- ============================================================
-- FASE 1: Extensão tasks + criação client_equipment
-- ============================================================

-- 1) Extensão da tabela tasks (campos NULLable, sem default)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS technical_category   text,
  ADD COLUMN IF NOT EXISTS opportunity_interest text,
  ADD COLUMN IF NOT EXISTS opportunity_urgency  text,
  ADD COLUMN IF NOT EXISTS opportunity_impact   text,
  ADD COLUMN IF NOT EXISTS opportunity_closing  text,
  ADD COLUMN IF NOT EXISTS sales_estimate       jsonb,
  ADD COLUMN IF NOT EXISTS next_action          text,
  ADD COLUMN IF NOT EXISTS next_action_date     date;

-- CHECK constraints (somente NULL ou baixa/media/alta)
DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_opportunity_interest_check
    CHECK (opportunity_interest IS NULL OR opportunity_interest IN ('baixa','media','alta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_opportunity_urgency_check
    CHECK (opportunity_urgency IS NULL OR opportunity_urgency IN ('baixa','media','alta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_opportunity_impact_check
    CHECK (opportunity_impact IS NULL OR opportunity_impact IN ('baixa','media','alta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_opportunity_closing_check
    CHECK (opportunity_closing IS NULL OR opportunity_closing IN ('baixa','media','alta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice parcial para visitas técnicas
CREATE INDEX IF NOT EXISTS idx_tasks_technical_visit
  ON public.tasks (created_by, start_date)
  WHERE task_type = 'technical_visit';

-- ============================================================
-- 2) Tabela client_equipment
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_equipment (
  id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_code     text NOT NULL,
  client_name     text NOT NULL,
  filial_id       uuid REFERENCES public.filiais(id) ON DELETE SET NULL,
  model           text,
  serial_chassis  text,
  hours           numeric,
  year            integer,
  observation     text,
  created_by      uuid NOT NULL DEFAULT auth.uid(),
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now()
);

-- GRANTs (auth-only, sem anon)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_equipment TO authenticated;
GRANT ALL ON public.client_equipment TO service_role;

-- RLS
ALTER TABLE public.client_equipment ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY client_equipment_select
  ON public.client_equipment FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'supervisor'::app_role)
      AND filial_id = get_supervisor_filial_id(auth.uid())
    )
  );

CREATE POLICY client_equipment_insert
  ON public.client_equipment FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY client_equipment_update
  ON public.client_equipment FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'supervisor'::app_role)
      AND filial_id = get_supervisor_filial_id(auth.uid())
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'supervisor'::app_role)
      AND filial_id = get_supervisor_filial_id(auth.uid())
    )
  );

CREATE POLICY client_equipment_delete
  ON public.client_equipment FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_client_equipment_client_code
  ON public.client_equipment (LOWER(client_code));
CREATE INDEX IF NOT EXISTS idx_client_equipment_filial
  ON public.client_equipment (filial_id);
CREATE INDEX IF NOT EXISTS idx_client_equipment_created_by
  ON public.client_equipment (created_by);

-- Unique parcial: client_code + serial_chassis (case-insensitive) quando serial existe
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_equipment_code_serial
  ON public.client_equipment (LOWER(client_code), LOWER(serial_chassis))
  WHERE serial_chassis IS NOT NULL;

-- Trigger updated_at (reusa função existente)
DROP TRIGGER IF EXISTS trg_client_equipment_updated_at ON public.client_equipment;
CREATE TRIGGER trg_client_equipment_updated_at
  BEFORE UPDATE ON public.client_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
