-- Fix RLS infinite recursion and create proper helper functions
-- This will resolve the authentication and data loading issues

-- First, create a simple function to check if current user is admin
CREATE OR REPLACE FUNCTION public.simple_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND is_active = true
  );
$$;

-- Create a simple function to get current user role without recursion
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
    'none'
  );
$$;

-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- Create new, simple RLS policies for profiles without recursion
CREATE POLICY "Allow users to view own profile"
ON public.profiles
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Allow users to update own profile"
ON public.profiles
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow profile creation"
ON public.profiles
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow admin to view all profiles"
ON public.profiles
FOR SELECT
USING (public.simple_is_admin());

CREATE POLICY "Allow admin to manage all profiles"
ON public.profiles
FOR ALL
USING (public.simple_is_admin())
WITH CHECK (public.simple_is_admin());

-- Update the can_access_customer_data function to prevent recursion
CREATE OR REPLACE FUNCTION public.can_access_customer_data(task_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = task_owner_id THEN true
    WHEN public.get_user_role() = 'manager' THEN true
    WHEN public.get_user_role() = 'supervisor' AND EXISTS (
      SELECT 1 
      FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
        AND p2.user_id = task_owner_id
        AND p1.filial_id = p2.filial_id
        AND p1.filial_id IS NOT NULL
    ) THEN true
    ELSE false
  END;
$$;

-- Ensure the get_completely_secure_tasks function works properly
CREATE OR REPLACE FUNCTION public.get_completely_secure_tasks()
RETURNS TABLE(
  id uuid, name text, responsible text, client text, property text, filial text, 
  email text, phone text, sales_value numeric, access_level text, 
  is_customer_data_protected boolean, start_date date, end_date date, 
  status text, priority text, task_type text, observations text, 
  created_at timestamp with time zone, created_by uuid, updated_at timestamp with time zone, 
  is_prospect boolean, sales_confirmed boolean, equipment_quantity integer, 
  equipment_list jsonb, propertyhectares integer, initial_km integer, 
  final_km integer, check_in_location jsonb, clientcode text, 
  sales_type text, start_time text, end_time text, prospect_notes text, 
  family_product text, photos text[], documents text[], partial_sales_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  is_manager boolean := false;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user role safely
  current_user_role := public.get_user_role();
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