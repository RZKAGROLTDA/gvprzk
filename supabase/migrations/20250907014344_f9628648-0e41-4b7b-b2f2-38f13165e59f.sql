-- PHASE 1: Critical Security Fixes - Database Level
-- Fix high-value sales access control and function security

-- 1. Fix function security by adding proper search_path to all SECURITY DEFINER functions
-- Update get_secure_customer_data_enhanced function
CREATE OR REPLACE FUNCTION public.get_secure_customer_data_enhanced()
 RETURNS TABLE(id uuid, name text, responsible text, client text, property text, filial text, email text, phone text, sales_value numeric, is_masked boolean, access_level text, start_date date, end_date date, status text, priority text, task_type text, observations text, created_at timestamp with time zone, created_by uuid, updated_at timestamp with time zone, is_prospect boolean, sales_confirmed boolean, equipment_quantity integer, equipment_list jsonb, propertyhectares integer, initial_km integer, final_km integer, check_in_location jsonb, clientcode text, sales_type text, start_time text, end_time text, prospect_notes text, family_product text, photos text[], documents text[], partial_sales_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_user_filial uuid;
  high_value_threshold numeric := 15000; -- LOWERED from 25000 for better security
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, current_user_filial
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- If no approved profile, return empty
  IF current_user_role IS NULL THEN
    RETURN;
  END IF;
  
  -- Log customer data access attempt with higher risk score
  PERFORM public.secure_log_security_event(
    'customer_data_access_enhanced',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'filial_id', current_user_filial,
      'access_type', 'bulk_customer_data',
      'high_value_threshold', high_value_threshold
    ),
    4 -- Increased risk score
  );
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- ENHANCED CLIENT NAME MASKING with stricter controls
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
      ELSE '[PROTECTED_CLIENT]'
    END as client,
    -- ENHANCED PROPERTY MASKING
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
      ELSE '[PROTECTED_PROPERTY]'
    END as property,
    t.filial,
    -- ENHANCED EMAIL MASKING
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
    -- ENHANCED PHONE MASKING
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
    -- ENHANCED SALES VALUE MASKING with stricter threshold
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
    -- Enhanced masking flag
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
    t.start_date,
    t.end_date,
    t.status,
    t.priority,
    t.task_type,
    t.observations,
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
    -- Enhanced access controls with stricter threshold
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
$function$;

-- 2. Create enhanced high-value sales monitoring function
CREATE OR REPLACE FUNCTION public.monitor_high_value_sales_access()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role text;
  high_value_count integer;
BEGIN
  -- Get user role
  SELECT p.role INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
  
  -- Count high-value sales access attempts in last hour
  SELECT COUNT(*) INTO high_value_count
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND event_type LIKE '%high_value%'
    AND created_at > now() - interval '1 hour';
    
  -- Alert if non-manager accessing too many high-value records
  IF user_role != 'manager' AND high_value_count > 5 THEN
    PERFORM public.secure_log_security_event(
      'excessive_high_value_sales_access',
      auth.uid(),
      jsonb_build_object(
        'user_role', user_role,
        'access_count', high_value_count,
        'time_window', '1 hour',
        'alert_level', 'CRITICAL'
      ),
      5
    );
  END IF;
END;
$function$;

-- 3. Update tasks RLS policy with stricter high-value controls
DROP POLICY IF EXISTS "secure_task_select" ON public.tasks;
CREATE POLICY "secure_task_select_enhanced" ON public.tasks
FOR SELECT 
USING (
  (auth.uid() = created_by) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = tasks.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  )) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = tasks.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p1.approval_status = 'approved'
    AND COALESCE(tasks.sales_value, 0) <= 15000 -- LOWERED threshold
  ))
);

-- 4. Create secure data export function to replace direct queries
CREATE OR REPLACE FUNCTION public.get_secure_export_data(
  start_date_param date DEFAULT NULL,
  end_date_param date DEFAULT NULL,
  filial_filter_param text DEFAULT NULL
)
 RETURNS TABLE(
   id uuid, name text, responsible text, client text, property text, 
   filial text, email text, phone text, sales_value numeric,
   start_date date, end_date date, status text, task_type text,
   created_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  export_count integer := 0;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for data export';
  END IF;
  
  -- Get user role
  SELECT p.role INTO current_user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- Only managers and supervisors can export data
  IF current_user_role NOT IN ('manager', 'supervisor') THEN
    RAISE EXCEPTION 'Insufficient permissions for data export';
  END IF;
  
  -- Log export attempt
  PERFORM public.secure_log_security_event(
    'secure_data_export_attempt',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'start_date', start_date_param,
      'end_date', end_date_param,
      'filial_filter', filial_filter_param
    ),
    4 -- High risk score for exports
  );
  
  -- Return secure data using existing function
  RETURN QUERY
  SELECT 
    t.id, t.name, t.responsible, t.client, t.property,
    t.filial, t.email, t.phone, t.sales_value,
    t.start_date, t.end_date, t.status, t.task_type,
    t.created_at
  FROM public.get_secure_customer_data_enhanced() t
  WHERE (
    (start_date_param IS NULL OR t.start_date >= start_date_param) AND
    (end_date_param IS NULL OR t.end_date <= end_date_param) AND
    (filial_filter_param IS NULL OR filial_filter_param = 'all' OR t.filial = filial_filter_param)
  );
  
  -- Get count for logging
  GET DIAGNOSTICS export_count = ROW_COUNT;
  
  -- Log successful export
  PERFORM public.secure_log_security_event(
    'secure_data_export_completed',
    auth.uid(),
    jsonb_build_object(
      'record_count', export_count,
      'user_role', current_user_role
    ),
    3
  );
END;
$function$;