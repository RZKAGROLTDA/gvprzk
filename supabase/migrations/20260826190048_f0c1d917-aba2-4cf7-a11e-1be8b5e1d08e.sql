CREATE TYPE public.pops_machine_status AS ENUM ('foco','em_andamento','servicada');

CREATE OR REPLACE FUNCTION public.pops_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.pops_programs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  goal_machines  integer NOT NULL DEFAULT 1000,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  notes          text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_programs_name_key UNIQUE (name)
);

GRANT SELECT ON public.pops_programs TO authenticated;
GRANT ALL    ON public.pops_programs TO service_role;
ALTER TABLE public.pops_programs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pops_programs_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.goal_machines <= 0 THEN
    RAISE EXCEPTION 'goal_machines deve ser maior que zero';
  END IF;
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'end_date nao pode ser anterior a start_date';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pops_programs_validate
  BEFORE INSERT OR UPDATE ON public.pops_programs
  FOR EACH ROW EXECUTE FUNCTION public.pops_programs_validate();

CREATE TRIGGER trg_pops_programs_updated_at
  BEFORE UPDATE ON public.pops_programs
  FOR EACH ROW EXECUTE FUNCTION public.pops_set_updated_at();

CREATE UNIQUE INDEX pops_programs_single_active
  ON public.pops_programs (active) WHERE active;

CREATE TABLE public.pops_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_services_code_key UNIQUE (code),
  CONSTRAINT pops_services_name_key UNIQUE (name)
);

GRANT SELECT ON public.pops_services TO authenticated;
GRANT ALL    ON public.pops_services TO service_role;
ALTER TABLE public.pops_services ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_pops_services_updated_at
  BEFORE UPDATE ON public.pops_services
  FOR EACH ROW EXECUTE FUNCTION public.pops_set_updated_at();

CREATE INDEX pops_services_active_order_idx
  ON public.pops_services (active, sort_order);

