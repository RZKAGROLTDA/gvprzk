-- CRITICAL SECURITY FIXES - Phase 1: Data Protection
-- Implementing comprehensive security measures for customer data and high-value sales

-- 1. Create secure customer contact access function
CREATE OR REPLACE FUNCTION public.get_secure_customer_contacts(task_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  task_id uuid,
  client_name text,
  email text,
  phone text,
  access_level text
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
    'customer_data_access',
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
    -- Client name with role-based masking
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.client
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
    END as client_name,
    
    -- Email with strict protection
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.***'
    END as email,
    
    -- Phone with protection (assuming we add this field)
    CASE 
      WHEN current_user_role = 'manager' THEN COALESCE(t.phone, '')
      WHEN auth.uid() = t.created_by THEN COALESCE(t.phone, '')
      ELSE '***-***-***'
    END as phone,
    
    -- Access level indicator
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN auth.uid() = t.created_by THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'supervisor'
      ELSE 'masked'
    END as access_level
    
  FROM public.tasks t
  WHERE 
    -- Apply strict access control
    (auth.uid() = t.created_by) OR
    (current_user_role = 'manager') OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
    ))
  AND (task_ids IS NULL OR t.id = ANY(task_ids));
END;
$$;

-- 2. Enhanced high-value sales protection function
CREATE OR REPLACE FUNCTION public.get_secure_sales_data(include_high_value boolean DEFAULT false)
RETURNS TABLE(
  task_id uuid,
  sales_value numeric,
  sales_type text,
  is_high_value boolean,
  access_granted boolean,
  masked_value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
  user_filial_id uuid;
  high_value_threshold numeric := 25000;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log high-value data access attempt
  IF include_high_value THEN
    PERFORM public.secure_log_security_event(
      'high_value_sales_access',
      auth.uid(),
      jsonb_build_object(
        'user_role', current_user_role,
        'threshold', high_value_threshold
      ),
      4
    );
  END IF;

  RETURN QUERY
  SELECT 
    t.id as task_id,
    CASE 
      -- Full access for managers and task owners
      WHEN current_user_role = 'manager' THEN t.sales_value
      WHEN auth.uid() = t.created_by THEN t.sales_value
      -- Supervisors can see sales from their filial, but limited for high-value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 
        CASE 
          WHEN COALESCE(t.sales_value, 0) > high_value_threshold AND NOT include_high_value THEN NULL
          ELSE t.sales_value
        END
      -- Others can only see low-value sales from same filial
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) AND COALESCE(t.sales_value, 0) <= high_value_threshold THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    t.sales_type,
    
    (COALESCE(t.sales_value, 0) > high_value_threshold) as is_high_value,
    
    (current_user_role = 'manager' OR 
     auth.uid() = t.created_by OR
     (current_user_role = 'supervisor' AND include_high_value AND EXISTS (
       SELECT 1 FROM public.profiles p2 
       WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
     ))) as access_granted,
    
    CASE 
      WHEN COALESCE(t.sales_value, 0) > high_value_threshold AND NOT (
        current_user_role = 'manager' OR 
        auth.uid() = t.created_by OR
        (current_user_role = 'supervisor' AND include_high_value)
      ) THEN '>R$ 25.000'
      WHEN t.sales_value IS NULL THEN 'Não informado'
      ELSE NULL
    END as masked_value
    
  FROM public.tasks t
  WHERE 
    (auth.uid() = t.created_by) OR
    (current_user_role = 'manager') OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
    )) OR
    (EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
    ) AND COALESCE(t.sales_value, 0) <= high_value_threshold);
END;
$$;

-- 3. Secure user directory with NO email exposure
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
    -- CRITICAL: Only expose emails to managers or self
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
    -- Users can see basic info from same filial, but NO emails
    auth.uid() = p.user_id OR
    current_user_is_admin() OR
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$$;

-- 4. Enhanced audit logging for sensitive operations
CREATE OR REPLACE FUNCTION public.log_sensitive_operation(
  operation_type text,
  resource_type text,
  resource_id uuid DEFAULT NULL,
  additional_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.secure_log_security_event(
    operation_type,
    auth.uid(),
    jsonb_build_object(
      'resource_type', resource_type,
      'resource_id', resource_id,
      'timestamp', now(),
      'user_role', (SELECT role FROM public.profiles WHERE user_id = auth.uid())
    ) || additional_metadata,
    CASE 
      WHEN operation_type LIKE '%high_value%' THEN 4
      WHEN operation_type LIKE '%customer_data%' THEN 3
      ELSE 2
    END
  );
END;
$$;

-- 5. Create trigger for automatic high-value sales monitoring
CREATE OR REPLACE FUNCTION public.monitor_high_value_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Monitor high-value sales creation/updates
  IF (NEW.sales_value IS NOT NULL AND NEW.sales_value > 25000) OR 
     (OLD.sales_value IS DISTINCT FROM NEW.sales_value AND NEW.sales_value > 25000) THEN
    
    PERFORM public.secure_log_security_event(
      'high_value_sales_modification',
      NEW.created_by,
      jsonb_build_object(
        'task_id', NEW.id,
        'old_value', OLD.sales_value,
        'new_value', NEW.sales_value,
        'operation', TG_OP,
        'client', LEFT(NEW.client, 3) || '***'
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
  EXECUTE FUNCTION public.monitor_high_value_sales();

-- 6. Add phone field to tasks table for complete customer data protection
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS phone text;

-- 7. Create indexes for performance and security queries
CREATE INDEX IF NOT EXISTS idx_tasks_sales_value_security ON public.tasks(sales_value) WHERE sales_value > 25000;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_filial ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_high_risk ON public.security_audit_log(risk_score, created_at) WHERE risk_score >= 4;

-- 8. Update RLS policy for tasks to be more restrictive with customer data
DROP POLICY IF EXISTS "Enhanced customer data protection" ON public.tasks;
CREATE POLICY "Enhanced customer data protection" 
ON public.tasks 
FOR SELECT 
USING (
  -- Basic access rules remain the same
  (auth.uid() = created_by) OR
  (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  )) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
    -- Additional restriction: low-value tasks only for non-supervisory roles
    AND COALESCE(tasks.sales_value, 0) <= 25000
  ))
);

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_secure_customer_contacts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_secure_sales_data(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_secure_user_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_sensitive_operation(text, text, uuid, jsonb) TO authenticated;