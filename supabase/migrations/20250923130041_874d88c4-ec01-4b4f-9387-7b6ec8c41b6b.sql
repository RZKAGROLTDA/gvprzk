-- Critical Security Fix: Secure Clients Table Access (Corrected)
-- Issue: Customer contact information could be stolen due to insufficient data masking

-- 1. Create secure client data access function with proper masking
CREATE OR REPLACE FUNCTION public.get_secure_clients_enhanced()
 RETURNS TABLE(
   id uuid, name text, email text, phone text, notes text, 
   stage text, session_type text, workflow_status text,
   session_date date, voucher_date date, gallery_date date, 
   preview_date date, budget_date date, return_date date,
   archived boolean, archive_reason text, archived_at timestamp with time zone,
   attachments text[], created_at timestamp with time zone, 
   created_by uuid, updated_at timestamp with time zone,
   access_level text, is_contact_masked boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_user_filial uuid;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, current_user_filial
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- If no approved profile, return empty
  IF current_user_role IS NULL THEN
    RETURN;
  END IF;
  
  -- Log client data access
  PERFORM public.secure_log_security_event(
    'secure_client_data_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'filial_id', current_user_filial,
      'access_type', 'client_contact_data'
    ),
    3 -- Medium-high risk for client data access
  );
  
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    -- SECURE EMAIL MASKING - only managers and owners see full emails
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.email
      ELSE 'protected@client.data'
    END as email,
    -- SECURE PHONE MASKING - only managers and owners see full phones
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.phone
      ELSE '+55 (***) ****-****'
    END as phone,
    -- SECURE NOTES MASKING - only managers and owners see full notes
    CASE 
      WHEN current_user_role = 'manager' OR c.created_by = auth.uid() THEN c.notes
      ELSE '[Notes protected for privacy]'
    END as notes,
    c.stage,
    c.session_type,
    c.workflow_status,
    c.session_date,
    c.voucher_date,
    c.gallery_date,
    c.preview_date,
    c.budget_date,
    c.return_date,
    c.archived,
    c.archive_reason,
    c.archived_at,
    c.attachments,
    c.created_at,
    c.created_by,
    c.updated_at,
    -- ACCESS LEVEL INDICATOR
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN c.created_by = auth.uid() THEN 'owner'
      ELSE 'limited'
    END as access_level,
    -- MASKING FLAG
    NOT (current_user_role = 'manager' OR c.created_by = auth.uid()) as is_contact_masked
  FROM public.clients c
  WHERE (
    -- Enhanced access controls - only allow access to own clients or manager access
    current_user_role = 'manager' OR
    c.created_by = auth.uid() OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = c.created_by 
      AND p.filial_id = current_user_filial
    ))
  )
  ORDER BY c.created_at DESC;
END;
$function$;

-- 2. Create monitoring trigger (only for INSERT/UPDATE/DELETE - not SELECT)
CREATE OR REPLACE FUNCTION public.log_client_contact_access_enhanced()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Log access to client contact information with enhanced metadata
  PERFORM public.secure_log_security_event(
    'client_contact_access_enhanced',
    auth.uid(),
    jsonb_build_object(
      'client_id', COALESCE(NEW.id, OLD.id),
      'operation', TG_OP,
      'table', 'clients',
      'has_email', CASE WHEN COALESCE(NEW.email, OLD.email) IS NOT NULL THEN true ELSE false END,
      'has_phone', CASE WHEN COALESCE(NEW.phone, OLD.phone) IS NOT NULL THEN true ELSE false END,
      'user_role', (SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
      'user_filial', (SELECT filial_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
      'client_name', COALESCE(NEW.name, OLD.name)
    ),
    CASE 
      WHEN TG_OP = 'DELETE' THEN 4
      WHEN TG_OP = 'UPDATE' AND (NEW.email != OLD.email OR NEW.phone != OLD.phone) THEN 3
      ELSE 2
    END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Add trigger to monitor client modifications (not SELECT)
DROP TRIGGER IF EXISTS trigger_log_client_contact_access ON public.clients;
CREATE TRIGGER trigger_log_client_contact_access
    AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.log_client_contact_access_enhanced();

-- 4. Update clients table RLS policies to be more restrictive for contact data
-- Remove the overly permissive policy that allows all users in same filial
DROP POLICY IF EXISTS "enhanced_clients_select" ON public.clients;

-- Create new restrictive policy that requires additional checks
CREATE POLICY "secure_clients_select_contact_protected" 
ON public.clients 
FOR SELECT 
USING (
  -- Only allow access to own clients, managers, or supervisors in same filial
  auth.uid() = created_by OR
  (EXISTS ( 
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )) OR
  (EXISTS ( 
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = clients.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  ))
  -- REMOVED: Access for consultants/RACs to prevent unauthorized contact data access
);

-- 5. Create view for secure client access with masked data
CREATE OR REPLACE VIEW public.secure_clients_view AS
SELECT 
  id, name, stage, session_type, workflow_status,
  session_date, voucher_date, gallery_date, preview_date, 
  budget_date, return_date, archived, archive_reason,
  archived_at, attachments, created_at, created_by, updated_at,
  -- Mask sensitive contact information
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR created_by = auth.uid() THEN email
    ELSE 'protected@client.data'
  END as email,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR created_by = auth.uid() THEN phone
    ELSE '+55 (***) ****-****'
  END as phone,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR created_by = auth.uid() THEN notes
    ELSE '[Notes protected for privacy]'
  END as notes
FROM public.clients
WHERE (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ) OR
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = clients.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  )
);