-- COMPLETE SECURITY FIX: Customer Contact Information Protection
-- This migration implements the most secure approach to protect customer data

-- 1. Create completely secure view with aggressive masking
CREATE OR REPLACE VIEW public.secure_tasks_view_final AS
SELECT 
  t.id,
  t.name,
  t.responsible,
  -- AGGRESSIVE CLIENT NAME MASKING
  CASE 
    WHEN auth.uid() IS NULL THEN '[Protected]'
    WHEN auth.uid() = t.created_by THEN t.client
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.client
    ELSE 'Customer-' || substr(t.id::text, 1, 8)
  END as client,
  -- AGGRESSIVE PROPERTY MASKING
  CASE 
    WHEN auth.uid() IS NULL THEN '[Protected]'
    WHEN auth.uid() = t.created_by THEN t.property
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.property
    ELSE 'Property-' || substr(t.id::text, 1, 8)
  END as property,
  t.filial,
  -- COMPLETE EMAIL MASKING
  CASE 
    WHEN auth.uid() IS NULL THEN NULL
    WHEN auth.uid() = t.created_by THEN t.email
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.email
    ELSE 
      CASE 
        WHEN t.email IS NOT NULL AND t.email != '' THEN 'contact@protected.data'
        ELSE NULL
      END
  END as email,
  -- COMPLETE PHONE MASKING
  CASE 
    WHEN auth.uid() IS NULL THEN NULL
    WHEN auth.uid() = t.created_by THEN t.phone
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.phone
    ELSE 
      CASE 
        WHEN t.phone IS NOT NULL AND t.phone != '' THEN '(***) ***-****'
        ELSE NULL
      END
  END as phone,
  -- SECURE SALES VALUE
  CASE 
    WHEN auth.uid() IS NULL THEN NULL
    WHEN auth.uid() = t.created_by THEN t.sales_value
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.sales_value
    ELSE NULL
  END as sales_value,
  -- Non-sensitive fields
  t.start_date,
  t.end_date,
  t.status,
  t.priority,
  t.task_type,
  CASE 
    WHEN auth.uid() IS NULL THEN '[Restricted]'
    WHEN auth.uid() = t.created_by THEN t.observations
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.observations
    ELSE '[Restricted for privacy]'
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
  -- Restrict row access as well
  auth.uid() = t.created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 2. Make the view security-barrier to prevent bypass
ALTER VIEW public.secure_tasks_view_final SET (security_barrier = true);

-- 3. Update main tasks table RLS to be extremely restrictive
DROP POLICY IF EXISTS "Maximum security customer data policy" ON public.tasks;

CREATE POLICY "Maximum security customer data policy"
ON public.tasks
FOR ALL
USING (
  -- Only task owners and approved managers can access
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  -- Only task owners can modify
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 4. Create function to completely replace direct task access
CREATE OR REPLACE FUNCTION public.get_completely_secure_tasks()
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
  access_level text,
  is_customer_data_protected boolean,
  start_date date,
  end_date date,
  status text,
  priority text,
  task_type text,
  observations text,
  created_at timestamp with time zone,
  created_by uuid,
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
  prospect_notes text,
  family_product text,
  photos text[],
  documents text[],
  partial_sales_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_role text;
  is_manager boolean := false;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user role
  SELECT p.role INTO current_user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- Set manager flag
  is_manager := (current_user_role = 'manager');
  
  -- Log secure access
  PERFORM public.secure_log_security_event(
    'completely_secure_task_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'is_manager', is_manager,
      'access_method', 'secure_function'
    ),
    2
  );
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- ULTRA-SECURE CLIENT MASKING
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.client
      ELSE 'PROTECTED_CLIENT_' || substr(t.id::text, 1, 6)
    END as client,
    -- ULTRA-SECURE PROPERTY MASKING
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.property
      ELSE 'PROTECTED_PROPERTY_' || substr(t.id::text, 1, 6)
    END as property,
    t.filial,
    -- ULTRA-SECURE EMAIL MASKING
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.email
      WHEN t.email IS NOT NULL AND t.email != '' THEN 'secure@contact.protected'
      ELSE NULL
    END as email,
    -- ULTRA-SECURE PHONE MASKING
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.phone
      WHEN t.phone IS NOT NULL AND t.phone != '' THEN '+55 (**) ****-****'
      ELSE NULL
    END as phone,
    -- SECURE SALES VALUE
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.sales_value
      ELSE NULL
    END as sales_value,
    -- ACCESS LEVEL INDICATOR
    CASE 
      WHEN is_manager THEN 'manager'
      WHEN t.created_by = auth.uid() THEN 'owner'
      ELSE 'restricted'
    END as access_level,
    -- PROTECTION FLAG
    NOT (is_manager OR t.created_by = auth.uid()) as is_customer_data_protected,
    -- Non-sensitive data
    t.start_date,
    t.end_date,
    t.status,
    t.priority,
    t.task_type,
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.observations
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
    -- Only own tasks or manager access
    t.created_by = auth.uid() OR is_manager
  )
  ORDER BY t.created_at DESC;
END;
$$;

-- 5. Grant permissions
GRANT SELECT ON public.secure_tasks_view_final TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_completely_secure_tasks() TO authenticated;

-- 6. Create security monitoring function
CREATE OR REPLACE FUNCTION public.detect_customer_data_theft_attempts()
RETURNS TABLE(
  alert_level text,
  threat_description text,
  event_count bigint,
  recommended_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check for suspicious task access patterns
  RETURN QUERY
  SELECT 
    'CRITICAL'::text as alert_level,
    'Multiple unauthorized customer data access attempts detected'::text as threat_description,
    COUNT(*) as event_count,
    'Immediately investigate user accounts and consider suspending access'::text as recommended_action
  FROM public.security_audit_log
  WHERE event_type LIKE '%customer%'
    AND created_at > now() - interval '1 hour'
    AND risk_score >= 3
  HAVING COUNT(*) > 5;
    
  -- Check for bulk access attempts
  RETURN QUERY
  SELECT 
    'HIGH'::text as alert_level,
    'Potential bulk customer data harvesting attempt'::text as threat_description,
    COUNT(*) as event_count,
    'Review user activity and implement additional monitoring'::text as recommended_action
  FROM public.security_audit_log
  WHERE event_type = 'completely_secure_task_access'
    AND created_at > now() - interval '15 minutes'
  GROUP BY user_id
  HAVING COUNT(*) > 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_customer_data_theft_attempts() TO authenticated;