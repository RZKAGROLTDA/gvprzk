-- Corrigir recursão infinita nas políticas RLS da tabela profiles

-- Primeiro, dropar a política problemática
DROP POLICY IF EXISTS "Users can view profiles from same filial" ON public.profiles;

-- Dropar a política de admin duplicada  
DROP POLICY IF EXISTS "Admins podem gerenciar todos os perfis" ON public.profiles;

-- Recriar a política para visualização de perfis sem recursão
-- Usuários podem ver todos os perfis (necessário para funcionalidade do sistema)
CREATE POLICY "Users can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Manter apenas a política de admin para gerenciamento total
CREATE POLICY "Admins can manage all profiles" 
ON public.profiles 
FOR ALL 
USING (is_admin());

-- Atualizar a função get_user_filial_id para não causar recursão
CREATE OR REPLACE FUNCTION public.get_user_filial_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT filial_id FROM public.profiles 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;