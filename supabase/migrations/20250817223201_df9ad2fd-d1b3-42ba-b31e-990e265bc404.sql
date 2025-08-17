-- Remover trigger e função de debug
DROP TRIGGER IF EXISTS log_task_updates ON tasks;
DROP FUNCTION IF EXISTS log_task_update() CASCADE;