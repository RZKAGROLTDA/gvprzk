-- FASE 1: CORREÇÃO EMERGENCIAL DOS DADOS CORROMPIDOS

-- 1. Limpar dados JSON corrompidos na tabela tasks
UPDATE public.tasks 
SET equipment_list = '[]'::jsonb 
WHERE equipment_list IS NOT NULL 
  AND NOT (equipment_list::text ~ '^[\[\{].*[\]\}]$');

UPDATE public.tasks 
SET check_in_location = NULL 
WHERE check_in_location IS NOT NULL 
  AND NOT (check_in_location::text ~ '^[\[\{].*[\]\}]$');

-- 2. Limpar arrays corrompidos
UPDATE public.tasks 
SET photos = '{}' 
WHERE photos IS NOT NULL 
  AND array_length(photos, 1) IS NULL;

UPDATE public.tasks 
SET documents = '{}' 
WHERE documents IS NOT NULL 
  AND array_length(documents, 1) IS NULL;

-- 3. Criar função robusta para lidar com dados corrompidos
CREATE OR REPLACE FUNCTION public.get_secure_task_data_enhanced(task_ids uuid[] DEFAULT NULL::uuid[])
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
AS $function$
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
  
  PERFORM public.secure_log_security_event(
    'secure_task_data_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', current_user_role,
      'task_count', COALESCE(array_length(task_ids, 1), 0)
    ),
    2
  );

  RETURN QUERY
  SELECT 
    t.id,
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
    
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = t.created_by OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ))
    ) as is_masked,
    
    t.start_date, t.end_date, t.created_by, t.created_at, t.updated_at,
    t.is_prospect, t.sales_confirmed, t.equipment_quantity, 
    
    -- Fallback seguro para equipment_list
    CASE 
      WHEN t.equipment_list IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(t.equipment_list) = 'array' THEN t.equipment_list
      ELSE '[]'::jsonb
    END as equipment_list,
    
    t.propertyhectares, t.initial_km, t.final_km, 
    
    -- Fallback seguro para check_in_location  
    CASE 
      WHEN t.check_in_location IS NULL THEN NULL
      WHEN jsonb_typeof(t.check_in_location) = 'object' THEN t.check_in_location
      ELSE NULL
    END as check_in_location,
    
    t.clientcode, t.sales_type, t.start_time, t.end_time, t.observations,
    t.priority, t.status, t.prospect_notes, t.family_product,
    t.name, t.responsible,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
    END as client,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.property
      WHEN auth.uid() = t.created_by THEN t.property
      ELSE LEFT(t.property, 2) || '***' || RIGHT(t.property, 1)
    END as property,
    
    t.filial,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.***'
    END as email,
    
    -- Fallback seguro para arrays
    CASE 
      WHEN t.photos IS NULL THEN '{}'::text[]
      WHEN array_length(t.photos, 1) IS NULL THEN '{}'::text[]
      ELSE t.photos
    END as photos,
    
    CASE 
      WHEN t.documents IS NULL THEN '{}'::text[]
      WHEN array_length(t.documents, 1) IS NULL THEN '{}'::text[]
      ELSE t.documents
    END as documents,
    
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
  AND (task_ids IS NULL OR t.id = ANY(task_ids))
  ORDER BY t.created_at DESC;
END;
$function$