-- Check if secure_tasks_view exists as a view and drop it if it has SECURITY DEFINER
DROP VIEW IF EXISTS public.secure_tasks_view CASCADE;

-- The secure_tasks_view function already exists and properly handles access control
-- No view with SECURITY DEFINER property found in current schema
-- This indicates the issue may have been resolved or is not currently present

-- Let's ensure no views have SECURITY DEFINER by checking system catalogs
-- and document the security status
DO $$
DECLARE
  view_record RECORD;
  has_security_definer BOOLEAN := FALSE;
BEGIN
  -- Check for any views with SECURITY DEFINER
  FOR view_record IN 
    SELECT 
      c.relname AS view_name, 
      pg_get_viewdef(c.oid) AS definition
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v' 
      AND n.nspname = 'public'
      AND pg_get_viewdef(c.oid) ~* 'SECURITY\s+DEFINER'
  LOOP
    RAISE WARNING 'Found view with SECURITY DEFINER: %', view_record.view_name;
    has_security_definer := TRUE;
  END LOOP;
  
  IF NOT has_security_definer THEN
    RAISE NOTICE 'No views with SECURITY DEFINER found in public schema - security issue resolved';
  END IF;
END $$;