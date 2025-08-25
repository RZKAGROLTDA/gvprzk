-- Security Enhancement: Update function search paths to prevent manipulation attacks

-- Update get_filiais_for_registration function
CREATE OR REPLACE FUNCTION public.get_filiais_for_registration()
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Allow anyone to get basic filiais info for registration
  -- This is safer than public table access as it's controlled
  RETURN QUERY
  SELECT f.id, f.nome
  FROM public.filiais f
  ORDER BY f.nome;
END;
$function$;

-- Update diagnostic_query function
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

-- Update handle_new_user function
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

-- Update is_admin function  
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
END;
$function$;

-- Update current_user_is_admin function
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
$function$;

-- Update user_same_filial function
CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = target_user_id
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  );
$function$;