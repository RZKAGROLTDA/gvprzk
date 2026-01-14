-- Fix: allow viewing products/reminders for users who can access the parent task via secure access rules

-- Helper function to evaluate access to task-related rows without depending on tasks RLS
CREATE OR REPLACE FUNCTION public.can_access_task_related_data(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
  v_task_filial text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT t.created_by, t.filial
    INTO v_created_by, v_task_filial
  FROM public.tasks t
  WHERE t.id = p_task_id;

  IF v_created_by IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() = v_created_by THEN
    RETURN true;
  END IF;

  v_role := public.get_user_role();

  IF v_role IN ('manager','admin') THEN
    RETURN true;
  END IF;

  IF v_role IN ('supervisor','rac') THEN
    -- Same filial as task owner (works even if tasks table is not selectable by this role)
    IF EXISTS (
      SELECT 1
      FROM public.profiles p1
      JOIN public.profiles p2 ON p2.user_id = v_created_by
      WHERE p1.user_id = auth.uid()
        AND p1.filial_id IS NOT NULL
        AND p1.filial_id = p2.filial_id
    ) THEN
      RETURN true;
    END IF;

    -- Fallback: task.filial string matches user's filial name (when available)
    IF v_task_filial IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.profiles p1
      JOIN public.filiais f ON f.id = p1.filial_id
      WHERE p1.user_id = auth.uid()
        AND p1.approval_status = 'approved'
        AND f.nome = v_task_filial
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_task_related_data(uuid) TO authenticated;

-- Update SELECT policies to use the helper function
DROP POLICY IF EXISTS "Secure product access" ON public.products;
CREATE POLICY "Secure product access"
ON public.products
FOR SELECT
TO authenticated
USING (public.can_access_task_related_data(products.task_id));

DROP POLICY IF EXISTS "Secure reminder access" ON public.reminders;
CREATE POLICY "Secure reminder access"
ON public.reminders
FOR SELECT
TO authenticated
USING (public.can_access_task_related_data(reminders.task_id));
