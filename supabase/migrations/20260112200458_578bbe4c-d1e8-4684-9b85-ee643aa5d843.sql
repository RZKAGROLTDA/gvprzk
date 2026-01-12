
-- Fix RLS policy for opportunities to properly filter by supervisor's filial
DROP POLICY IF EXISTS "opportunities_select_with_supervisor_filial_access" ON public.opportunities;

CREATE POLICY "opportunities_select_with_supervisor_filial_access" ON public.opportunities
FOR SELECT
USING (
  -- Managers and admins see all
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Users see their own opportunities (via task ownership)
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = opportunities.task_id
    AND t.created_by = auth.uid()
  ) OR
  -- Supervisors see only opportunities from their filial
  (
    has_role(auth.uid(), 'supervisor'::app_role) AND
    EXISTS (
      SELECT 1
      FROM profiles p
      JOIN filiais f ON p.filial_id = f.id
      WHERE p.user_id = auth.uid()
        AND p.approval_status = 'approved'
        AND opportunities.filial = f.nome  -- Compare opportunity's filial with supervisor's filial name
    )
  )
);
