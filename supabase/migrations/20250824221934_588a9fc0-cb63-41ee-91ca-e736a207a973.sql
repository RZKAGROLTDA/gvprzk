-- Remove the overly permissive public access policy for filiais table
DROP POLICY IF EXISTS "Everyone can view filiais for registration" ON public.filiais;

-- Create a secure function to get filiais for registration only
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

-- Create a new policy for authenticated users to view filiais
CREATE POLICY "Authenticated users can view filiais" ON public.filiais
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Log this security improvement
INSERT INTO public.security_audit_log (
  event_type,
  user_id,
  metadata,
  risk_score,
  created_at
) VALUES (
  'security_policy_update',
  NULL,
  jsonb_build_object(
    'action', 'removed_public_filiais_access',
    'description', 'Removed public access to filiais table and created secure registration function',
    'security_improvement', true
  ),
  2,
  now()
);