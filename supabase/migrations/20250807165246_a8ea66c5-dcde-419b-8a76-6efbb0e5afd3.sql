-- Script para resetar dados de teste
-- Remove todas as tarefas de teste
DELETE FROM products WHERE task_id IN (SELECT id FROM tasks);
DELETE FROM reminders WHERE task_id IN (SELECT id FROM tasks);
DELETE FROM tasks;

-- Reseta sequências se necessário
-- Os dados dos perfis e filiais são mantidos