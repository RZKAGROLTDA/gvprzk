-- FASE 1: CORREÇÃO EMERGENCIAL - Remover função existente e recriar

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

-- 3. Drop e recriar função robusta
DROP FUNCTION IF EXISTS public.get_secure_task_data_enhanced(uuid[]);

CREATE OR REPLACE FUNCTION public.get_secure_task_data_enhanced(task_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(
   id uuid, 
   name text, 
   responsible text, 
   client text, 
   property text, 
   filial text, 
   email text, 
   sales_value numeric, 
   is_masked boolean,
   start_date date, 
   end_date date, 
   task_type text,
   status text,
   priority text,
   access_level text
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

  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
    END as client,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.property
      WHEN auth.uid() = t.created_by THEN t.property
      ELSE LEFT(t.property, 2) || '***' || RIGHT(t.property, 1)
    END as property,
    
    t.filial,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.***'
    END as email,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.sales_value
      WHEN auth.uid() = t.created_by THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    (current_user_role != 'manager' AND auth.uid() != t.created_by) as is_masked,
    
    t.start_date,
    t.end_date,
    t.task_type,
    t.status,
    t.priority,
    
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN auth.uid() = t.created_by THEN 'full'
      ELSE 'limited'
    END as access_level
    
  FROM public.tasks t
  WHERE 
    (auth.uid() = t.created_by) OR
    (current_user_role = 'manager') OR
    (EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
    ))
  AND (task_ids IS NULL OR t.id = ANY(task_ids))
  ORDER BY t.created_at DESC
  LIMIT 1000; -- Limitar resultados para evitar overload
END;
$function$