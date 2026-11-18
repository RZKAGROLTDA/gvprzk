-- GVPS — Sincronização automática do cargo operacional (perfil -> user_roles)
-- STATUS: PREPARADO, NÃO EXECUTADO. Requer autorização explícita.
--
-- Regras:
-- 1. Ao aprovar, trocar cargo ou reativar (aprovado + ativo), grava em user_roles
--    o cargo OPERACIONAL do perfil e remove cargos operacionais antigos.
-- 2. Cargos operacionais: supervisor, rac, cpa, csa, consultant,
--    sales_consultant, technical_consultant.
-- 3. admin e manager NUNCA são criados nem removidos por esta regra
--    (continuam via concessão explícita em update_user_role_secure).
-- 4. Perfil com cargo admin/manager: nada é concedido automaticamente.
-- 5. Usuário inativo ou não aprovado: cargos operacionais removidos
--    (mesmo efeito prático da desativação atual); admin/manager intocados.
-- 6. Não altera filiais, vínculos, atividades ou dados comerciais.

CREATE OR REPLACE FUNCTION public.sync_operational_role_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ops text[] := ARRAY['supervisor','rac','cpa','csa','consultant','sales_consultant','technical_consultant'];
  v_active boolean;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
     AND NEW.employment_status IS NOT DISTINCT FROM OLD.employment_status THEN
    RETURN NEW;
  END IF;

  v_active := NEW.approval_status = 'approved'
              AND coalesce(NEW.employment_status::text, 'active') = 'active';

  IF v_active AND NEW.role::text = ANY (v_ops) THEN
    DELETE FROM public.user_roles
     WHERE user_id = NEW.user_id
       AND role::text = ANY (v_ops)
       AND role::text <> NEW.role::text;
    INSERT INTO public.user_roles (user_id, role, created_by)
    VALUES (NEW.user_id, NEW.role::text::public.app_role, auth.uid())
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT v_active THEN
    DELETE FROM public.user_roles
     WHERE user_id = NEW.user_id
       AND role::text = ANY (v_ops);
  END IF;
  -- Perfil admin/manager ativo: nenhuma concessão automática.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_operational_role_from_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_operational_role ON public.profiles;
CREATE TRIGGER trg_sync_operational_role
AFTER UPDATE OF role, approval_status, employment_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_operational_role_from_profile();

-- REVERSÃO:
-- DROP TRIGGER IF EXISTS trg_sync_operational_role ON public.profiles;
-- DROP FUNCTION IF EXISTS public.sync_operational_role_from_profile();
