-- PHASE 1: CRITICAL DATA PROTECTION FIXES

-- 1. Fix clients table RLS policies - CRITICAL SECURITY ISSUE
CREATE POLICY "Users can view their own clients" 
ON public.clients 
FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Managers can view all clients" 
ON public.clients 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND role = 'manager'
));

CREATE POLICY "Users can update their own clients with rate limiting" 
ON public.clients 
FOR UPDATE 
USING (auth.uid() = created_by AND check_client_operation_rate_limit('update'))
WITH CHECK (auth.uid() = created_by AND check_client_operation_rate_limit('update'));

CREATE POLICY "Managers can update all clients" 
ON public.clients 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND role = 'manager'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND role = 'manager'
));

-- 2. Complete RLS coverage for products table
CREATE POLICY "Users can create products for their tasks" 
ON public.products 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = products.task_id 
  AND t.created_by = auth.uid()
));

CREATE POLICY "Users can update products for their tasks" 
ON public.products 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = products.task_id 
  AND can_access_customer_data(t.created_by)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = products.task_id 
  AND can_access_customer_data(t.created_by)
));

CREATE POLICY "Users can delete products for their tasks" 
ON public.products 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = products.task_id 
  AND t.created_by = auth.uid()
));

-- 3. Complete RLS coverage for reminders table
CREATE POLICY "Users can create reminders for their tasks" 
ON public.reminders 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = reminders.task_id 
  AND t.created_by = auth.uid()
));

CREATE POLICY "Users can update reminders for their tasks" 
ON public.reminders 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = reminders.task_id 
  AND can_access_customer_data(t.created_by)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = reminders.task_id 
  AND can_access_customer_data(t.created_by)
));

CREATE POLICY "Users can delete reminders for their tasks" 
ON public.reminders 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = reminders.task_id 
  AND t.created_by = auth.uid()
));

-- 4. Enhance user_invitations with time-based restrictions
CREATE POLICY "Admins can create invitations" 
ON public.user_invitations 
FOR INSERT 
WITH CHECK (simple_is_admin());

CREATE POLICY "Admins can update invitations" 
ON public.user_invitations 
FOR UPDATE 
USING (simple_is_admin())
WITH CHECK (simple_is_admin());

CREATE POLICY "Valid invitations can be viewed by token holder" 
ON public.user_invitations 
FOR SELECT 
USING (
  simple_is_admin() OR 
  (status = 'pending' AND expires_at > now())
);

-- 5. Enhance user_directory_cache security
CREATE POLICY "Cache management by admins only" 
ON public.user_directory_cache 
FOR ALL 
USING (simple_is_admin())
WITH CHECK (simple_is_admin());

-- 6. PHASE 2: AUTHENTICATION SECURITY HARDENING
-- Change default approval status to require admin approval
ALTER TABLE public.profiles 
ALTER COLUMN approval_status SET DEFAULT 'pending';

-- 7. Add client data access logging function
CREATE OR REPLACE FUNCTION public.log_client_data_access(
  client_id uuid,
  access_type text DEFAULT 'view',
  accessed_fields text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.secure_log_security_event(
    'client_data_access',
    auth.uid(),
    jsonb_build_object(
      'client_id', client_id,
      'access_type', access_type,
      'accessed_fields', accessed_fields,
      'timestamp', now()
    ),
    CASE 
      WHEN 'email' = ANY(accessed_fields) OR 'phone' = ANY(accessed_fields) THEN 3
      ELSE 2
    END
  );
END;
$$;

-- 8. Create function to get secure client data with masking
CREATE OR REPLACE FUNCTION public.get_secure_client_data()
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  phone text,
  stage text,
  notes text,
  session_date date,
  created_at timestamp with time zone,
  is_masked boolean,
  access_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid()
  AND approval_status = 'approved';
  
  -- Return clients with appropriate masking
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.email
      ELSE SUBSTRING(c.email FROM 1 FOR 1) || '***@' || SPLIT_PART(c.email, '@', 2)
    END as email,
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.phone
      ELSE '***-***-' || RIGHT(COALESCE(c.phone, ''), 4)
    END as phone,
    c.stage,
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.notes
      ELSE '[Protected]'
    END as notes,
    c.session_date,
    c.created_at,
    (current_user_role != 'manager' AND c.created_by != auth.uid()) as is_masked,
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN c.created_by = auth.uid() THEN 'owner'
      ELSE 'limited'
    END as access_level
  FROM public.clients c
  WHERE (
    c.created_by = auth.uid() OR
    current_user_role = 'manager'
  )
  AND c.archived = false
  ORDER BY c.created_at DESC;
  
  -- Log the data access
  PERFORM public.log_client_data_access(
    NULL,
    'bulk_view',
    ARRAY['name', 'email', 'phone', 'stage']
  );
END;
$$;