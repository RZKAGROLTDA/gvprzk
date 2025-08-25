-- Customer Data Protection: Implement granular access controls for sensitive task data

-- 1. Create function to determine data access level based on user role and relationship to task
CREATE OR REPLACE FUNCTION public.get_task_data_access_level(task_created_by uuid, task_sales_value numeric)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
  current_user_filial uuid;
  task_creator_filial uuid;
  is_same_filial boolean := false;
BEGIN
  -- Get current user's role and filial
  SELECT role, filial_id INTO current_user_role, current_user_filial
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Get task creator's filial
  SELECT filial_id INTO task_creator_filial
  FROM public.profiles
  WHERE user_id = task_created_by;
  
  -- Check if same filial
  is_same_filial := (current_user_filial = task_creator_filial AND current_user_filial IS NOT NULL);
  
  -- Determine access level
  CASE 
    -- Task creator gets full access
    WHEN auth.uid() = task_created_by THEN
      RETURN 'full';
    
    -- Managers get full access to all tasks
    WHEN current_user_role = 'manager' THEN
      RETURN 'full';
    
    -- Supervisors get full access to tasks in their filial, limited for high-value tasks from other filials
    WHEN current_user_role = 'supervisor' THEN
      IF is_same_filial THEN
        RETURN 'full';
      ELSIF COALESCE(task_sales_value, 0) > 50000 THEN
        RETURN 'none'; -- No access to high-value tasks from other filials
      ELSE
        RETURN 'limited';
      END IF;
    
    -- Consultants get limited access to tasks in their filial for low-value tasks only
    WHEN current_user_role IN ('sales_consultant', 'technical_consultant', 'consultant', 'rac') THEN
      IF is_same_filial AND COALESCE(task_sales_value, 0) <= 25000 THEN
        RETURN 'limited';
      ELSE
        RETURN 'none';
      END IF;
    
    ELSE
      RETURN 'none';
  END CASE;
END;
$$;

-- 2. Create function to get masked customer data based on access level
CREATE OR REPLACE FUNCTION public.get_masked_task_data(
  original_client text,
  original_email text,
  original_property text,
  original_sales_value numeric,
  access_level text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  CASE access_level
    WHEN 'full' THEN
      RETURN jsonb_build_object(
        'client', original_client,
        'email', original_email,
        'property', original_property,
        'sales_value', original_sales_value,
        'is_masked', false
      );
    
    WHEN 'limited' THEN
      RETURN jsonb_build_object(
        'client', LEFT(original_client, 3) || '***',
        'email', CASE 
          WHEN original_email IS NOT NULL 
          THEN LEFT(split_part(original_email, '@', 1), 2) || '***@' || split_part(original_email, '@', 2)
          ELSE NULL 
        END,
        'property', LEFT(original_property, 3) || '***',
        'sales_value', CASE 
          WHEN original_sales_value > 10000 THEN '>10k'
          WHEN original_sales_value > 5000 THEN '5k-10k'
          WHEN original_sales_value > 1000 THEN '1k-5k'
          ELSE '<1k'
        END,
        'is_masked', true
      );
    
    ELSE -- 'none'
      RETURN jsonb_build_object(
        'client', '***',
        'email', '***',
        'property', '***',
        'sales_value', '***',
        'is_masked', true
      );
  END CASE;
END;
$$;

-- 3. Create secure view for task data with customer protection
CREATE OR REPLACE VIEW public.secure_tasks_view AS
SELECT 
  t.id,
  t.name,
  t.responsible,
  t.task_type,
  t.start_date,
  t.end_date,
  t.start_time,
  t.end_time,
  t.status,
  t.priority,
  t.observations,
  t.filial,
  t.is_prospect,
  t.sales_confirmed,
  t.created_at,
  t.updated_at,
  t.created_by,
  
  -- Apply customer data masking based on access level
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) IN ('full', 'limited') THEN
      (public.get_masked_task_data(t.client, t.email, t.property, t.sales_value, 
       public.get_task_data_access_level(t.created_by, t.sales_value)))
    ELSE NULL
  END as customer_data,
  
  -- Only show sensitive fields for full access
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) = 'full' THEN t.clientcode
    ELSE NULL 
  END as clientcode,
  
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) = 'full' THEN t.propertyhectares
    ELSE NULL 
  END as propertyhectares,
  
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) = 'full' THEN t.equipment_quantity
    ELSE NULL 
  END as equipment_quantity,
  
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) = 'full' THEN t.equipment_list
    ELSE NULL 
  END as equipment_list,
  
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) = 'full' THEN t.family_product
    ELSE NULL 
  END as family_product,
  
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) = 'full' THEN t.prospect_notes
    ELSE NULL 
  END as prospect_notes,
  
  -- Log sensitive data access
  CASE 
    WHEN public.get_task_data_access_level(t.created_by, t.sales_value) IN ('full', 'limited') THEN
      (SELECT public.log_sensitive_data_access('task_customer_data', t.id, 'view'), true)
    ELSE false
  END as access_logged

FROM public.tasks t
WHERE 
  -- Only show tasks user has some level of access to
  public.get_task_data_access_level(t.created_by, t.sales_value) != 'none';

-- 4. Create function to get secure task data (for API use)
CREATE OR REPLACE FUNCTION public.get_secure_task_data(task_ids uuid[] DEFAULT NULL)
RETURNS SETOF public.secure_tasks_view
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT * FROM public.secure_tasks_view
  WHERE (task_ids IS NULL OR id = ANY(task_ids))
  ORDER BY created_at DESC;
$$;

-- 5. Enhanced logging for customer data access
CREATE OR REPLACE FUNCTION public.log_customer_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Log access to sensitive customer data
  IF TG_OP = 'SELECT' THEN
    PERFORM public.secure_log_security_event(
      'customer_data_accessed',
      NEW.created_by,
      jsonb_build_object(
        'task_id', NEW.id,
        'access_level', public.get_task_data_access_level(NEW.created_by, NEW.sales_value),
        'sales_value_range', CASE 
          WHEN NEW.sales_value > 50000 THEN 'high'
          WHEN NEW.sales_value > 25000 THEN 'medium'
          ELSE 'low'
        END,
        'accessed_fields', ARRAY['client', 'email', 'property', 'sales_value']
      ),
      CASE 
        WHEN public.get_task_data_access_level(NEW.created_by, NEW.sales_value) = 'limited' THEN 3
        ELSE 2
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$;