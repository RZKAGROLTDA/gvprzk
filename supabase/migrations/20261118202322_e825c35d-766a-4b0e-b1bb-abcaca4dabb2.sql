CREATE SCHEMA IF NOT EXISTS gvps_private;
REVOKE ALL ON SCHEMA gvps_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS gvps_private.role_change_grants (
  txid       bigint      NOT NULL,
  target     uuid        NOT NULL,
  new_role   text        NOT NULL,
  granted_by uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (txid, target)
);
REVOKE ALL ON gvps_private.role_change_grants FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gvps_is_internal_process()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role','') = 'service_role'
      OR (coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}') = '{}'
          AND session_user IN ('postgres','supabase_admin'));
$$;

CREATE OR REPLACE FUNCTION public.gvps_actor_level()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()
                      AND p.approval_status = 'approved'
                      AND coalesce(p.employment_status::text,'active') = 'active') THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')   THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'manager') THEN 'manager'
  END;
$$;

CREATE OR REPLACE FUNCTION public.gvps_has_role_change_grant(p_target uuid, p_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM gvps_private.role_change_grants g
                  WHERE g.txid = txid_current() AND g.target = p_target AND g.new_role = p_role);
$$;

REVOKE ALL ON FUNCTION public.gvps_is_internal_process()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gvps_actor_level()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gvps_has_role_change_grant(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_profile_insert_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.gvps_is_internal_process() THEN RETURN NEW; END IF;
  IF public.gvps_actor_level() IS NOT NULL THEN
    IF NEW.role::text IN ('admin','manager') THEN
      RAISE EXCEPTION 'GVPS: perfil Gerente/Admin não pode ser criado diretamente; crie como operacional/pendente e use a troca administrativa de cargo';
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GVPS: criação de perfil sem usuário autenticado não permitida';
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'GVPS: só é permitido criar o próprio perfil';
  END IF;
  NEW.approval_status := 'pending';
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_profile_insert ON public.profiles;
CREATE TRIGGER trg_guard_profile_insert BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_insert_privileges();
REVOKE ALL ON FUNCTION public.guard_profile_insert_privileges() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_level text;
  v_target_elevated boolean;
BEGIN
  IF public.gvps_is_internal_process() THEN RETURN NEW; END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN
    v_level := public.gvps_actor_level();
    IF v_level IS NULL OR NEW.user_id = auth.uid() THEN
      RAISE EXCEPTION 'GVPS: alteração de aprovação/situação não autorizada';
    END IF;
    IF v_level = 'manager' AND EXISTS (SELECT 1 FROM public.user_roles
                                        WHERE user_id = NEW.user_id AND role = 'admin') THEN
      RAISE EXCEPTION 'GVPS: Gerente não altera aprovação/situação de Administrador';
    END IF;
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;

  IF public.gvps_has_role_change_grant(NEW.user_id, NEW.role::text) THEN RETURN NEW; END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = NEW.user_id AND role IN ('admin','manager'))
    INTO v_target_elevated;

  IF NEW.role::text IN ('admin','manager') OR OLD.role::text IN ('admin','manager') OR v_target_elevated THEN
    RAISE EXCEPTION 'GVPS: troca de cargo envolvendo Gerente/Administrador exige a troca administrativa (update_user_role_secure). Operação bloqueada; nada foi alterado.';
  END IF;

  v_level := public.gvps_actor_level();
  IF v_level IS NULL OR NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'GVPS: alteração de cargo não autorizada';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_profile_role_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_profile_role_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_role_change
BEFORE UPDATE OF role, approval_status, employment_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

CREATE OR REPLACE FUNCTION public.sync_operational_role_from_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ops text[] := ARRAY['supervisor','rac','cpa','csa','consultant','sales_consultant','technical_consultant'];
  v_active boolean;
BEGIN
  IF public.gvps_has_role_change_grant(NEW.user_id, NEW.role::text) THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
     AND NEW.employment_status IS NOT DISTINCT FROM OLD.employment_status THEN
    RETURN NEW;
  END IF;

  v_active := NEW.approval_status = 'approved'
              AND coalesce(NEW.employment_status::text,'active') = 'active';

  IF v_active AND NEW.role::text = ANY (v_ops) THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role IN ('admin','manager')) THEN
      RAISE EXCEPTION 'GVPS: usuário possui Gerente/Admin em user_roles; use a troca administrativa. Operação bloqueada.';
    END IF;
    DELETE FROM public.user_roles
     WHERE user_id = NEW.user_id AND role::text = ANY (v_ops) AND role::text <> NEW.role::text;
    INSERT INTO public.user_roles (user_id, role, created_by)
    VALUES (NEW.user_id, NEW.role::text::public.app_role, auth.uid())
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT v_active THEN
    DELETE FROM public.user_roles WHERE user_id = NEW.user_id AND role::text = ANY (v_ops);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_operational_role_from_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_operational_role ON public.profiles;
CREATE TRIGGER trg_sync_operational_role
AFTER UPDATE OF role, approval_status, employment_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_operational_role_from_profile();
DROP TRIGGER IF EXISTS trg_sync_operational_role_ins ON public.profiles;
CREATE TRIGGER trg_sync_operational_role_ins AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_operational_role_from_profile();

CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_level text := public.gvps_actor_level();
  v_ops text[] := ARRAY['supervisor','rac','cpa','csa','consultant','sales_consultant','technical_consultant'];
  v_target_admin boolean;
  v_profile_role text;
BEGIN
  IF v_level IS NULL THEN
    RAISE EXCEPTION 'GVPS: apenas Gerente ou Administrador aprovado e ativo pode alterar cargos';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'GVPS: não é permitido alterar o próprio cargo';
  END IF;
  IF new_role IS NULL OR NOT (new_role = ANY (v_ops) OR new_role IN ('manager','admin')) THEN
    RAISE EXCEPTION 'Invalid role specified';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'GVPS: usuário alvo inexistente';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = target_user_id AND role = 'admin')
    INTO v_target_admin;

  IF new_role IN ('manager','admin') AND v_level <> 'admin' THEN
    RAISE EXCEPTION 'GVPS: somente Administrador pode conceder %', new_role;
  END IF;
  IF v_target_admin AND v_level <> 'admin' THEN
    RAISE EXCEPTION 'GVPS: somente Administrador pode alterar o cargo de um Administrador';
  END IF;

  v_profile_role := CASE WHEN new_role = 'admin' THEN 'manager' ELSE new_role END;

  INSERT INTO gvps_private.role_change_grants (txid, target, new_role, granted_by)
  VALUES (txid_current(), target_user_id, v_profile_role, auth.uid());

  UPDATE public.profiles SET role = v_profile_role, updated_at = now() WHERE user_id = target_user_id;
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (target_user_id, new_role::public.app_role, auth.uid());
  IF new_role = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role, created_by)
    VALUES (target_user_id, 'manager'::public.app_role, auth.uid());
  END IF;

  DELETE FROM gvps_private.role_change_grants
   WHERE txid = txid_current() AND target = target_user_id;

  PERFORM public.secure_log_security_event('user_role_updated', auth.uid(),
    jsonb_build_object('target_user_id', target_user_id, 'new_role', new_role,
                       'updated_by', auth.uid(), 'actor_level', v_level), 3);
END; $function$;
REVOKE ALL ON FUNCTION public.update_user_role_secure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_role_secure(uuid, text) TO authenticated;

REVOKE INSERT ON public.profiles FROM anon;