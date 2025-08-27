-- CRITICAL SECURITY FIXES - Phase 1: Data Protection
-- Fix customer email exposure and high-value sales data security

-- 1. Enhanced customer data protection function
CREATE OR REPLACE FUNCTION public.get_secure_customer_data(task_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  task_id uuid,
  client_name text,
  email text,
  phone text,
  client_code text,
  property text,
  sales_value numeric,
  access_level text,
  is_masked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
  user_filial_id uuid;
BEGIN
  -- Only authenticated users can access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log customer data access attempt
  PERFORM public.secure_log_security_event(
    'customer_data_access_attempt',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', current_user_role,
      'requested_tasks', COALESCE(array_length(task_ids, 1), 0)
    ),
    3
  );

  RETURN QUERY
  SELECT 
    t.id as task_id,
    -- Client name with strict role-based masking
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.client
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
    END as client_name,
    
    -- Email with CRITICAL protection - only managers and task owners
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.***'
    END as email,
    
    -- Phone with protection
    CASE 
      WHEN current_user_role = 'manager' THEN COALESCE(t.phone, '')
      WHEN auth.uid() = t.created_by THEN COALESCE(t.phone, '')
      ELSE '***-***-***'
    END as phone,
    
    -- Client code with protection
    CASE 
      WHEN current_user_role = 'manager' THEN t.clientcode
      WHEN auth.uid() = t.created_by THEN t.clientcode
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.clientcode
      ELSE '***'
    END as client_code,
    
    -- Property with protection
    CASE 
      WHEN current_user_role = 'manager' THEN t.property
      WHEN auth.uid() = t.created_by THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.property
      ELSE LEFT(t.property, 2) || '***' || RIGHT(t.property, 1)
    END as property,
    
    -- Sales value with HIGH-VALUE protection (>25k restricted)
    CASE 
      WHEN current_user_role = 'manager' THEN t.sales_value
      WHEN auth.uid() = t.created_by THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      -- High-value sales (>25k) restricted to managers and supervisors only
      WHEN COALESCE(t.sales_value, 0) > 25000 THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    -- Access level indicator
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN auth.uid() = t.created_by THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'supervisor'
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) AND COALESCE(t.sales_value, 0) <= 25000 THEN 'limited'
      ELSE 'restricted'
    END as access_level,
    
    -- Masking indicator
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = t.created_by OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ))
    ) as is_masked
    
  FROM public.tasks t
  WHERE 
    -- Apply strict access control filters
    (auth.uid() = t.created_by) OR
    (current_user_role = 'manager') OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
    )) OR
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM public.profiles p2 
       WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
     ) AND COALESCE(t.sales_value, 0) <= 25000)
  AND (task_ids IS NULL OR t.id = ANY(task_ids));
END;
$$;

-- 2. Enhanced high-value sales monitoring function
CREATE OR REPLACE FUNCTION public.monitor_high_value_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Monitor high-value sales access (>25k)
  IF COALESCE(NEW.sales_value, 0) > 25000 THEN
    PERFORM public.secure_log_security_event(
      'high_value_sales_access',
      auth.uid(),
      jsonb_build_object(
        'task_id', NEW.id,
        'sales_value', NEW.sales_value,
        'user_role', current_user_role,
        'client', LEFT(NEW.client, 3) || '***',
        'operation', TG_OP
      ),
      4
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for high-value sales monitoring
DROP TRIGGER IF EXISTS monitor_high_value_sales_trigger ON public.tasks;
CREATE TRIGGER monitor_high_value_sales_trigger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION monitor_high_value_access();

-- 3. Secure user directory function with email protection
CREATE OR REPLACE FUNCTION public.get_secure_user_directory()
RETURNS TABLE(
  id uuid, 
  user_id uuid, 
  name text, 
  email text, 
  role text, 
  filial_id uuid, 
  approval_status text, 
  filial_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Log directory access
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object('access_timestamp', now()),
    2
  );

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- CRITICAL FIX: Only expose emails to managers or self
    CASE 
      WHEN auth.uid() = p.user_id THEN p.email
      WHEN current_user_is_admin() THEN p.email
      ELSE '***@***.***'::text
    END as email,
    p.role,
    p.filial_id,
    p.approval_status,
    f.nome as filial_nome
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE 
    -- Users can see basic info from same filial, but NO emails unless admin/self
    auth.uid() = p.user_id OR
    current_user_is_admin() OR
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$$;

-- 4. Enhanced security monitoring for sensitive operations
CREATE OR REPLACE FUNCTION public.log_sensitive_data_operation(
  operation_type text,
  resource_type text,
  resource_id uuid DEFAULT NULL,
  additional_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
  risk_level integer;
BEGIN
  -- Get current user's role for context
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Determine risk level based on operation
  risk_level := CASE 
    WHEN operation_type LIKE '%high_value%' THEN 4
    WHEN operation_type LIKE '%customer_email%' THEN 4
    WHEN operation_type LIKE '%email_access%' THEN 3
    WHEN operation_type LIKE '%data_export%' THEN 3
    ELSE 2
  END;
  
  PERFORM public.secure_log_security_event(
    operation_type,
    auth.uid(),
    jsonb_build_object(
      'resource_type', resource_type,
      'resource_id', resource_id,
      'timestamp', now(),
      'user_role', current_user_role
    ) || additional_metadata,
    risk_level
  );
END;
$$;

-- 5. Create security alerts for critical data access
CREATE OR REPLACE FUNCTION public.check_security_alerts()
RETURNS TABLE(
  alert_type text,
  severity text,
  count bigint,
  description text,
  recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check for high-risk security events in last 24 hours
  RETURN QUERY
  SELECT 
    'High Risk Events'::text,
    CASE 
      WHEN COUNT(*) > 100 THEN 'CRITICAL'
      WHEN COUNT(*) > 50 THEN 'HIGH'
      WHEN COUNT(*) > 10 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' high-risk security events in the last 24 hours')::text,
    'Investigate and address high-risk security events immediately'::text
  FROM public.security_audit_log
  WHERE risk_score >= 4 AND created_at > now() - interval '24 hours';
  
  -- Check for unauthorized customer email access attempts
  RETURN QUERY
  SELECT 
    'Customer Email Access'::text,
    CASE 
      WHEN COUNT(*) > 50 THEN 'HIGH'
      WHEN COUNT(*) > 20 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' customer email access attempts in the last 24 hours')::text,
    'Review customer email access patterns for unauthorized attempts'::text
  FROM public.security_audit_log
  WHERE event_type LIKE '%customer_data%' AND created_at > now() - interval '24 hours';
  
  -- Check for high-value sales access patterns
  RETURN QUERY
  SELECT 
    'High Value Sales Access'::text,
    CASE 
      WHEN COUNT(*) > 30 THEN 'HIGH'
      WHEN COUNT(*) > 10 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' high-value sales access events in the last 24 hours')::text,
    'Monitor high-value sales data access for compliance'::text
  FROM public.security_audit_log
  WHERE event_type LIKE '%high_value%' AND created_at > now() - interval '24 hours';
END;
$$;