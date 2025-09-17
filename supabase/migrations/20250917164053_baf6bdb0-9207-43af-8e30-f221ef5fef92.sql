-- Fix critical security vulnerability in clients table RLS policies
-- This brings the clients table in line with the secure access patterns used in tasks table

-- First, drop the existing overly permissive policy
DROP POLICY IF EXISTS "secure_clients_access" ON public.clients;

-- Create enhanced RLS policies for clients table that follow the same security model as tasks
-- These policies ensure proper filial-based access control and role restrictions

-- 1. SELECT policy with proper role hierarchy and filial restrictions
CREATE POLICY "enhanced_clients_select" 
ON public.clients 
FOR SELECT 
USING (
  -- User can see their own created clients
  auth.uid() = created_by OR
  -- Managers can see all clients
  (EXISTS ( 
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )) OR
  -- Supervisors can see clients from their filial
  (EXISTS ( 
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = clients.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  )) OR
  -- Other roles (rac, consultant, etc.) can see clients from their filial
  (EXISTS ( 
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = clients.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p1.approval_status = 'approved'
  ))
);

-- 2. INSERT policy - users can only create clients for themselves
CREATE POLICY "enhanced_clients_insert" 
ON public.clients 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- 3. UPDATE policy with same access rules as SELECT
CREATE POLICY "enhanced_clients_update" 
ON public.clients 
FOR UPDATE 
USING (
  -- User can update their own created clients
  auth.uid() = created_by OR
  -- Managers can update all clients
  (EXISTS ( 
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )) OR
  -- Supervisors can update clients from their filial
  (EXISTS ( 
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid()
    AND p2.user_id = clients.created_by
    AND p1.filial_id = p2.filial_id
    AND p1.role = 'supervisor'
    AND p1.approval_status = 'approved'
  ))
)
WITH CHECK (
  -- Same check conditions for update
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
);

-- 4. DELETE policy - only managers and owners can delete clients
CREATE POLICY "enhanced_clients_delete" 
ON public.clients 
FOR DELETE 
USING (
  auth.uid() = created_by OR
  (EXISTS ( 
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ))
);

-- Add security logging trigger for client data access
-- This will help monitor who accesses customer contact information
CREATE OR REPLACE FUNCTION public.log_client_contact_access_enhanced()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      WHEN TG_OP = 'SELECT' THEN 2
      ELSE 1
    END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers for logging client data access
DROP TRIGGER IF EXISTS log_client_contact_access_enhanced_trigger ON public.clients;
CREATE TRIGGER log_client_contact_access_enhanced_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.log_client_contact_access_enhanced();

-- Create function to check for bulk client data access patterns
CREATE OR REPLACE FUNCTION public.monitor_bulk_client_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recent_access_count integer;
  user_role text;
BEGIN
  -- Get user role
  SELECT p.role INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
  
  -- Count recent client access in last hour
  SELECT COUNT(*) INTO recent_access_count
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND event_type = 'client_contact_access_enhanced'
    AND created_at > now() - interval '1 hour';
    
  -- Alert if non-manager accessing too many client records
  IF user_role != 'manager' AND recent_access_count > 20 THEN
    PERFORM public.secure_log_security_event(
      'excessive_client_data_access',
      auth.uid(),
      jsonb_build_object(
        'user_role', user_role,
        'access_count', recent_access_count,
        'time_window', '1 hour',
        'alert_level', 'HIGH'
      ),
      4
    );
  END IF;
END;
$$;