-- ==============================================
-- CORREÇÃO DAS QUESTÕES DE SEGURANÇA RESTANTES
-- ==============================================

-- CORRIGIR FUNÇÃO COM search_path MUTABLE
DROP FUNCTION IF EXISTS simple_is_admin();
CREATE OR REPLACE FUNCTION public.simple_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'manager'
    LIMIT 1
  );
$$;

-- ADICIONAR POLÍTICAS FALTANTES PARA TABELAS SEM RLS
CREATE POLICY "Invitations admin only" ON user_invitations
FOR ALL USING (simple_is_admin())
WITH CHECK (simple_is_admin());

CREATE POLICY "Directory cache admin manage" ON user_directory_cache
FOR ALL USING (simple_is_admin())
WITH CHECK (simple_is_admin());

-- REMOVER VIEWS SECURITY DEFINER SE EXISTIREM
DROP VIEW IF EXISTS secure_tasks_view;

-- OTIMIZAR ÍNDICES PARA CONSULTAS DE PROFILE
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_role ON profiles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_filial_approved ON profiles(filial_id, approval_status) WHERE approval_status = 'approved';

-- VACUUM PARA LIMPEZA FINAL
VACUUM ANALYZE profiles;
VACUUM ANALYZE security_audit_log;
VACUUM ANALYZE audit_log;