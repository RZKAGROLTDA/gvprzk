
-- Enums
CREATE TYPE public.followup_activity_type AS ENUM ('visita', 'ligacao', 'checklist', 'reuniao', 'outro');
CREATE TYPE public.followup_status AS ENUM ('pendente', 'concluido', 'cancelado', 'reagendado');
CREATE TYPE public.followup_priority AS ENUM ('baixa', 'media', 'alta');
CREATE TYPE public.client_temperature AS ENUM ('frio', 'morno', 'quente');

-- Table
CREATE TABLE public.task_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NULL REFERENCES public.tasks(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_code TEXT NULL,
  activity_type public.followup_activity_type NOT NULL,
  activity_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  next_return_date DATE NULL,
  return_notes TEXT NULL,
  followup_status public.followup_status NOT NULL DEFAULT 'pendente',
  priority public.followup_priority NOT NULL DEFAULT 'media',
  client_temperature public.client_temperature NULL,
  responsible_user_id UUID NOT NULL,
  filial_id UUID NULL REFERENCES public.filiais(id),
  notes TEXT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_task_followups_responsible ON public.task_followups(responsible_user_id);
CREATE INDEX idx_task_followups_filial ON public.task_followups(filial_id);
CREATE INDEX idx_task_followups_activity_date ON public.task_followups(activity_date DESC);
CREATE INDEX idx_task_followups_next_return ON public.task_followups(next_return_date) WHERE next_return_date IS NOT NULL;
CREATE INDEX idx_task_followups_client_name_lower ON public.task_followups(LOWER(client_name));
CREATE INDEX idx_task_followups_client_code ON public.task_followups(client_code) WHERE client_code IS NOT NULL;
CREATE INDEX idx_task_followups_task_id ON public.task_followups(task_id) WHERE task_id IS NOT NULL;

-- RLS
ALTER TABLE public.task_followups ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "task_followups_select"
ON public.task_followups
FOR SELECT
TO authenticated
USING (
  responsible_user_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND filial_id = get_supervisor_filial_id(auth.uid())
  )
);

-- INSERT (restricted by role)
CREATE POLICY "task_followups_insert"
ON public.task_followups
FOR INSERT
TO authenticated
WITH CHECK (
  -- manager/admin: sem restrição
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  -- supervisor: apenas para sua filial
  OR (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND filial_id = get_supervisor_filial_id(auth.uid())
  )
  -- vendedor/demais: apenas em seu próprio nome
  OR (
    responsible_user_id = auth.uid()
    AND created_by = auth.uid()
  )
);

-- UPDATE
CREATE POLICY "task_followups_update"
ON public.task_followups
FOR UPDATE
TO authenticated
USING (
  responsible_user_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND filial_id = get_supervisor_filial_id(auth.uid())
  )
)
WITH CHECK (
  responsible_user_id = auth.uid()
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND filial_id = get_supervisor_filial_id(auth.uid())
  )
);

-- DELETE (admin only)
CREATE POLICY "task_followups_delete_admin"
ON public.task_followups
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER trg_task_followups_updated_at
BEFORE UPDATE ON public.task_followups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
