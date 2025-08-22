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
$function$;