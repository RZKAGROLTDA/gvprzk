-- Fix all remaining SECURITY DEFINER functions by removing the property
-- This will completely resolve the Security Definer View linter error

-- Get the list of remaining functions and fix them all
DO $$
DECLARE
    func_record RECORD;
    func_definition TEXT;
BEGIN
    -- Fix all remaining security definer functions
    FOR func_record IN 
        SELECT p.proname, p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true
    LOOP
        -- Update the function to remove SECURITY DEFINER
        EXECUTE format('ALTER FUNCTION public.%I() SECURITY INVOKER', func_record.proname);
        RAISE NOTICE 'Fixed SECURITY DEFINER for function: %', func_record.proname;
    END LOOP;
END $$;

-- Verify no more security definer functions exist
DO $$
DECLARE
    definer_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO definer_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.prosecdef = true;
      
    IF definer_count = 0 THEN
        RAISE NOTICE 'SUCCESS: No more SECURITY DEFINER functions found in public schema';
    ELSE
        RAISE WARNING 'Still found % SECURITY DEFINER functions', definer_count;
    END IF;
END $$;