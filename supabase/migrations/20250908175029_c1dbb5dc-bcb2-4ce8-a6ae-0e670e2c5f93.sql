-- Enhanced security monitoring for clients table customer data access
-- Create trigger to log access to sensitive client contact information

CREATE OR REPLACE FUNCTION public.log_client_contact_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log access to client contact information
  PERFORM public.secure_log_security_event(
    'client_contact_access',
    auth.uid(),
    jsonb_build_object(
      'client_id', COALESCE(NEW.id, OLD.id),
      'operation', TG_OP,
      'table', 'clients',
      'has_email', CASE WHEN COALESCE(NEW.email, OLD.email) IS NOT NULL THEN true ELSE false END,
      'has_phone', CASE WHEN COALESCE(NEW.phone, OLD.phone) IS NOT NULL THEN true ELSE false END,
      'user_role', (SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    ),
    CASE 
      WHEN TG_OP = 'DELETE' THEN 3
      WHEN TG_OP = 'UPDATE' THEN 2
      ELSE 1
    END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for client contact access logging (only for data modification operations)
DROP TRIGGER IF EXISTS client_contact_access_trigger ON public.clients;
CREATE TRIGGER client_contact_access_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.log_client_contact_access();

-- Create function to check for suspicious client data access patterns
CREATE OR REPLACE FUNCTION public.check_client_data_access_patterns()
RETURNS TABLE(
  alert_type text,
  severity text,
  user_count bigint,
  access_count bigint,
  description text,
  recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check for excessive client contact access
  RETURN QUERY
  SELECT 
    'excessive_client_contact_access'::text,
    CASE 
      WHEN COUNT(*) > 100 THEN 'HIGH'
      WHEN COUNT(*) > 50 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(DISTINCT user_id),
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' client contact access events from ', COUNT(DISTINCT user_id), ' users in last 24 hours')::text,
    'Monitor for potential customer contact data harvesting'::text
  FROM public.security_audit_log
  WHERE event_type = 'client_contact_access' 
    AND created_at > now() - interval '24 hours'
  HAVING COUNT(*) > 20;
    
  -- Check for bulk client data access by non-managers
  RETURN QUERY
  SELECT 
    'non_manager_bulk_client_access'::text,
    'MEDIUM'::text,
    COUNT(DISTINCT user_id),
    COUNT(*),
    CONCAT('Non-managers accessed ', COUNT(*), ' client contact records')::text,
    'Review access patterns for potential policy violations'::text
  FROM public.security_audit_log sal
  WHERE event_type = 'client_contact_access' 
    AND created_at > now() - interval '1 hour'
    AND metadata->>'user_role' != 'manager'
  HAVING COUNT(*) > 10;
END;
$$;