-- Fix: allow app_role 'admin' to access customer data-dependent resources (products/reminders)
-- This prevents edit modals from showing 0 products for admins.

CREATE OR REPLACE FUNCTION public.can_access_customer_data(task_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = task_owner_id THEN true
    WHEN public.get_user_role() IN ('manager','admin') THEN true
    WHEN public.get_user_role() = 'supervisor' AND EXISTS (
      SELECT 1
      FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid()
        AND p2.user_id = task_owner_id
        AND p1.filial_id = p2.filial_id
        AND p1.filial_id IS NOT NULL
    ) THEN true
    ELSE false
  END;
$$;