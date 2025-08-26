-- Drop the existing view since we can't apply RLS to it
DROP VIEW IF EXISTS public.secure_tasks_view;

-- Create a secure function that returns filtered task data based on user access level
CREATE OR REPLACE FUNCTION public.get_secure_tasks_view()
RETURNS TABLE(
  id uuid,
  sales_value numeric,
  is_masked boolean,
  start_date date,
  end_date date,
  created_by uuid,
  created_at timestamp with time zone,
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
  observations text,
  priority text,
  status text,
  prospect_notes text,
  family_product text,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  email text,
  photos text[],
  documents text[],
  access_level text,
  task_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
  user_filial_id uuid;
  access_level_var text;
BEGIN
  -- Only authenticated users can access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log access attempt
  PERFORM public.secure_log_security_event(
    'secure_tasks_view_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', current_user_role
    ),
    2
  );

  RETURN QUERY
  SELECT 
    t.id,
    -- Apply data masking based on access level
    CASE 
      WHEN current_user_role = 'manager' THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      WHEN auth.uid() = t.created_by THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= 25000 AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    -- Indicate if data is masked
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = t.created_by OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ))
    ) as is_masked,
    
    t.start_date,
    t.end_date,
    t.created_by,
    t.created_at,
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
    t.observations,
    t.priority,
    t.status,
    t.prospect_notes,
    t.family_product,
    t.name,
    t.responsible,
    
    -- Mask client data for limited access users
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      ELSE LEFT(t.client, 3) || '***'
    END as client,
    
    -- Mask property data for limited access users
    CASE 
      WHEN current_user_role = 'manager' THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.property
      WHEN auth.uid() = t.created_by THEN t.property
      ELSE LEFT(t.property, 3) || '***'
    END as property,
    
    t.filial,
    
    -- Mask email for limited access users
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.***'
    END as email,
    
    t.photos,
    t.documents,
    
    -- Set access level
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'full'
      WHEN auth.uid() = t.created_by THEN 'full'
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'limited'
      ELSE 'none'
    END as access_level,
    
    t.task_type
  FROM public.tasks t
  WHERE 
    -- Apply access control filters
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
     ) AND COALESCE(t.sales_value, 0) <= 25000);
END;
$$;