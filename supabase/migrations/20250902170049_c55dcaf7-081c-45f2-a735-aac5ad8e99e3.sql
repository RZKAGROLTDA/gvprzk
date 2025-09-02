-- CORREÇÃO DA RECURSÃO INFINITA NAS POLÍTICAS RLS DOS PROFILES

-- Passo 1: Dropar políticas problemáticas que causam recursão
DROP POLICY IF EXISTS "profile_select_manager" ON public.profiles;
DROP POLICY IF EXISTS "profile_update_own_safe_fields" ON public.profiles;
DROP POLICY IF EXISTS "profile_update_manager_all" ON public.profiles;

-- Passo 2: Criar funções auxiliares simples usando SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.simple_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users au 
    WHERE au.user_id = auth.uid() 
    AND au.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.simple_is_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.simple_get_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1),
    'none'
  );
$$;

-- Passo 3: Recriar políticas RLS corretas sem recursão

-- Política para usuários verem seus próprios perfis
CREATE POLICY "profile_select_own" ON public.profiles
FOR SELECT USING (user_id = auth.uid());

-- Política para managers verem todos os perfis (usando função auxiliar)
CREATE POLICY "profile_select_manager" ON public.profiles
FOR SELECT USING (public.simple_is_manager());

-- Política para usuários atualizarem apenas campos seguros de seus próprios perfis
CREATE POLICY "profile_update_own_basic" ON public.profiles
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() 
  AND role = OLD.role 
  AND approval_status = OLD.approval_status
  AND filial_id = OLD.filial_id
);

-- Política para managers atualizarem qualquer perfil (usando função auxiliar)
CREATE POLICY "profile_update_manager_all" ON public.profiles
FOR UPDATE 
USING (public.simple_is_manager())
WITH CHECK (public.simple_is_manager());

-- Política para inserir próprio perfil
CREATE POLICY "profile_insert_own" ON public.profiles
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Passo 4: Garantir que as funções auxiliares estão bem indexadas
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_manager ON profiles(user_id) WHERE role = 'manager' AND approval_status = 'approved';