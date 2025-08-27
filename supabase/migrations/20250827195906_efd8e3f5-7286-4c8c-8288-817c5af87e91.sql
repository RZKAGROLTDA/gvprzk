-- CRITICAL SECURITY FIXES - Phase 1 & 2
-- Fix function security vulnerabilities and implement data protection

-- 1. Fix all SECURITY DEFINER functions to prevent search_path attacks
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = target_user_id
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
$$;

-- 2. Create secure customer data masking functions
CREATE OR REPLACE FUNCTION public.mask_customer_email(email text, user_role text, is_owner boolean, is_same_filial boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN user_role = 'manager' OR is_owner THEN email
    WHEN user_role = 'supervisor' AND is_same_filial THEN email
    ELSE '***@***.***'
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_customer_name(name text, user_role text, is_owner boolean, is_same_filial boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN user_role = 'manager' OR is_owner THEN name
    WHEN user_role = 'supervisor' AND is_same_filial THEN name
    ELSE LEFT(name, 2) || '***' || RIGHT(name, 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_phone_number(phone text, user_role text, is_owner boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN user_role = 'manager' OR is_owner THEN COALESCE(phone, '')
    ELSE '***-***-***'
  END;
$$;

-- 3. Enhanced secure user directory with strict email protection
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
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user role
  SELECT p.role INTO current_user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  -- Log directory access with enhanced metadata
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', current_user_role,
      'access_level', CASE WHEN current_user_role = 'manager' THEN 'full' ELSE 'limited' END
    ),
    2
  );

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- CRITICAL: Only expose emails to managers or self - never to regular users
    CASE 
      WHEN auth.uid() = p.user_id THEN p.email
      WHEN current_user_role = 'manager' THEN p.email
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
    current_user_role = 'manager' OR
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$$;

-- 4. Create function to validate and sanitize task input server-side
CREATE OR REPLACE FUNCTION public.validate_and_sanitize_task_input(input_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  sanitized_data jsonb := '{}';
  key text;
  value text;
  suspicious_patterns text[] := ARRAY[
    '<script', 'javascript:', 'vbscript:', 'on\w+\s*=', 'data:text/html',
    'eval\s*\(', 'expression\s*\(', '\bxss\b', '\binjection\b',
    'DROP\s+TABLE', 'DELETE\s+FROM', 'INSERT\s+INTO', 'UPDATE\s+SET'
  ];
  pattern text;
BEGIN
  -- Validate each field
  FOR key IN SELECT jsonb_object_keys(input_data)
  LOOP
    value := input_data ->> key;
    
    -- Skip null values
    IF value IS NULL THEN
      sanitized_data := sanitized_data || jsonb_build_object(key, value);
      CONTINUE;
    END IF;
    
    -- Check for malicious patterns
    FOREACH pattern IN ARRAY suspicious_patterns
    LOOP
      IF value ~* pattern THEN
        -- Log security violation
        PERFORM public.secure_log_security_event(
          'malicious_input_blocked',
          auth.uid(),
          jsonb_build_object(
            'field', key,
            'pattern_matched', pattern,
            'input_sample', LEFT(value, 50)
          ),
          5
        );
        -- Replace with safe value
        value := '[CONTENT BLOCKED - SECURITY VIOLATION]';
        EXIT;
      END IF;
    END LOOP;
    
    -- Truncate excessively long inputs
    IF LENGTH(value) > 5000 THEN
      PERFORM public.secure_log_security_event(
        'oversized_input_truncated',
        auth.uid(),
        jsonb_build_object(
          'field', key,
          'original_length', LENGTH(value)
        ),
        3
      );
      value := LEFT(value, 5000) || '... [TRUNCATED]';
    END IF;
    
    sanitized_data := sanitized_data || jsonb_build_object(key, value);
  END LOOP;
  
  RETURN sanitized_data;
END;
$$;

-- 5. Enhanced task access with customer data protection
CREATE OR REPLACE FUNCTION public.get_secure_task_data_enhanced(task_ids uuid[] DEFAULT NULL)
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
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
  user_filial_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log data access
  PERFORM public.secure_log_security_event(
    'enhanced_task_data_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'task_count', COALESCE(array_length(task_ids, 1), 0)
    ),
    3
  );

  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Apply customer data masking
    public.mask_customer_name(
      t.client, 
      current_user_role, 
      auth.uid() = t.created_by,
      EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id)
    ) as client,
    public.mask_customer_name(
      t.property, 
      current_user_role, 
      auth.uid() = t.created_by,
      EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id)
    ) as property,
    t.filial,
    public.mask_customer_email(
      t.email, 
      current_user_role, 
      auth.uid() = t.created_by,
      EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id)
    ) as email,
    public.mask_phone_number(
      t.phone, 
      current_user_role, 
      auth.uid() = t.created_by
    ) as phone,
    -- Sales value protection
    CASE 
      WHEN current_user_role = 'manager' THEN t.sales_value
      WHEN auth.uid() = t.created_by THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= 25000 AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      ELSE NULL
    END as sales_value,
    -- Masking indicator
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = t.created_by OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ))
    ) as is_masked,
    -- Access level
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN auth.uid() = t.created_by THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
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
    t.created_by
  FROM public.tasks t
  WHERE 
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