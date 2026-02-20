-- Índice para ORDER BY created_at DESC na tabela de backup.
-- Reduz full table scan + sort e melhora cache hit (menos I/O em EBS).
CREATE INDEX IF NOT EXISTS idx_tasks_backup_oct2025_created_at_desc
  ON public.tasks_backup_oct2025 (created_at DESC NULLS LAST);
