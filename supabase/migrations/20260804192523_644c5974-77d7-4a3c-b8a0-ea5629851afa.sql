CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized_email text;
  caller_ip inet;
  failed_attempts integer;
  email_checks integer;
  ip_checks integer;
  last_attempt_time timestamptz;
BEGIN
  normalized_email := lower(trim(COALESCE(user_email, '')));
  caller_ip := inet_client_addr();

  IF length(normalized_email) < 3
     OR length(normalized_email) > 254
     OR normalized_email !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' COLLATE "C" THEN
    RETURN false;
  END IF;

  SELECT count(*), max(created_at)
  INTO failed_attempts, last_attempt_time
  FROM public.security_audit_log
  WHERE event_type = 'login_attempt_failed'
    AND lower(metadata->>'email') = normalized_email
    AND created_at > now() - interval '1 hour';

  SELECT count(*)
  INTO email_checks
  FROM public.security_audit_log
  WHERE event_type = 'login_rate_limit_check'
    AND lower(metadata->>'email') = normalized_email
    AND created_at > now() - interval '1 minute';

  SELECT count(*)
  INTO ip_checks
  FROM public.security_audit_log
  WHERE event_type = 'login_rate_limit_check'
    AND ip_address IS NOT DISTINCT FROM caller_ip
    AND created_at > now() - interval '1 minute';

  IF failed_attempts >= 5 OR email_checks >= 10 OR ip_checks >= 30 THEN
    BEGIN
      PERFORM public.secure_log_security_event(
        'login_rate_limit_exceeded',
        NULL,
        jsonb_build_object(
          'email', normalized_email,
          'failed_attempts', failed_attempts,
          'email_checks', email_checks,
          'ip_checks', ip_checks,
          'last_attempt', last_attempt_time
        ),
        5
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN false;
  END IF;

  BEGIN
    PERFORM public.secure_log_security_event(
      'login_rate_limit_check',
      NULL,
      jsonb_build_object('email', normalized_email),
      1
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO service_role;