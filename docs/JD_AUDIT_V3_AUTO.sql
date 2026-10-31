-- Auditoria JD v3 — duplicidade automática a partir dos checklists do CRM.
-- Altera SOMENTE o corpo de jd_audit_status_of (mesma assinatura, continua
-- interna: EXECUTE revogado de PUBLIC/anon/authenticated). Todas as funções
-- que já a chamam (jd_classify_checklists, get_service_opportunities_details)
-- passam a devolver a nova classificação sem mudança de assinatura ou acesso.
-- Regra (sobre TODOS os checklists do banco, de qualquer filial):
--   sem chassi                                   -> 'sem_chassi'
--   existe checklist anterior com o mesmo chassi -> 'duplicado'
--     (anterior = start_date menor; empate de data => id menor)
--   caso contrário                               -> 'ok'
-- Cálculo em tempo real: novo checklist já entra na próxima consulta.
-- Preserva jd_chassis_base, jd_chassis_import_batches, jd_audit_imports,
-- jd_audit_rows e todos os checklists (nenhum registro é alterado).

CREATE INDEX IF NOT EXISTS tasks_checklist_chassis_norm_idx
  ON public.tasks (public.normalize_chassis(checklist_machine->>'chassi_serie'), start_date, id)
  WHERE task_type = 'checklist';

CREATE OR REPLACE FUNCTION public.jd_audit_status_of(p_task_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN n.ch = '' THEN 'sem_chassi'
    WHEN EXISTS (
      SELECT 1 FROM tasks o
      WHERE o.task_type = 'checklist'
        AND public.normalize_chassis(o.checklist_machine->>'chassi_serie') = n.ch
        AND (o.start_date, o.id) < (n.start_date, n.id)
    ) THEN 'duplicado'
    ELSE 'ok'
  END
  FROM (
    SELECT t.id, t.start_date,
           public.normalize_chassis(t.checklist_machine->>'chassi_serie') AS ch
    FROM tasks t WHERE t.id = p_task_id AND t.task_type = 'checklist'
  ) n
$$;
REVOKE ALL ON FUNCTION public.jd_audit_status_of(uuid) FROM PUBLIC, anon, authenticated;
