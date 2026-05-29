-- Vínculo N:N entre tasks e client_equipment
CREATE TABLE public.task_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  equipment_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, equipment_id)
);

GRANT SELECT, INSERT, DELETE ON public.task_equipment TO authenticated;
GRANT ALL ON public.task_equipment TO service_role;

ALTER TABLE public.task_equipment ENABLE ROW LEVEL SECURITY;

-- SELECT: dono da task, supervisor da filial da task, manager/admin
CREATE POLICY task_equipment_select
ON public.task_equipment
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_equipment.task_id
      AND (
        t.created_by = auth.uid()
        OR (
          has_role(auth.uid(), 'supervisor'::app_role)
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.filiais f ON f.id = p.filial_id
            WHERE p.user_id = auth.uid()
              AND p.approval_status = 'approved'
              AND LOWER(TRIM(t.filial)) = LOWER(TRIM(f.nome))
          )
        )
      )
  )
);

-- INSERT: dono da task, supervisor da filial da task, manager/admin
CREATE POLICY task_equipment_insert
ON public.task_equipment
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_equipment.task_id
        AND (
          t.created_by = auth.uid()
          OR (
            has_role(auth.uid(), 'supervisor'::app_role)
            AND EXISTS (
              SELECT 1 FROM public.profiles p
              JOIN public.filiais f ON f.id = p.filial_id
              WHERE p.user_id = auth.uid()
                AND p.approval_status = 'approved'
                AND LOWER(TRIM(t.filial)) = LOWER(TRIM(f.nome))
            )
          )
        )
    )
  )
);

-- DELETE: dono da task, supervisor da filial da task, manager/admin
CREATE POLICY task_equipment_delete
ON public.task_equipment
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_equipment.task_id
      AND (
        t.created_by = auth.uid()
        OR (
          has_role(auth.uid(), 'supervisor'::app_role)
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.filiais f ON f.id = p.filial_id
            WHERE p.user_id = auth.uid()
              AND p.approval_status = 'approved'
              AND LOWER(TRIM(t.filial)) = LOWER(TRIM(f.nome))
          )
        )
      )
  )
);

CREATE INDEX idx_task_equipment_task ON public.task_equipment(task_id);
CREATE INDEX idx_task_equipment_equipment ON public.task_equipment(equipment_id);

COMMENT ON TABLE public.task_equipment IS
'Vínculo N:N entre tasks e client_equipment (equipamentos selecionados em uma visita). Snapshot imutável continua em tasks.equipment_list (jsonb).';