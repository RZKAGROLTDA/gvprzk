-- 1. Trigger que impede usuário comum de alterar campos administrativos do próprio perfil
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- Admin/manager podem alterar qualquer campo
  is_privileged := has_role(auth.uid(), 'admin'::app_role)
                OR has_role(auth.uid(), 'manager'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Para usuários comuns, reverte qualquer alteração em campos administrativos
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    NEW.approval_status := OLD.approval_status;
  END IF;

  IF NEW.filial_id IS DISTINCT FROM OLD.filial_id THEN
    NEW.filial_id := OLD.filial_id;
  END IF;

  -- Email também não deve ser alterado livremente (vinculado ao auth.users)
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := OLD.email;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_privilege_escalation_trigger ON public.profiles;
CREATE TRIGGER prevent_self_privilege_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- 2. Substituir policy de opportunity_items que lê profiles.role diretamente
DROP POLICY IF EXISTS opportunity_items_access ON public.opportunity_items;

CREATE POLICY opportunity_items_access
ON public.opportunity_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM opportunities o
    JOIN tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid()
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR (
          has_role(auth.uid(), 'supervisor'::app_role)
          AND EXISTS (
            SELECT 1 FROM profiles p
            JOIN filiais f ON p.filial_id = f.id
            WHERE p.user_id = auth.uid()
              AND p.approval_status = 'approved'
              AND t.filial = f.nome
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM opportunities o
    JOIN tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid()
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR (
          has_role(auth.uid(), 'supervisor'::app_role)
          AND EXISTS (
            SELECT 1 FROM profiles p
            JOIN filiais f ON p.filial_id = f.id
            WHERE p.user_id = auth.uid()
              AND p.approval_status = 'approved'
              AND t.filial = f.nome
          )
        )
      )
  )
);

-- 3. Restringir SELECT em task_access_metadata para seguir a mesma lógica de tasks
DROP POLICY IF EXISTS "Authenticated users can read task metadata" ON public.task_access_metadata;

CREATE POLICY task_access_metadata_select
ON public.task_access_metadata
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND creator_filial_id = get_supervisor_filial_id(auth.uid())
  )
);