CREATE OR REPLACE FUNCTION public.pops_user_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.pops_scope()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_enabled   boolean;
  v_filial    uuid;
  v_scope     text := 'none';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('scope','none','filial_id',NULL,'user_id',NULL);
  END IF;

  SELECT (p.approval_status = 'approved' AND p.employment_status = 'active'),
         p.filial_id
    INTO v_enabled, v_filial
    FROM public.profiles p
   WHERE p.user_id = v_uid;

  IF COALESCE(v_enabled, false) = false THEN
    RETURN jsonb_build_object('scope','none','filial_id',NULL,'user_id',v_uid);
  END IF;

  IF public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') THEN
    v_scope := 'global';
  ELSIF public.has_role(v_uid,'supervisor') THEN
    v_scope := 'filial';
  ELSIF public.has_role(v_uid,'rac') THEN
    v_scope := 'self';
  END IF;

  RETURN jsonb_build_object('scope', v_scope, 'filial_id', v_filial, 'user_id', v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.pops_is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.pops_user_enabled()
     AND (public.has_role((SELECT auth.uid()),'admin')
       OR public.has_role((SELECT auth.uid()),'manager'));
$$;

CREATE TABLE public.pops_machines (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id              uuid NOT NULL
                            REFERENCES public.pops_programs(id) ON DELETE RESTRICT,
  equipment_id            uuid NOT NULL
                            REFERENCES public.client_equipment(id) ON DELETE RESTRICT,
  responsible_user_id     uuid,
  status                  public.pops_machine_status NOT NULL DEFAULT 'foco',
  active                  boolean NOT NULL DEFAULT true,
  deactivated_at          timestamptz,
  deactivated_by          uuid,
  deactivation_reason     text,
  transfer_divergence     boolean NOT NULL DEFAULT false,
  transfer_divergence_at  timestamptz,
  last_activity_at        timestamptz,
  source                  text NOT NULL DEFAULT 'manual',
  import_batch_id         uuid,
  notes                   text,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pops_machines_program_equipment_key UNIQUE (program_id, equipment_id)
);

GRANT SELECT, INSERT, UPDATE ON public.pops_machines TO authenticated;
GRANT ALL                    ON public.pops_machines TO service_role;
ALTER TABLE public.pops_machines ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_pops_machines_updated_at
  BEFORE UPDATE ON public.pops_machines
  FOR EACH ROW EXECUTE FUNCTION public.pops_set_updated_at();

CREATE OR REPLACE FUNCTION public.pops_machines_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source NOT IN ('manual','import') THEN
    RAISE EXCEPTION 'source invalido: %', NEW.source;
  END IF;

  IF NEW.active = false THEN
    IF NEW.deactivated_at IS NULL THEN NEW.deactivated_at := now(); END IF;
    IF NEW.deactivated_by IS NULL THEN NEW.deactivated_by := (SELECT auth.uid()); END IF;
    IF NEW.deactivation_reason IS NULL OR btrim(NEW.deactivation_reason) = '' THEN
      RAISE EXCEPTION 'deactivation_reason e obrigatorio ao inativar a maquina no POPS';
    END IF;
  ELSE
    NEW.deactivated_at := NULL;
    NEW.deactivated_by := NULL;
    NEW.deactivation_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pops_machines_validate
  BEFORE INSERT OR UPDATE ON public.pops_machines
  FOR EACH ROW EXECUTE FUNCTION public.pops_machines_validate();

CREATE INDEX pops_machines_program_rac_status_idx
  ON public.pops_machines (program_id, responsible_user_id, status) WHERE active;
CREATE INDEX pops_machines_program_status_idx
  ON public.pops_machines (program_id, status) WHERE active;
CREATE INDEX pops_machines_equipment_idx
  ON public.pops_machines (equipment_id);
CREATE INDEX pops_machines_divergence_idx
  ON public.pops_machines (program_id) WHERE transfer_divergence;

CREATE OR REPLACE FUNCTION public.pops_can_read_machine(p_pops_machine_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_ok     boolean := false;
BEGIN
  IF v_scope->>'scope' = 'none' THEN RETURN false; END IF;
  IF v_scope->>'scope' = 'global' THEN RETURN true; END IF;

  IF v_scope->>'scope' = 'filial' THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.pops_machines m
        JOIN public.client_equipment e ON e.id = m.equipment_id
       WHERE m.id = p_pops_machine_id
         AND e.filial_id = (v_scope->>'filial_id')::uuid
    ) INTO v_ok;
    RETURN v_ok;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pops_machines m
     WHERE m.id = p_pops_machine_id
       AND m.responsible_user_id = (v_scope->>'user_id')::uuid
  ) INTO v_ok;
  RETURN v_ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.pops_can_write_machine(p_pops_machine_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.pops_user_enabled()
     AND EXISTS (
       SELECT 1
         FROM public.pops_machines m
         JOIN public.pops_programs pr ON pr.id = m.program_id
        WHERE m.id = p_pops_machine_id
          AND m.active
          AND pr.active
          AND m.responsible_user_id = (SELECT auth.uid())
     );
$$;

CREATE POLICY "pops_programs_select_enabled"
  ON public.pops_programs FOR SELECT TO authenticated
  USING (public.pops_user_enabled());

CREATE POLICY "pops_programs_insert_manager"
  ON public.pops_programs FOR INSERT TO authenticated
  WITH CHECK (public.pops_is_manager());

CREATE POLICY "pops_programs_update_manager"
  ON public.pops_programs FOR UPDATE TO authenticated
  USING (public.pops_is_manager())
  WITH CHECK (public.pops_is_manager());

CREATE POLICY "pops_services_select_enabled"
  ON public.pops_services FOR SELECT TO authenticated
  USING (public.pops_user_enabled());

CREATE POLICY "pops_services_insert_manager"
  ON public.pops_services FOR INSERT TO authenticated
  WITH CHECK (public.pops_is_manager());

CREATE POLICY "pops_services_update_manager"
  ON public.pops_services FOR UPDATE TO authenticated
  USING (public.pops_is_manager())
  WITH CHECK (public.pops_is_manager());

CREATE POLICY "pops_machines_select_scope"
  ON public.pops_machines FOR SELECT TO authenticated
  USING (
    CASE (public.pops_scope()->>'scope')
      WHEN 'global' THEN true
      WHEN 'filial' THEN EXISTS (
        SELECT 1 FROM public.client_equipment e
         WHERE e.id = pops_machines.equipment_id
           AND e.filial_id = (public.pops_scope()->>'filial_id')::uuid
      )
      WHEN 'self'   THEN responsible_user_id = (SELECT auth.uid())
      ELSE false
    END
  );

CREATE POLICY "pops_machines_insert_manager"
  ON public.pops_machines FOR INSERT TO authenticated
  WITH CHECK (public.pops_is_manager() AND created_by = (SELECT auth.uid()));

CREATE POLICY "pops_machines_update_manager"
  ON public.pops_machines FOR UPDATE TO authenticated
  USING (public.pops_is_manager())
  WITH CHECK (public.pops_is_manager());

REVOKE EXECUTE ON FUNCTION public.pops_user_enabled()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pops_scope()                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pops_is_manager()            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pops_can_read_machine(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pops_can_write_machine(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pops_user_enabled()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.pops_scope()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.pops_is_manager()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.pops_can_read_machine(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pops_can_write_machine(uuid) TO authenticated;