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
$function$;