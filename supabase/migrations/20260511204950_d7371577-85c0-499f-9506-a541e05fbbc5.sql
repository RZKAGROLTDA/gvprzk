
-- Tabela de programação de visitas (planejamento futuro)
CREATE TABLE public.visit_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_date date NOT NULL,
  client_code text NOT NULL,
  client_name text NOT NULL,
  client_property text,
  client_phone text,
  client_email text,
  filial text NOT NULL,
  filial_id uuid,
  seller_id uuid NOT NULL,
  seller_name text NOT NULL,
  observation text,
  status text NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado','realizado','nao_realizado','reagendado')),
  realized_task_id uuid,
  realized_at timestamptz,
  reschedule_from_id uuid REFERENCES public.visit_schedules(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_schedules_unique_per_seller_client_date
    UNIQUE (seller_id, client_code, planned_date)
);

CREATE INDEX idx_visit_schedules_seller_date ON public.visit_schedules(seller_id, planned_date);
CREATE INDEX idx_visit_schedules_client_date ON public.visit_schedules(client_code, planned_date);
CREATE INDEX idx_visit_schedules_filial_date ON public.visit_schedules(filial_id, planned_date);
CREATE INDEX idx_visit_schedules_status ON public.visit_schedules(status);

ALTER TABLE public.visit_schedules ENABLE ROW LEVEL SECURITY;

-- SELECT: dono, manager/admin, supervisor da mesma filial
CREATE POLICY visit_schedules_select ON public.visit_schedules
FOR SELECT TO authenticated
USING (
  seller_id = auth.uid()
  OR has_role(auth.uid(),'manager'::app_role)
  OR has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'supervisor'::app_role)
      AND filial_id = get_supervisor_filial_id(auth.uid()))
);

-- INSERT
CREATE POLICY visit_schedules_insert ON public.visit_schedules
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    seller_id = auth.uid()
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR (has_role(auth.uid(),'supervisor'::app_role)
        AND filial_id = get_supervisor_filial_id(auth.uid()))
  )
);

-- UPDATE
CREATE POLICY visit_schedules_update ON public.visit_schedules
FOR UPDATE TO authenticated
USING (
  seller_id = auth.uid()
  OR has_role(auth.uid(),'manager'::app_role)
  OR has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'supervisor'::app_role)
      AND filial_id = get_supervisor_filial_id(auth.uid()))
)
WITH CHECK (
  seller_id = auth.uid()
  OR has_role(auth.uid(),'manager'::app_role)
  OR has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'supervisor'::app_role)
      AND filial_id = get_supervisor_filial_id(auth.uid()))
);

-- DELETE: somente admin
CREATE POLICY visit_schedules_delete ON public.visit_schedules
FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER trg_visit_schedules_updated_at
BEFORE UPDATE ON public.visit_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função: marcar programação como realizado quando uma task casar
CREATE OR REPLACE FUNCTION public.mark_visit_schedule_realized()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clientcode IS NULL OR NEW.created_by IS NULL OR NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('in_progress','completed') THEN
    RETURN NEW;
  END IF;

  UPDATE public.visit_schedules
  SET status = 'realizado',
      realized_task_id = NEW.id,
      realized_at = now(),
      updated_at = now()
  WHERE client_code = NEW.clientcode
    AND seller_id = NEW.created_by
    AND planned_date = NEW.start_date
    AND status = 'planejado'
    AND realized_task_id IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_mark_visit_schedule_realized
AFTER INSERT OR UPDATE OF status, clientcode, start_date ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.mark_visit_schedule_realized();
