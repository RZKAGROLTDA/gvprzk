-- Fix the SQL syntax error and remove problematic SECURITY DEFINER
DROP VIEW IF EXISTS public.secure_clients_view;

-- Replace with a proper function that doesn't use conflicting options
CREATE OR REPLACE FUNCTION public.get_secure_clients()
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  phone text,
  stage text,
  notes text,
  session_date date,
  created_at timestamp with time zone,
  created_by uuid,
  is_masked boolean,
  access_level text
)
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role (this respects RLS)
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid()
  AND approval_status = 'approved';
  
  -- Return clients with appropriate masking (using existing RLS policies)
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
      ELSE '[Protected - Access Restricted]'
    END as notes,
    c.session_date,
    c.created_at,
    c.created_by,
    (current_user_role != 'manager' AND c.created_by != auth.uid()) as is_masked,
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN c.created_by = auth.uid() THEN 'owner'
      ELSE 'limited'
    END as access_level
  FROM public.clients c
  WHERE c.archived = false
  AND (
    c.created_by = auth.uid() OR
    current_user_role = 'manager'
  );
  
  -- Log the data access (only if user is authenticated)
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.log_client_data_access(
      NULL,
      'bulk_view',
      ARRAY['name', 'email', 'phone', 'stage']
    );
  END IF;
END;
$$;

-- Update the mask_sensitive_data function to remove conflicting options
CREATE OR REPLACE FUNCTION public.mask_sensitive_data(
  data_value text,
  field_type text,
  user_has_access boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN user_has_access THEN data_value
    WHEN field_type = 'email' THEN 
      SUBSTRING(data_value FROM 1 FOR 1) || '***@' || SPLIT_PART(data_value, '@', 2)
    WHEN field_type = 'phone' THEN 
      '***-***-' || RIGHT(COALESCE(data_value, ''), 4)
    WHEN field_type = 'name' THEN 
      LEFT(data_value, 2) || '***' || RIGHT(data_value, 1)
    ELSE '[Protected]'
  END;
$$;