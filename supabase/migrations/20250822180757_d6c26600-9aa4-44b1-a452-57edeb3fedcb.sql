-- Enhanced email privacy protection - completely hide emails from same-filial users
CREATE OR REPLACE FUNCTION public.get_user_directory()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Only authenticated users can access this function
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- CRITICAL PRIVACY FIX: Only expose emails to self or admins, NEVER to same filial users
    CASE 
      WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
      ELSE NULL::text  -- Completely hide emails from all other users
    END as email,
    p.role,
    p.filial_id,
    p.approval_status,
    f.nome as filial_nome
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE 
    -- User can see their own profile
    auth.uid() = p.user_id OR
    -- Managers can see all profiles  
    current_user_is_admin() OR
    -- Users can see VERY LIMITED info from same filial (NO emails, NO personal data)
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$function$

-- Enhanced invitation token security with better validation
CREATE OR REPLACE FUNCTION public.consume_invitation_token(token_value text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  invitation_record record;
  result json;
BEGIN
  -- Enhanced validation: check token format and length
  IF token_value IS NULL OR LENGTH(token_value) < 32 THEN
    -- Log suspicious token access attempt
    PERFORM public.secure_log_security_event(
      'invalid_invitation_token_format',
      NULL,
      jsonb_build_object('token_length', COALESCE(LENGTH(token_value), 0)),
      3
    );
    RETURN '{"error": "Invalid token format"}'::json;
  END IF;
  
  -- Find and validate the invitation with additional security checks
  SELECT * INTO invitation_record
  FROM public.user_invitations
  WHERE token = token_value
    AND status = 'pending'
    AND expires_at > now()
    AND used_at IS NULL;
  
  IF NOT FOUND THEN
    -- Log failed token consumption attempt
    PERFORM public.secure_log_security_event(
      'invalid_invitation_token_access',
      NULL,
      jsonb_build_object('token_prefix', LEFT(token_value, 4)),
      4
    );
    RETURN '{"error": "Invalid or expired token"}'::json;
  END IF;
  
  -- Log successful token consumption
  PERFORM public.secure_log_security_event(
    'invitation_token_consumed',
    invitation_record.created_by,
    jsonb_build_object(
      'invitation_id', invitation_record.id,
      'invited_email', invitation_record.email
    ),
    2
  );
  
  -- Mark token as used with enhanced security
  UPDATE public.user_invitations
  SET 
    status = 'used',
    used_at = now(),
    used_by = auth.uid(),
    -- Clear the token for security
    token = 'CONSUMED_' || EXTRACT(EPOCH FROM now())::text
  WHERE id = invitation_record.id;
  
  -- Return invitation details (without the token)
  result := json_build_object(
    'id', invitation_record.id,
    'email', invitation_record.email,
    'created_by', invitation_record.created_by,
    'created_at', invitation_record.created_at
  );
  
  RETURN result;
END;
$function$

-- Enhanced security audit log cleanup with data retention
CREATE OR REPLACE FUNCTION public.cleanup_security_audit_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Only admins can run cleanup
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Archive old high-risk events (keep for 1 year)
  -- Delete low-risk events older than 90 days
  DELETE FROM public.security_audit_log
  WHERE created_at < now() - interval '90 days'
    AND risk_score <= 2;
  
  -- Delete medium-risk events older than 6 months
  DELETE FROM public.security_audit_log
  WHERE created_at < now() - interval '6 months'
    AND risk_score <= 3;
  
  -- Keep high-risk events for 1 year
  DELETE FROM public.security_audit_log
  WHERE created_at < now() - interval '1 year'
    AND risk_score >= 4;
    
  -- Anonymize IP addresses in logs older than 30 days for privacy
  UPDATE public.security_audit_log
  SET ip_address = '0.0.0.0'::inet,
      user_agent = 'ANONYMIZED'
  WHERE created_at < now() - interval '30 days'
    AND ip_address IS NOT NULL;
END;
$function$