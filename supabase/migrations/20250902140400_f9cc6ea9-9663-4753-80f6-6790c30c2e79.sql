-- CRITICAL SECURITY FIX: Enhanced Customer Data Protection
-- This migration addresses the security vulnerability where customer email and phone data could be accessed inappropriately

-- 1. Create enhanced secure functions with field-level masking
CREATE OR REPLACE FUNCTION public.get_user_security_level()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN 'manager'
    WHEN EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'supervisor' 
      AND p.approval_status = 'approved'
    ) THEN 'supervisor'
    WHEN EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.approval_status = 'approved'
    ) THEN 'user'
    ELSE 'none'
  END;
$$;

-- 2. Create enhanced secure task data function with strict customer data protection
CREATE OR REPLACE FUNCTION public.get_secure_tasks_with_customer_protection()
RETURNS TABLE(
  id uuid,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  email text,
  phone text,
  sales_value numeric,
  start_date date,
  end_date date,
  task_type text,
  status text,
  priority text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  is_prospect boolean,
  sales_confirmed boolean,
  equipment_quantity integer,
  equipment_list jsonb,
  propertyhectares integer,
  initial_km integer,
  final_km integer,
  check_in_location jsonb,
  clientcode text,
  sales_type text,
  start_time text,
  end_time text,
  observations text,
  prospect_notes text,
  family_product text,
  photos text[],
  documents text[],
  partial_sales_value numeric,
  is_customer_data_masked boolean,
  access_level text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_security_level text;
  current_user_filial uuid;
  high_value_threshold numeric := 25000;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user security level and filial
  user_security_level := public.get_user_security_level();
  
  IF user_security_level = 'none' THEN
    RETURN;
  END IF;
  
  -- Get user filial
  SELECT p.filial_id INTO current_user_filial
  FROM profiles p 
  WHERE p.user_id = auth.uid();
  
  -- Log customer data access
  PERFORM public.secure_log_security_event(
    'secure_customer_task_access',
    auth.uid(),
    jsonb_build_object(
      'user_security_level', user_security_level,
      'filial_id', current_user_filial,
      'high_value_threshold', high_value_threshold
    ),
    2
  );
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Client name protection
    CASE 
      WHEN user_security_level = 'manager' 
           OR t.created_by = auth.uid() THEN t.client
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           ) THEN t.client
      WHEN user_security_level = 'user'
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           )
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.client
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
    END as client,
    
    -- Property protection  
    CASE 
      WHEN user_security_level = 'manager' 
           OR t.created_by = auth.uid() THEN t.property
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           ) THEN t.property
      WHEN user_security_level = 'user'
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           )
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.property
      ELSE LEFT(t.property, 2) || '***' || RIGHT(t.property, 1)
    END as property,
    
    t.filial,
    
    -- CRITICAL: Email protection
    CASE 
      WHEN user_security_level = 'manager' 
           OR t.created_by = auth.uid() THEN t.email
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           ) THEN t.email
      WHEN user_security_level = 'user'
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           )
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.email
      ELSE 
        CASE 
          WHEN t.email IS NOT NULL AND t.email != '' THEN
            SUBSTRING(t.email FROM 1 FOR 1) || '***@***.' || 
            CASE 
              WHEN POSITION('.' IN REVERSE(t.email)) > 0 THEN 
                RIGHT(t.email, POSITION('.' IN REVERSE(t.email)) - 1)
              ELSE 'com'
            END
          ELSE NULL
        END
    END as email,
    
    -- CRITICAL: Phone protection  
    CASE 
      WHEN user_security_level = 'manager' 
           OR t.created_by = auth.uid() THEN t.phone
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           ) THEN t.phone
      WHEN user_security_level = 'user'
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           )
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.phone
      ELSE 
        CASE 
          WHEN t.phone IS NOT NULL AND t.phone != '' THEN '(***) ***-' || RIGHT(t.phone, 4)
          ELSE NULL
        END
    END as phone,
    
    -- Sales value protection
    CASE 
      WHEN user_security_level = 'manager' 
           OR t.created_by = auth.uid() THEN t.sales_value
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           ) THEN t.sales_value
      WHEN user_security_level = 'user'
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           )
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    -- Non-sensitive data
    t.start_date,
    t.end_date,
    t.task_type,
    t.status,
    t.priority,
    t.created_by,
    t.created_at,
    t.updated_at,
    t.is_prospect,
    t.sales_confirmed,
    t.equipment_quantity,
    t.equipment_list,
    t.propertyhectares,
    t.initial_km,
    t.final_km,
    t.check_in_location,
    t.clientcode,
    t.sales_type,
    t.start_time,
    t.end_time,
    
    -- Observations protection
    CASE 
      WHEN user_security_level = 'manager' 
           OR t.created_by = auth.uid() THEN t.observations
      WHEN user_security_level = 'supervisor' 
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           ) THEN t.observations
      ELSE '[Content restricted for privacy protection]'
    END as observations,
    
    t.prospect_notes,
    t.family_product,
    t.photos,
    t.documents,
    t.partial_sales_value,
    
    -- Masking indicator
    NOT (
      user_security_level = 'manager' OR 
      t.created_by = auth.uid() OR
      (user_security_level = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = t.created_by 
        AND p2.filial_id = current_user_filial
      )) OR
      (user_security_level = 'user'
       AND EXISTS (
         SELECT 1 FROM profiles p2 
         WHERE p2.user_id = t.created_by 
         AND p2.filial_id = current_user_filial
       ) 
       AND COALESCE(t.sales_value, 0) <= high_value_threshold)
    ) as is_customer_data_masked,
    
    -- Access level indicator
    CASE 
      WHEN user_security_level = 'manager' THEN 'full_manager'
      WHEN t.created_by = auth.uid() THEN 'owner'
      WHEN user_security_level = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p2 
        WHERE p2.user_id = t.created_by 
        AND p2.filial_id = current_user_filial
      ) THEN 'supervisor_filial'
      WHEN user_security_level = 'user'
           AND EXISTS (
             SELECT 1 FROM profiles p2 
             WHERE p2.user_id = t.created_by 
             AND p2.filial_id = current_user_filial
           ) THEN 'limited_filial'
      ELSE 'restricted'
    END as access_level
    
  FROM tasks t
  WHERE (
    -- Strict access control
    user_security_level = 'manager' OR
    t.created_by = auth.uid() OR
    (user_security_level = 'supervisor' AND EXISTS (
      SELECT 1 FROM profiles p2 
      WHERE p2.user_id = t.created_by 
      AND p2.filial_id = current_user_filial
    )) OR
    (user_security_level = 'user' 
     AND EXISTS (
       SELECT 1 FROM profiles p2 
       WHERE p2.user_id = t.created_by 
       AND p2.filial_id = current_user_filial
     ))
  )
  ORDER BY t.created_at DESC;
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_security_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_secure_tasks_with_customer_protection TO authenticated;

-- 4. Create monitoring function for unauthorized customer data access attempts
CREATE OR REPLACE FUNCTION public.monitor_unauthorized_customer_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log any attempts to access customer data inappropriately
  PERFORM public.secure_log_security_event(
    'unauthorized_customer_data_attempt',
    auth.uid(),
    jsonb_build_object(
      'attempted_access', 'customer_email_phone_data',
      'security_level', public.get_user_security_level(),
      'blocked', true
    ),
    4 -- High risk
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.monitor_unauthorized_customer_access TO authenticated;