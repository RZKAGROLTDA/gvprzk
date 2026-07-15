
CREATE TABLE public.team_vacations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  employee_role TEXT,
  filial_id UUID NOT NULL REFERENCES public.filiais(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER GENERATED ALWAYS AS ((end_date - start_date) + 1) STORED,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  observation TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_vacations_dates_check CHECK (end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_vacations TO authenticated;
GRANT ALL ON public.team_vacations TO service_role;

ALTER TABLE public.team_vacations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_team_vacations_employee_user_id ON public.team_vacations(employee_user_id);
CREATE INDEX idx_team_vacations_filial_id ON public.team_vacations(filial_id);
CREATE INDEX idx_team_vacations_dates ON public.team_vacations(start_date, end_date);

CREATE TRIGGER trg_team_vacations_updated_at
BEFORE UPDATE ON public.team_vacations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_insert_vacation(p_filial_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND (public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND p.filial_id = p_filial_id
      AND (public.has_role(auth.uid(), 'supervisor'::app_role)
        OR public.has_role(auth.uid(), 'rac'::app_role))
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_insert_vacation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_insert_vacation(UUID) TO authenticated;

CREATE POLICY "vacations_select_admin_manager"
ON public.team_vacations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND (public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role))
  )
);

CREATE POLICY "vacations_insert_by_role"
ON public.team_vacations FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_insert_vacation(filial_id)
);

CREATE POLICY "vacations_update_admin_manager"
ON public.team_vacations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND (public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND (public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role))
  )
);

CREATE POLICY "vacations_delete_admin_manager"
ON public.team_vacations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND (public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role))
  )
);

CREATE OR REPLACE FUNCTION public.prevent_vacation_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_cancelled THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_vacations v
    WHERE v.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND v.is_cancelled = false
      AND v.start_date <= NEW.end_date
      AND v.end_date >= NEW.start_date
      AND (
        (
          NEW.employee_user_id IS NOT NULL
          AND v.employee_user_id = NEW.employee_user_id
        )
        OR LOWER(TRIM(v.employee_name)) = LOWER(TRIM(NEW.employee_name))
      )
  ) THEN
    RAISE EXCEPTION 'Já existe um período de férias cadastrado para este colaborador.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_vacation_overlap() FROM PUBLIC, anon;

CREATE TRIGGER trg_prevent_vacation_overlap
BEFORE INSERT OR UPDATE ON public.team_vacations
FOR EACH ROW EXECUTE FUNCTION public.prevent_vacation_overlap();

CREATE VIEW public.team_vacations_view
WITH (security_invoker = true) AS
SELECT
  v.id,
  v.employee_user_id,
  v.employee_name,
  v.employee_role,
  v.filial_id,
  f.nome AS filial_name,
  v.start_date,
  v.end_date,
  v.total_days,
  v.is_cancelled,
  v.observation,
  v.created_by,
  v.created_at,
  v.updated_at,
  CASE
    WHEN v.is_cancelled THEN 'cancelled'
    WHEN CURRENT_DATE < v.start_date THEN 'scheduled'
    WHEN CURRENT_DATE BETWEEN v.start_date AND v.end_date THEN 'in_progress'
    ELSE 'completed'
  END AS status
FROM public.team_vacations v
LEFT JOIN public.filiais f ON f.id = v.filial_id;

GRANT SELECT ON public.team_vacations_view TO authenticated;
