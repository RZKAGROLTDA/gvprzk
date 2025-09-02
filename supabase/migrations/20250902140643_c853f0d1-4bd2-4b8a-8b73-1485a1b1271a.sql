-- CRITICAL SECURITY FIX: Protect Customer Email Data in tasks_new Table
-- This migration adds field-level protection for customer email data to prevent unauthorized access

-- 1. Create secure function for tasks_new with customer data protection
CREATE OR REPLACE FUNCTION public.get_secure_tasks_new_with_customer_protection()
RETURNS TABLE(
  id uuid,
  vendedor_id uuid,
  data date,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  tipo text,
  cliente_nome text,
  cliente_email text,
  filial text,
  notas text,
  is_customer_data_masked boolean,
  access_level text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_security_level text;
  current_user_filial text;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user security level
  user_security_level := public.get_user_security_level();
  
  IF user_security_level = 'none' THEN
    RETURN;
  END IF;
  
  -- Get user filial from profiles
  SELECT p.filial_id::text INTO current_user_filial
  FROM profiles p 
  WHERE p.user_id = auth.uid();
  
  -- Log customer data access
  PERFORM public.secure_log_security_event(
    'secure_tasks_new_customer_access',
    auth.uid(),
    jsonb_build_object(
      'user_security_level', user_security_level,
      'user_filial', current_user_filial,
      'table', 'tasks_new'
    ),
    3 -- Higher risk for customer email access
  );
  
  RETURN QUERY
  SELECT 
    tn.id,
    tn.vendedor_id,
    tn.data,
    tn.created_at,
    tn.updated_at,
    tn.tipo,
    -- Client name protection
    CASE 
      WHEN user_security_level = 'manager' 
           OR tn.vendedor_id = auth.uid() THEN tn.cliente_nome
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = tn.vendedor_id 
             AND p2.filial_id::text = current_user_filial
           ) THEN tn.cliente_nome
      ELSE LEFT(tn.cliente_nome, 2) || '***' || RIGHT(tn.cliente_nome, 1)
    END as cliente_nome,
    
    -- CRITICAL: Email protection
    CASE 
      WHEN user_security_level = 'manager' 
           OR tn.vendedor_id = auth.uid() THEN tn.cliente_email
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = tn.vendedor_id 
             AND p2.filial_id::text = current_user_filial
           ) THEN tn.cliente_email
      ELSE 
        CASE 
          WHEN tn.cliente_email IS NOT NULL AND tn.cliente_email != '' THEN
            SUBSTRING(tn.cliente_email FROM 1 FOR 1) || '***@***.' || 
            CASE 
              WHEN POSITION('.' IN REVERSE(tn.cliente_email)) > 0 THEN 
                RIGHT(tn.cliente_email, POSITION('.' IN REVERSE(tn.cliente_email)) - 1)
              ELSE 'com'
            END
          ELSE NULL
        END
    END as cliente_email,
    
    tn.filial,
    -- Notes protection (may contain sensitive info)
    CASE 
      WHEN user_security_level = 'manager' 
           OR tn.vendedor_id = auth.uid() THEN tn.notas
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = tn.vendedor_id 
             AND p2.filial_id::text = current_user_filial
           ) THEN tn.notas
      ELSE '[Content restricted for privacy protection]'
    END as notas,
    
    -- Masking indicator
    NOT (
      user_security_level = 'manager' OR 
      tn.vendedor_id = auth.uid() OR
      (user_security_level = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = tn.vendedor_id 
        AND p2.filial_id::text = current_user_filial
      ))
    ) as is_customer_data_masked,
    
    -- Access level indicator
    CASE 
      WHEN user_security_level = 'manager' THEN 'full_manager'
      WHEN tn.vendedor_id = auth.uid() THEN 'owner'
      WHEN user_security_level = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = tn.vendedor_id 
        AND p2.filial_id::text = current_user_filial
      ) THEN 'supervisor_filial'
      ELSE 'restricted'
    END as access_level
    
  FROM tasks_new tn
  WHERE (
    -- Strict access control - only show tasks user has legitimate access to
    user_security_level = 'manager' OR
    tn.vendedor_id = auth.uid() OR
    (user_security_level = 'supervisor' AND EXISTS (
      SELECT 1 FROM profiles p2 
      WHERE p2.user_id = tn.vendedor_id 
      AND p2.filial_id::text = current_user_filial
    ))
  )
  ORDER BY tn.created_at DESC;
END;
$$;

-- 2. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_secure_tasks_new_with_customer_protection TO authenticated;

-- 3. Create monitoring function for unauthorized customer email access attempts
CREATE OR REPLACE FUNCTION public.monitor_tasks_new_unauthorized_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log any attempts to access customer email data inappropriately
  PERFORM public.secure_log_security_event(
    'unauthorized_tasks_new_customer_data_attempt',
    auth.uid(),
    jsonb_build_object(
      'attempted_access', 'tasks_new_customer_email_data',
      'security_level', public.get_user_security_level(),
      'table', 'tasks_new',
      'blocked', true
    ),
    4 -- High risk
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.monitor_tasks_new_unauthorized_access TO authenticated;