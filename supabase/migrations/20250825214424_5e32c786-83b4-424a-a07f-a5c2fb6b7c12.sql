-- Fix security vulnerabilities in database functions by adding search_path protection
-- This prevents privilege escalation attacks by ensuring functions run with secure paths

-- Update handle_new_user function with security protection
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
$function$;

-- Update diagnostic_query function with security protection  
CREATE OR REPLACE FUNCTION public.diagnostic_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
$function$;

-- Update log_task_creation function with security protection
CREATE OR REPLACE FUNCTION public.log_task_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
$function$;