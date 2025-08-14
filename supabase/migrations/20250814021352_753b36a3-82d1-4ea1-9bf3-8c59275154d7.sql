-- Create a simple RPC function to help with diagnostics
-- This function allows us to execute simple SQL queries for testing

CREATE OR REPLACE FUNCTION public.diagnostic_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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