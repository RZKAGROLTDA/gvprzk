-- CARGOS_SINCRONIZACAO v3 — NÃO EXECUTADO. Aguarda autorização.
-- Mudanças sobre a v2:
--  (a) auth.uid() IS NULL deixa de ser "privilegiado". Só são internos:
--      JWT com role=service_role, ou sessão sem JWT de usuário aberta por
--      postgres/supabase_admin (migração/SQL controlado). anon é bloqueado.
--  (b) Conflito Gerente/Admin x cargo operacional: a operação é BLOQUEADA com
--      motivo, nunca remove cargo elevado. Única exceção: update_user_role_secure,
--      que sinaliza a troca autorizada por uma marca local da transação.
--  (c) Operacional -> Gerente/Admin: limpa o operacional só se o cargo elevado
--      já existir em user_roles (concedido explicitamente). Nunca concede.

-- 0) Origem da execução
CREATE OR REPLACE FUNCTION public.gvps_is_internal_process()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role','') = 'service_role'
      OR (coalesce(current_setting('request.jwt.claims', true),'') IN ('','{}')
          AND session_user IN ('postgres','supabase_admin'));
$$;
REVOKE ALL ON FUNCTION public.gvps_is_internal_process() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gvps_is_approved_admin_or_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
     AND EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = auth.uid() AND p.approval_status = 'approved');
$$;
REVOKE ALL ON FUNCTION public.gvps_is_approved_admin_or_manager() FROM PUBLIC, anon, authenticated;

-- 1) Guarda na criação de perfil
CREATE OR REPLACE FUNCTION public.guard_profile_insert_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.gvps_is_internal_process() OR public.gvps_is_approved_admin_or_manager() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'GVPS: criação de perfil sem usuário autenticado não permitida';
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'GVPS: só é permitido criar o próprio perfil';
  END IF;
  NEW.approval_status := 'pending';   -- autoaprovação impossível
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_profile_insert_privileges() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_profile_insert ON public.profiles;
CREATE TRIGGER trg_guard_profile_insert BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_insert_privileges();

-- 2) Sincronização
CREATE OR REPLACE FUNCTION public.sync_operational_role_from_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ops text[] := ARRAY['supervisor','rac','cpa','csa','consultant','sales_consultant','technical_consultant'];
  v_active boolean;
  v_elevated text[];
BEGIN
  -- Troca feita por update_user_role_secure: ela mesma grava user_roles.
  IF current_setting('gvps.authorized_role_change', true) = NEW.user_id::text THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
     AND NEW.employment_status IS NOT DISTINCT FROM OLD.employment_status THEN
    RETURN NEW;
  END IF;

  v_active := NEW.approval_status = 'approved'
              AND coalesce(NEW.employment_status::text,'active') = 'active';

  SELECT coalesce(array_agg(role::text), '{}') INTO v_elevated
    FROM public.user_roles WHERE user_id = NEW.user_id AND role::text IN ('admin','manager');

  IF v_active AND NEW.role::text = ANY (v_ops) THEN
    IF cardinality(v_elevated) > 0 THEN
      RAISE EXCEPTION 'GVPS: usuário possui cargo % em user_roles; mudar para % exige a troca administrativa de cargo (update_user_role_secure). Operação bloqueada.',
        array_to_string(v_elevated, ','), NEW.role;
    END IF;
    DELETE FROM public.user_roles
     WHERE user_id = NEW.user_id AND role::text = ANY (v_ops) AND role::text <> NEW.role::text;
    INSERT INTO public.user_roles (user_id, role, created_by)
    VALUES (NEW.user_id, NEW.role::text::public.app_role, auth.uid())
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF v_active AND NEW.role::text IN ('manager','admin') THEN
    -- Nunca concede. Limpa operacional só se o elevado já foi concedido.
    IF NEW.role::text = ANY (v_elevated) THEN
      DELETE FROM public.user_roles
       WHERE user_id = NEW.user_id AND role::text = ANY (v_ops);
    END IF;

  ELSIF NOT v_active THEN
    -- Desativação/reprovação: remove só operacionais; elevados intocados.
    DELETE FROM public.user_roles
     WHERE user_id = NEW.user_id AND role::text = ANY (v_ops);
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

-- 3) update_user_role_secure: comportamento idêntico ao atual + marca de troca
--    autorizada (local à transação; set_config não é exposto pela API).
--    A checagem do chamador por profiles.role é mantida aqui e tratada na
--    análise separada de funções antigas.
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE calling_user_role TEXT;
BEGIN
  SELECT role INTO calling_user_role FROM public.profiles
   WHERE user_id = auth.uid() AND approval_status = 'approved' LIMIT 1;
  IF calling_user_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Only managers can update user roles';
  END IF;
  IF new_role NOT IN ('manager','supervisor','rac','consultant','sales_consultant','technical_consultant','cpa','csa','admin') THEN
    RAISE EXCEPTION 'Invalid role specified';
  END IF;
  PERFORM set_config('gvps.authorized_role_change', target_user_id::text, true);
  UPDATE public.profiles SET role = new_role, updated_at = now() WHERE user_id = target_user_id;
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (target_user_id, new_role::app_role, auth.uid()) ON CONFLICT (user_id, role) DO NOTHING;
  PERFORM set_config('gvps.authorized_role_change', '', true);
  PERFORM public.secure_log_security_event('user_role_updated', auth.uid(),
    jsonb_build_object('target_user_id', target_user_id, 'new_role', new_role, 'updated_by', auth.uid()), 3);
END; $function$;

-- 4) Defesa extra: anon não precisa inserir perfis
REVOKE INSERT ON public.profiles FROM anon;

-- REVERSÃO:
-- DROP TRIGGER IF EXISTS trg_sync_operational_role_ins ON public.profiles;
-- DROP TRIGGER IF EXISTS trg_sync_operational_role ON public.profiles;
-- DROP TRIGGER IF EXISTS trg_guard_profile_insert ON public.profiles;
-- DROP FUNCTION IF EXISTS public.sync_operational_role_from_profile();
-- DROP FUNCTION IF EXISTS public.guard_profile_insert_privileges();
-- DROP FUNCTION IF EXISTS public.gvps_is_approved_admin_or_manager();
-- DROP FUNCTION IF EXISTS public.gvps_is_internal_process();
-- (update_user_role_secure: recriar a versão atual, sem as duas linhas set_config)
-- GRANT INSERT ON public.profiles TO anon;
