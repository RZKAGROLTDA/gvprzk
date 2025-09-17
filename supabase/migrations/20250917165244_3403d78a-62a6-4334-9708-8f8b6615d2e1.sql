-- Critical Security Fixes Implementation
-- Phase 1: Database Security Hardening

-- 1. Lower high-value sales threshold from 15,000 to 10,000 for better security
-- Update the main secure customer data function
CREATE OR REPLACE FUNCTION public.get_secure_customer_data_enhanced()
 RETURNS TABLE(id uuid, name text, responsible text, client text, property text, filial text, email text, phone text, sales_value numeric, is_masked boolean, access_level text, start_date date, end_date date, status text, priority text, task_type text, observations text, created_at timestamp with time zone, created_by uuid, updated_at timestamp with time zone, is_prospect boolean, sales_confirmed boolean, equipment_quantity integer, equipment_list jsonb, propertyhectares integer, initial_km integer, final_km integer, check_in_location jsonb, clientcode text, sales_type text, start_time text, end_time text, prospect_notes text, family_product text, photos text[], documents text[], partial_sales_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_user_filial uuid;
  high_value_threshold numeric := 10000; -- LOWERED from 15000 for enhanced security
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
    'customer_data_access_enhanced_v2',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'filial_id', current_user_filial,
      'access_type', 'bulk_customer_data',
      'high_value_threshold', high_value_threshold,
      'security_version', '2.0'
    ),
    4 -- High risk score for customer data access
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
    -- STRICTER EMAIL MASKING - only managers and owners see full emails
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.email
      ELSE 'protected@secure.data'
    END as email,
    -- STRICTER PHONE MASKING - only managers and owners see full phones
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.phone
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

-- 2. Update the tasks table RLS policy to use the new threshold
DROP POLICY IF EXISTS "secure_task_select_enhanced" ON public.tasks;
CREATE POLICY "secure_task_select_enhanced" 
ON public.tasks 
FOR SELECT 
USING (
  auth.uid() = created_by OR
  (EXISTS ( 
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )) OR
  (EXISTS ( 
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = tasks.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  )) OR
  (EXISTS ( 
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = tasks.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p1.approval_status = 'approved'
    AND COALESCE(tasks.sales_value, 0) <= 10000 -- LOWERED from 15000
  ))
);

-- 3. Create function to detect suspicious customer data access patterns
CREATE OR REPLACE FUNCTION public.check_client_data_access_patterns()
 RETURNS TABLE(alert_type text, severity text, user_count bigint, access_count bigint, description text, recommendation text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check for excessive client contact access
  RETURN QUERY
  SELECT 
    'excessive_client_contact_access'::text,
    CASE 
      WHEN COUNT(*) > 100 THEN 'HIGH'
      WHEN COUNT(*) > 50 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(DISTINCT user_id),
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' client contact access events from ', COUNT(DISTINCT user_id), ' users in last 24 hours')::text,
    'Monitor for potential customer contact data harvesting'::text
  FROM public.security_audit_log
  WHERE event_type = 'client_contact_access_enhanced' 
    AND created_at > now() - interval '24 hours'
  HAVING COUNT(*) > 20;
    
  -- Check for bulk client data access by non-managers
  RETURN QUERY
  SELECT 
    'non_manager_bulk_client_access'::text,
    'MEDIUM'::text,
    COUNT(DISTINCT user_id),
    COUNT(*),
    CONCAT('Non-managers accessed ', COUNT(*), ' client contact records')::text,
    'Review access patterns for potential policy violations'::text
  FROM public.security_audit_log sal
  WHERE event_type = 'client_contact_access_enhanced' 
    AND created_at > now() - interval '1 hour'
    AND metadata->>'user_role' != 'manager'
  HAVING COUNT(*) > 10;
END;
$function$;

-- 4. Create enhanced security event logging function with better metadata
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type_param text,
  user_id_param uuid DEFAULT NULL,
  metadata_param jsonb DEFAULT NULL,
  risk_score_param integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert security event with enhanced metadata
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    metadata,
    risk_score,
    ip_address,
    user_agent,
    session_id,
    created_at
  ) VALUES (
    event_type_param,
    COALESCE(user_id_param, auth.uid()),
    COALESCE(metadata_param, '{}'::jsonb) || jsonb_build_object(
      'timestamp', now(),
      'authenticated', auth.uid() IS NOT NULL,
      'session_id', COALESCE(auth.jwt()->>'session_id', 'unknown')
    ),
    GREATEST(risk_score_param, 1),
    inet_client_addr(),
    current_setting('request.headers', true)::json->>'user-agent',
    auth.jwt()->>'session_id',
    now()
  );
  
  -- Auto-escalate if high risk score
  IF risk_score_param >= 4 THEN
    -- Log critical security event
    INSERT INTO public.security_audit_log (
      event_type,
      user_id,
      metadata,
      risk_score,
      created_at
    ) VALUES (
      'critical_security_alert',
      COALESCE(user_id_param, auth.uid()),
      jsonb_build_object(
        'original_event', event_type_param,
        'escalated_at', now(),
        'requires_investigation', true
      ),
      5,
      now()
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Fail silently to not break application flow
    NULL;
END;
$function$;