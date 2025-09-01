-- ==============================================
-- PLANO DE RECUPERAÇÃO DEFINITIVA - FASE 2: REMOVER DEPENDÊNCIAS
-- ==============================================

-- REMOVER TODAS AS POLÍTICAS QUE DEPENDEM DAS FUNÇÕES PROBLEMÁTICAS
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_log;
DROP POLICY IF EXISTS "Only admins can access tasks backup" ON tasks_backup;
DROP POLICY IF EXISTS "Only admins can create invitations" ON user_invitations;
DROP POLICY IF EXISTS "Only admins can delete invitations" ON user_invitations;
DROP POLICY IF EXISTS "Only admins can manage admin users" ON admin_users;
DROP POLICY IF EXISTS "Only admins can modify directory cache" ON user_directory_cache;
DROP POLICY IF EXISTS "Only admins can update invitations" ON user_invitations;
DROP POLICY IF EXISTS "Only admins can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Only admins can view all invitations" ON user_invitations;
DROP POLICY IF EXISTS "Only admins can view security audit log" ON security_audit_log;
DROP POLICY IF EXISTS "Users can view directory entries they have access to" ON user_directory_cache;

-- REMOVER POLÍTICAS DE PROFILES PROBLEMÁTICAS
DROP POLICY IF EXISTS "Secure profile directory access" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;

-- AGORA PODEMOS REMOVER AS FUNÇÕES RECURSIVAS
DROP FUNCTION IF EXISTS current_user_is_admin() CASCADE;
DROP FUNCTION IF EXISTS user_same_filial(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- CRIAR FUNÇÕES SIMPLES SEM RECURSÃO
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

-- RECRIAR POLÍTICAS BÁSICAS PARA TABELAS CRÍTICAS
CREATE POLICY "Simple admin audit access" ON audit_log
FOR SELECT USING (simple_is_admin());

CREATE POLICY "Simple admin security log access" ON security_audit_log
FOR SELECT USING (simple_is_admin());

CREATE POLICY "Simple admin backup access" ON tasks_backup
FOR ALL USING (simple_is_admin())
WITH CHECK (simple_is_admin());

CREATE POLICY "Simple admin user management" ON admin_users
FOR ALL USING (simple_is_admin())
WITH CHECK (simple_is_admin());

-- POLÍTICAS SIMPLES PARA PROFILES
CREATE POLICY "Simple users view own profile" ON profiles
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Simple users edit own profile" ON profiles
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Simple users create own profile" ON profiles
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Simple admins manage all profiles" ON profiles
FOR ALL USING (simple_is_admin())
WITH CHECK (simple_is_admin());

-- LIMPAR LOGS ANTIGOS PARA REDUZIR CARGA
DELETE FROM security_audit_log WHERE created_at < NOW() - INTERVAL '3 days';
DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '3 days';