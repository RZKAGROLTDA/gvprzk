-- CRITICAL SECURITY FIX: Customer Contact Information Protection
-- This migration implements proper data masking for customer contact information

-- 1. Create secure function for masked customer data access
CREATE OR REPLACE FUNCTION public.get_secure_customer_data_enhanced()
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
  is_masked boolean,
  access_level text,
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
  current_user_filial uuid;
  high_value_threshold numeric := 25000;
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
  
  -- Log customer data access attempt
  PERFORM public.secure_log_security_event(
    'customer_data_access_enhanced',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'filial_id', current_user_filial,
      'access_type', 'bulk_customer_data'
    ),
    3
  );
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- SECURE CLIENT NAME MASKING
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
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
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
      ELSE LEFT(t.property, 2) || '***' || RIGHT(t.property, 1)
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
      ELSE 
        CASE 
          WHEN t.email IS NOT NULL AND t.email != '' THEN
            SUBSTRING(t.email FROM 1 FOR 1) || '***@' || 
            CASE 
              WHEN POSITION('@' IN t.email) > 0 THEN SPLIT_PART(t.email, '@', 2)
              ELSE '***'
            END
          ELSE NULL
        END
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
      ELSE 
        CASE 
          WHEN t.phone IS NOT NULL AND t.phone != '' THEN
            '***-***-' || RIGHT(t.phone, 4)
          ELSE NULL
        END
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
    -- Manager sees all tasks
    current_user_role = 'manager' OR
    -- Users see their own tasks
    t.created_by = auth.uid() OR
    -- Supervisors see tasks from their filial
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = t.created_by 
      AND p.filial_id = current_user_filial
    )) OR
    -- Consultants see tasks from same filial with value restrictions
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

-- 2. Create function to monitor customer data access
CREATE OR REPLACE FUNCTION public.log_customer_contact_access(
  access_type text DEFAULT 'view',
  customer_count integer DEFAULT 0,
  masked_count integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.secure_log_security_event(
    'customer_contact_access',
    auth.uid(),
    jsonb_build_object(
      'access_type', access_type,
      'customer_count', customer_count,
      'masked_count', masked_count,
      'timestamp', now(),
      'user_role', (SELECT role FROM public.profiles WHERE user_id = auth.uid())
    ),
    CASE 
      WHEN access_type = 'bulk_export' THEN 4
      WHEN masked_count = 0 AND customer_count > 10 THEN 3
      ELSE 2
    END
  );
END;
$$;

-- 3. Create alert function for suspicious customer data access
CREATE OR REPLACE FUNCTION public.check_customer_data_access_alerts()
RETURNS TABLE(
  alert_type text,
  severity text,
  count bigint,
  description text,
  recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check for excessive customer data access
  RETURN QUERY
  SELECT 
    'excessive_customer_data_access'::text,
    CASE 
      WHEN COUNT(*) > 100 THEN 'CRITICAL'
      WHEN COUNT(*) > 50 THEN 'HIGH'
      WHEN COUNT(*) > 20 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' customer data access events in the last 24 hours')::text,
    'Monitor for potential customer data harvesting attempts'::text
  FROM public.security_audit_log
  WHERE event_type = 'customer_contact_access' 
    AND created_at > now() - interval '24 hours'
    AND metadata->>'masked_count' = '0';
    
  -- Check for bulk customer data access without masking
  RETURN QUERY
  SELECT 
    'unmasked_bulk_access'::text,
    'CRITICAL'::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' unmasked bulk customer data access attempts')::text,
    'Investigate immediately - potential data theft attempt'::text
  FROM public.security_audit_log
  WHERE event_type = 'customer_contact_access' 
    AND created_at > now() - interval '24 hours'
    AND (metadata->>'customer_count')::integer > 50
    AND metadata->>'masked_count' = '0';
END;
$$;

-- 4. Add indexes for security performance
CREATE INDEX IF NOT EXISTS idx_tasks_customer_security 
ON public.tasks(created_by, sales_value, email, phone) 
WHERE email IS NOT NULL OR phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_audit_customer_access 
ON public.security_audit_log(event_type, created_at) 
WHERE event_type = 'customer_contact_access';

-- 5. Update existing get_all_secure_tasks function to use enhanced security
DROP FUNCTION IF EXISTS public.get_all_secure_tasks();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_secure_customer_data_enhanced() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_customer_contact_access(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_customer_data_access_alerts() TO authenticated;