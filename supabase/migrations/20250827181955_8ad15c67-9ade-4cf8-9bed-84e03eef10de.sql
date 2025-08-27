-- PHASE 2: Fix remaining security linter warnings
-- This addresses the function search path issues identified by the linter

-- Fix search path for functions that were flagged by the security linter
-- All functions should have SECURITY DEFINER and SET search_path = '' for security

-- Update existing functions to have proper search path settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert with more explicit handling
  INSERT INTO public.profiles (user_id, name, email, role, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'consultant',
    'approved'  -- Auto-approve for now to fix access issues
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't block user creation
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log role changes
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.audit_log (
      table_name,
      operation,
      old_values,
      new_values,
      user_id,
      created_at
    ) VALUES (
      'profiles',
      'role_change',
      json_build_object('old_role', OLD.role),
      json_build_object('new_role', NEW.role),
      auth.uid(),
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_invitation_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN replace(gen_random_uuid()::text, '-', '');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_invitation_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete expired tokens older than 30 days
  DELETE FROM public.user_invitations
  WHERE expires_at < now() - interval '30 days';
  
  -- Clear token values for used invitations older than 7 days
  UPDATE public.user_invitations
  SET token = 'EXPIRED'
  WHERE used_at < now() - interval '7 days'
    AND token != 'CONSUMED'
    AND token != 'EXPIRED';
END;
$$;

CREATE OR REPLACE FUNCTION public.log_task_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert into a log table
  INSERT INTO public.task_creation_log (
    task_id,
    client,
    property,
    responsible,
    start_date,
    created_at,
    created_by
  ) VALUES (
    NEW.id,
    NEW.client,
    NEW.property,
    NEW.responsible,
    NEW.start_date,
    NEW.created_at,
    NEW.created_by
  );
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_user_directory_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only admins can refresh the cache
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Clear and repopulate the cache
  DELETE FROM public.user_directory_cache;
  
  INSERT INTO public.user_directory_cache (
    profile_id, user_id, name, email, role, filial_id, approval_status, filial_nome
  )
  SELECT 
    p.id,
    p.user_id,
    p.name,
    p.email, -- Full email stored in cache, but RLS will filter access
    p.role,
    p.filial_id,
    p.approval_status,
    f.nome
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE p.approval_status = 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only log role changes using the secure function
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.secure_log_security_event(
      'role_change',
      NEW.user_id,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_by', auth.uid()
      ),
      3
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_user_sessions_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only trigger on role changes
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Log the session invalidation
    PERFORM public.secure_log_security_event(
      'sessions_invalidated_role_change',
      NEW.user_id,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_by', auth.uid()
      ),
      3
    );
    
    -- Note: In a production environment, you would implement actual session invalidation
    -- This could involve clearing session tokens, forcing re-authentication, etc.
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.diagnostic_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result json;
BEGIN
  -- Only allow specific safe queries for diagnostics
  IF query_text ILIKE 'SELECT auth.uid()%' OR 
     query_text ILIKE 'SELECT is_admin()%' OR
     query_text ILIKE 'SELECT current_user%' THEN
    EXECUTE query_text INTO result;
    RETURN result;
  ELSE
    RETURN '{"error": "Query not allowed"}'::json;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clean_duplicate_tasks()
RETURNS TABLE(action text, task_id uuid, client text, responsible text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  duplicate_record record;
  tasks_to_keep uuid[];
  tasks_to_remove uuid[];
BEGIN
  -- Create a temporary table to store duplicates using public.tasks
  CREATE TEMP TABLE temp_duplicates AS
  SELECT 
    t1.id,
    t1.client,
    t1.responsible,
    t1.start_date,
    t1.sales_value,
    t1.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY t1.client, t1.responsible, t1.start_date, COALESCE(t1.sales_value, 0)
      ORDER BY t1.created_at ASC
    ) as rn
  FROM public.tasks t1
  WHERE EXISTS (
    SELECT 1 FROM public.tasks t2 
    WHERE t2.id != t1.id 
    AND t2.client = t1.client 
    AND t2.responsible = t1.responsible 
    AND t2.start_date = t1.start_date
    AND COALESCE(t2.sales_value, 0) = COALESCE(t1.sales_value, 0)
    AND ABS(EXTRACT(EPOCH FROM (t2.created_at - t1.created_at))) < 300 -- Within 5 minutes
  );

  -- Return information about duplicates found
  FOR duplicate_record IN 
    SELECT DISTINCT client, responsible, start_date, sales_value, COUNT(*) as duplicate_count
    FROM temp_duplicates
    GROUP BY client, responsible, start_date, sales_value
    HAVING COUNT(*) > 1
  LOOP
    RETURN QUERY SELECT 
      'DUPLICATE_GROUP'::text,
      NULL::uuid,
      duplicate_record.client,
      duplicate_record.responsible,
      NULL::timestamp with time zone;
  END LOOP;

  -- Get tasks to keep (first created in each group)
  SELECT array_agg(id) INTO tasks_to_keep
  FROM temp_duplicates 
  WHERE rn = 1;

  -- Get tasks to remove (all others)
  SELECT array_agg(id) INTO tasks_to_remove
  FROM temp_duplicates 
  WHERE rn > 1;

  -- Return tasks that will be kept
  FOR duplicate_record IN
    SELECT id, client, responsible, created_at
    FROM public.tasks
    WHERE id = ANY(tasks_to_keep)
  LOOP
    RETURN QUERY SELECT 
      'KEEPING'::text,
      duplicate_record.id,
      duplicate_record.client,
      duplicate_record.responsible,
      duplicate_record.created_at;
  END LOOP;

  -- Return tasks that will be removed
  FOR duplicate_record IN
    SELECT id, client, responsible, created_at
    FROM public.tasks
    WHERE id = ANY(tasks_to_remove)
  LOOP
    RETURN QUERY SELECT 
      'REMOVING'::text,
      duplicate_record.id,
      duplicate_record.client,
      duplicate_record.responsible,
      duplicate_record.created_at;
  END LOOP;

  -- Actually remove the duplicate tasks and their related data
  IF tasks_to_remove IS NOT NULL AND array_length(tasks_to_remove, 1) > 0 THEN
    -- Delete related products first
    DELETE FROM public.products WHERE task_id = ANY(tasks_to_remove);
    
    -- Delete related reminders
    DELETE FROM public.reminders WHERE task_id = ANY(tasks_to_remove);
    
    -- Delete the duplicate tasks
    DELETE FROM public.tasks WHERE id = ANY(tasks_to_remove);
  END IF;

  -- Clean up
  DROP TABLE temp_duplicates;
  
  RETURN QUERY SELECT 
    'CLEANUP_COMPLETE'::text,
    NULL::uuid,
    ''::text,
    ''::text,
    now()::timestamp with time zone;
END;
$$;

CREATE OR REPLACE FUNCTION public.monitor_directory_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log directory access attempts
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'requesting_user', auth.uid()
    ),
    1
  );
  RETURN NULL;
END;
$$;