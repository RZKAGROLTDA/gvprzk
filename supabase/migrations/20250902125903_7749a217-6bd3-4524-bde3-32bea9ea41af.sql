-- CRITICAL SECURITY FIX: Remove exposed customer data view and create secure replacement
-- This addresses the most critical vulnerability found in the security review

-- 1. DROP THE EXPOSED VIEW IMMEDIATELY (CRITICAL)
DROP VIEW IF EXISTS public.secure_tasks_view_final;

-- 2. CREATE SECURE CUSTOMER DATA ACCESS FUNCTION
CREATE OR REPLACE FUNCTION public.get_secure_customer_data_with_rls()
RETURNS TABLE(
  id uuid, name text, responsible text, client text, property text, filial text, 
  email text, phone text, sales_value numeric, is_masked boolean, access_level text,
  start_date date, end_date date, status text, priority text, task_type text, 
  observations text, created_at timestamp with time zone, created_by uuid, 
  updated_at timestamp with time zone, is_prospect boolean, sales_confirmed boolean,
  equipment_quantity integer, equipment_list jsonb, propertyhectares integer,
  initial_km integer, final_km integer, check_in_location jsonb, clientcode text,
  sales_type text, start_time text, end_time text, prospect_notes text,
  family_product text, photos text[], documents text[], partial_sales_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  current_user_filial uuid;
  high_value_threshold numeric := 25000;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Get current user's role and filial safely
  SELECT p.role, p.filial_id INTO current_user_role, current_user_filial
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- If no approved profile, deny access
  IF current_user_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found or not approved';
  END IF;
  
  -- Log customer data access attempt with high priority
  PERFORM public.secure_log_security_event(
    'secure_customer_data_access_with_rls',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'filial_id', current_user_filial,
      'access_type', 'protected_customer_data',
      'high_value_threshold', high_value_threshold
    ),
    4  -- High risk score for customer data access
  );
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- SECURE CLIENT NAME MASKING with role-based access
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.client
      WHEN current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
           AND EXISTS (
             SELECT 1 FROM public.profiles p 
             WHERE p.user_id = t.created_by 
             AND p.filial_id = current_user_filial
           ) 
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.client
      ELSE '[PROTECTED_CLIENT_' || substr(t.id::text, 1, 8) || ']'
    END as client,
    -- SECURE PROPERTY MASKING
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.property
      WHEN current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
           AND EXISTS (
             SELECT 1 FROM public.profiles p 
             WHERE p.user_id = t.created_by 
             AND p.filial_id = current_user_filial
           ) 
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.property
      ELSE '[PROTECTED_PROPERTY_' || substr(t.id::text, 1, 8) || ']'
    END as property,
    t.filial,
    -- SECURE EMAIL MASKING
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.email
      WHEN current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
           AND EXISTS (
             SELECT 1 FROM public.profiles p 
             WHERE p.user_id = t.created_by 
             AND p.filial_id = current_user_filial
           ) 
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.email
      ELSE 'protected@secure.data'
    END as email,
    -- SECURE PHONE MASKING
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.phone
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.phone
      WHEN current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
           AND EXISTS (
             SELECT 1 FROM public.profiles p 
             WHERE p.user_id = t.created_by 
             AND p.filial_id = current_user_filial
           ) 
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.phone
      ELSE '+55 (***) ****-****'
    END as phone,
    -- SECURE SALES VALUE MASKING
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.sales_value
      WHEN current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
           AND EXISTS (
             SELECT 1 FROM public.profiles p 
             WHERE p.user_id = t.created_by 
             AND p.filial_id = current_user_filial
           ) 
           AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.sales_value
      ELSE NULL
    END as sales_value,
    -- IS_MASKED FLAG
    NOT (
      current_user_role = 'manager' OR 
      t.created_by = auth.uid() OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      )) OR
      (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
       AND EXISTS (
         SELECT 1 FROM public.profiles p 
         WHERE p.user_id = t.created_by 
         AND p.filial_id = current_user_filial
       ) 
       AND COALESCE(t.sales_value, 0) <= high_value_threshold)
    ) as is_masked,
    -- ACCESS LEVEL
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN t.created_by = auth.uid() THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN 'supervisor'
      ELSE 'limited'
    END as access_level,
    -- Non-sensitive data (safe to expose)
    t.start_date,
    t.end_date,
    t.status,
    t.priority,
    t.task_type,
    -- SECURE OBSERVATIONS MASKING
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.observations
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.observations
      ELSE '[Content restricted for privacy protection]'
    END as observations,
    t.created_at,
    t.created_by,
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
    t.prospect_notes,
    t.family_product,
    t.photos,
    t.documents,
    t.partial_sales_value
  FROM public.tasks t
  WHERE (
    -- Apply strict access controls - only show tasks user has legitimate access to
    current_user_role = 'manager' OR
    t.created_by = auth.uid() OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = t.created_by 
      AND p.filial_id = current_user_filial
    )) OR
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM public.profiles p 
       WHERE p.user_id = t.created_by 
       AND p.filial_id = current_user_filial
     ) 
     AND COALESCE(t.sales_value, 0) <= high_value_threshold)
  )
  ORDER BY t.created_at DESC;
END;
$$;

-- 3. CREATE SECURITY MONITORING FUNCTION FOR HIGH-RISK ACCESS
CREATE OR REPLACE FUNCTION public.monitor_high_risk_customer_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_access_count integer;
BEGIN
  -- Count recent high-risk customer data access attempts
  SELECT COUNT(*) INTO recent_access_count
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND event_type LIKE '%customer%'
    AND created_at > now() - interval '1 hour'
    AND risk_score >= 3;
    
  -- Alert if excessive access detected
  IF recent_access_count > 20 THEN
    PERFORM public.secure_log_security_event(
      'excessive_customer_data_access_detected',
      auth.uid(),
      jsonb_build_object(
        'access_count', recent_access_count,
        'time_window', '1 hour',
        'alert_level', 'CRITICAL'
      ),
      5  -- Critical risk score
    );
  END IF;
END;
$$;

-- 4. FIX SECURITY DEFINER FUNCTION VULNERABILITIES
-- Update all functions to use proper search_path and validation

-- Fix the verify_customer_data_security function
CREATE OR REPLACE FUNCTION public.verify_customer_data_security()
RETURNS TABLE(table_name text, has_rls boolean, policy_count bigint, is_secure boolean, recommendation text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_name::text,
    t.row_security::boolean as has_rls,
    COALESCE(p.policy_count, 0) as policy_count,
    (t.row_security AND COALESCE(p.policy_count, 0) > 0) as is_secure,
    CASE 
      WHEN NOT t.row_security THEN 'CRITICAL: Enable RLS on this table immediately'
      WHEN COALESCE(p.policy_count, 0) = 0 THEN 'HIGH: Add RLS policies to protect this table'
      ELSE 'Table appears secure with RLS and policies'
    END::text as recommendation
  FROM (
    SELECT schemaname, tablename as table_name, rowsecurity as row_security
    FROM pg_tables 
    WHERE schemaname = 'public'
    AND tablename IN ('tasks', 'clients', 'profiles', 'security_audit_log', 'products', 'reminders')
  ) t
  LEFT JOIN (
    SELECT schemaname, tablename, COUNT(*) as policy_count
    FROM pg_policies 
    WHERE schemaname = 'public'
    GROUP BY schemaname, tablename
  ) p ON t.table_name = p.tablename;
END;
$$;