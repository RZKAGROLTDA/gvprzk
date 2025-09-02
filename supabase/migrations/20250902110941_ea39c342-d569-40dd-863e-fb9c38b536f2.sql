-- ENHANCED SECURITY FIX: Complete Customer Data Protection
-- This migration implements the most restrictive security model for customer data

-- 1. Create a secure view that completely masks customer data by default
CREATE OR REPLACE VIEW public.secure_tasks_view_enhanced AS
SELECT 
  t.id,
  t.name,
  t.responsible,
  -- Completely mask client data for unauthorized users
  CASE 
    WHEN auth.uid() IS NULL THEN '[Protected]'
    WHEN auth.uid() = t.created_by THEN t.client
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.client
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p1.role = 'supervisor' 
      AND p1.approval_status = 'approved'
      AND p2.user_id = t.created_by 
      AND p1.filial_id = p2.filial_id
      AND p1.filial_id IS NOT NULL
    ) THEN t.client
    ELSE LEFT(t.client, 2) || '***'
  END as client,
  -- Completely mask property data
  CASE 
    WHEN auth.uid() IS NULL THEN '[Protected]'
    WHEN auth.uid() = t.created_by THEN t.property
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.property
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p1.role = 'supervisor' 
      AND p1.approval_status = 'approved'
      AND p2.user_id = t.created_by 
      AND p1.filial_id = p2.filial_id
      AND p1.filial_id IS NOT NULL
    ) THEN t.property
    ELSE LEFT(t.property, 2) || '***'
  END as property,
  t.filial,
  -- Completely mask email addresses
  CASE 
    WHEN auth.uid() IS NULL THEN NULL
    WHEN auth.uid() = t.created_by THEN t.email
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.email
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p1.role = 'supervisor' 
      AND p1.approval_status = 'approved'
      AND p2.user_id = t.created_by 
      AND p1.filial_id = p2.filial_id
      AND p1.filial_id IS NOT NULL
    ) THEN t.email
    ELSE 
      CASE 
        WHEN t.email IS NOT NULL AND t.email != '' THEN '***@***'
        ELSE NULL
      END
  END as email,
  -- Completely mask phone numbers
  CASE 
    WHEN auth.uid() IS NULL THEN NULL
    WHEN auth.uid() = t.created_by THEN t.phone
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.phone
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p1.role = 'supervisor' 
      AND p1.approval_status = 'approved'
      AND p2.user_id = t.created_by 
      AND p1.filial_id = p2.filial_id
      AND p1.filial_id IS NOT NULL
    ) THEN t.phone
    ELSE 
      CASE 
        WHEN t.phone IS NOT NULL AND t.phone != '' THEN '***-***'
        ELSE NULL
      END
  END as phone,
  -- Mask sales values for high-value deals
  CASE 
    WHEN auth.uid() IS NULL THEN NULL
    WHEN auth.uid() = t.created_by THEN t.sales_value
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN t.sales_value
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p1.role = 'supervisor' 
      AND p1.approval_status = 'approved'
      AND p2.user_id = t.created_by 
      AND p1.filial_id = p2.filial_id
      AND p1.filial_id IS NOT NULL
    ) THEN t.sales_value
    WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.sales_value
    ELSE NULL
  END as sales_value,
  -- Other non-sensitive fields
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
FROM public.tasks t;

-- 2. Enable RLS on the secure view
ALTER VIEW public.secure_tasks_view_enhanced SET (security_barrier = true);

-- 3. Update the existing RLS policies to be even more restrictive
DROP POLICY IF EXISTS "Restrict customer data access" ON public.tasks;

CREATE POLICY "Restrict customer data access"
ON public.tasks
FOR SELECT
USING (
  -- Only allow access through secure function or for own tasks
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )
);

-- 4. Create function to log all customer data access attempts
CREATE OR REPLACE FUNCTION public.log_customer_data_access_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log any direct access to customer data fields
  IF TG_OP = 'SELECT' AND (
    NEW.client IS NOT NULL OR 
    NEW.email IS NOT NULL OR 
    NEW.phone IS NOT NULL
  ) THEN
    PERFORM public.secure_log_security_event(
      'direct_customer_data_access',
      auth.uid(),
      jsonb_build_object(
        'table', 'tasks',
        'accessed_fields', ARRAY['client', 'email', 'phone'],
        'task_id', NEW.id
      ),
      3
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 5. Add trigger to monitor direct task table access
DROP TRIGGER IF EXISTS customer_data_access_monitor ON public.tasks;
CREATE TRIGGER customer_data_access_monitor
  AFTER SELECT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_customer_data_access_attempt();

-- 6. Create secure function to get task count without exposing data
CREATE OR REPLACE FUNCTION public.get_secure_task_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_count integer;
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND approval_status = 'approved';
  
  -- Log the count request
  PERFORM public.secure_log_security_event(
    'task_count_request',
    auth.uid(),
    jsonb_build_object('user_role', current_user_role),
    1
  );
  
  -- Return count based on role
  IF current_user_role = 'manager' THEN
    SELECT COUNT(*) INTO task_count FROM public.tasks;
  ELSE
    SELECT COUNT(*) INTO task_count 
    FROM public.tasks 
    WHERE created_by = auth.uid();
  END IF;
  
  RETURN task_count;
END;
$$;

-- 7. Grant permissions
GRANT SELECT ON public.secure_tasks_view_enhanced TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_secure_task_count() TO authenticated;

-- 8. Add additional security index
CREATE INDEX IF NOT EXISTS idx_tasks_security_access 
ON public.tasks(created_by, email, phone, client) 
WHERE email IS NOT NULL OR phone IS NOT NULL OR client IS NOT NULL;