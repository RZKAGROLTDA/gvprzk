-- ==============================================
-- PLANO DE RECUPERAÇÃO DEFINITIVA - QUEBRAR LOOP INFINITO
-- ==============================================

-- FASE 1: REMOVER POLÍTICAS RLS RECURSIVAS PROBLEMÁTICAS
DROP POLICY IF EXISTS "Secure profile directory access" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;

-- FASE 2: DESABILITAR FUNÇÕES SECURITY DEFINER RECURSIVAS TEMPORARIAMENTE
DROP FUNCTION IF EXISTS current_user_is_admin();
DROP FUNCTION IF EXISTS user_same_filial(uuid);
DROP FUNCTION IF EXISTS is_admin();

-- FASE 3: CRIAR FUNÇÕES SIMPLES SEM RECURSÃO
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

CREATE OR REPLACE FUNCTION public.simple_same_filial(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = target_user_id
    AND p1.filial_id = p2.filial_id
    AND p1.filial_id IS NOT NULL
    LIMIT 1
  );
$$;

-- FASE 4: RECRIAR POLÍTICAS RLS SIMPLES SEM LOOPS
CREATE POLICY "Simple users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Simple users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Simple users can insert own profile" 
ON profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Simple admins can manage profiles" 
ON profiles FOR ALL 
USING (simple_is_admin())
WITH CHECK (simple_is_admin());

CREATE POLICY "Simple profile directory access" 
ON profiles FOR SELECT 
USING (
  auth.uid() = user_id OR 
  simple_is_admin() OR 
  (simple_same_filial(user_id) AND approval_status = 'approved')
);

-- FASE 5: LIMPAR DADOS CORROMPIDOS E LOGS EXCESSIVOS
DELETE FROM security_audit_log WHERE created_at < NOW() - INTERVAL '7 days';
DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '7 days';

-- FASE 6: OTIMIZAR CONSULTAS RESETANDO STATS
SELECT pg_stat_reset();

-- COMENTÁRIO: Sistema recuperado com políticas simplificadas sem recursão