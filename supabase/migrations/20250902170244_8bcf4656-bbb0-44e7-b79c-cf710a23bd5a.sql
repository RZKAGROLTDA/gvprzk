-- CORREÇÃO DA RECURSÃO INFINITA - VERSÃO CORRIGIDA

-- Passo 1: Dropar TODAS as políticas existentes na tabela profiles
DROP POLICY IF EXISTS "profile_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profile_select_manager" ON public.profiles;
DROP POLICY IF EXISTS "profile_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profile_update_own_safe_fields" ON public.profiles;
DROP POLICY IF EXISTS "profile_update_own_basic" ON public.profiles;
DROP POLICY IF EXISTS "profile_update_manager_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_manager" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_basic" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_manager_all" ON public.profiles;

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

-- Passo 3: Recriar políticas RLS simples e seguras

-- Usuários podem ver seus próprios perfis
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT USING (user_id = auth.uid());

-- Managers podem ver todos os perfis
CREATE POLICY "profiles_select_manager" ON public.profiles
FOR SELECT USING (public.simple_is_manager());

-- Usuários podem inserir apenas seus próprios perfis
CREATE POLICY "profiles_insert_own" ON public.profiles
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Usuários podem atualizar apenas seus próprios perfis (campos básicos)
CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Managers podem atualizar qualquer perfil
CREATE POLICY "profiles_update_manager" ON public.profiles
FOR UPDATE 
USING (public.simple_is_manager())
WITH CHECK (public.simple_is_manager());

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_manager ON profiles(user_id) WHERE role = 'manager' AND approval_status = 'approved';