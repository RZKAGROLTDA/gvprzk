-- 1. TABLE
CREATE TABLE public.trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  training_date date NOT NULL,
  training_time time NOT NULL,
  hours numeric NOT NULL CHECK (hours > 0),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  filial_id uuid,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_trainings_training_date ON public.trainings(training_date);
CREATE INDEX idx_trainings_user_id ON public.trainings(user_id);
CREATE INDEX idx_trainings_filial_id ON public.trainings(filial_id);

-- 2. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainings TO authenticated;
GRANT ALL ON public.trainings TO service_role;

-- 3. RLS
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
CREATE POLICY "trainings_select_scope"
ON public.trainings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR (public.has_role(auth.uid(), 'supervisor') AND filial_id IS NOT DISTINCT FROM public.get_supervisor_filial_id(auth.uid()))
  OR user_id = auth.uid()
);

CREATE POLICY "trainings_insert_scope"
ON public.trainings FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'supervisor')
    OR user_id = auth.uid()
  )
);

CREATE POLICY "trainings_update_scope"
ON public.trainings FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR (public.has_role(auth.uid(), 'supervisor') AND filial_id IS NOT DISTINCT FROM public.get_supervisor_filial_id(auth.uid()))
  OR user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR (
    public.has_role(auth.uid(), 'supervisor')
    AND filial_id IS NOT DISTINCT FROM public.get_supervisor_filial_id(auth.uid())
  )
  OR user_id = auth.uid()
);

CREATE POLICY "trainings_delete_scope"
ON public.trainings FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR (public.has_role(auth.uid(), 'supervisor') AND filial_id IS NOT DISTINCT FROM public.get_supervisor_filial_id(auth.uid()))
  OR user_id = auth.uid()
);

-- 5. SNAPSHOT + AUTORIA + ESCOPO (fonte da verdade no servidor)
CREATE OR REPLACE FUNCTION public.trainings_enforce_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_filial uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_actor;
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;

  SELECT p.name, p.filial_id
    INTO v_name, v_filial
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id
    AND p.approval_status = 'approved'
    AND p.employment_status = 'active';

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Colaborador inválido ou inativo';
  END IF;

  NEW.user_name := v_name;
  NEW.filial_id := v_filial;

  IF public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'manager') THEN
    NULL;
  ELSIF public.has_role(v_actor, 'supervisor') THEN
    IF NEW.filial_id IS DISTINCT FROM public.get_supervisor_filial_id(v_actor) THEN
      RAISE EXCEPTION 'Colaborador fora do escopo da sua filial';
    END IF;
  ELSE
    IF NEW.user_id <> v_actor THEN
      RAISE EXCEPTION 'Você pode agendar treinamentos apenas para você';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_trainings_enforce_snapshot
BEFORE INSERT OR UPDATE ON public.trainings
FOR EACH ROW EXECUTE FUNCTION public.trainings_enforce_snapshot();