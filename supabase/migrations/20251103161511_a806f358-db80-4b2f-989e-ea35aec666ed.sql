-- Drop função existente para poder recriar com nova estrutura
DROP FUNCTION IF EXISTS public.get_secure_tasks_with_customer_protection();

-- Corrigir função get_user_security_level para verificar supervisor em user_roles
CREATE OR REPLACE FUNCTION public.get_user_security_level()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    -- Check admin in user_roles
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN 'admin'
    
    -- Check manager in profiles
    WHEN EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN 'manager'
    
    -- Check supervisor in user_roles (CORREÇÃO PRINCIPAL)
    WHEN has_role(auth.uid(), 'supervisor'::app_role) 
         AND EXISTS (
           SELECT 1 FROM profiles p 
           WHERE p.user_id = auth.uid() 
           AND p.approval_status = 'approved'
         ) THEN 'supervisor'
    
    -- Check RAC in profiles
    WHEN EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'rac' 
      AND p.approval_status = 'approved'
    ) THEN 'rac'
    
    -- Regular approved user
    WHEN EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.approval_status = 'approved'
    ) THEN 'user'
    
    ELSE 'none'
  END;
$$;