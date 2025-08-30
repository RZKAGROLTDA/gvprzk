-- Corrigir problema das foreign keys duplicadas
-- Remove a foreign key duplicada que está causando problemas

-- 1. Primeiro, verificar e remover foreign keys duplicadas
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_filial_id_fkey;

-- 2. Manter apenas a foreign key nomeada que criamos
-- fk_profiles_filial já existe e está funcionando

-- 3. Verificar e corrigir outras possíveis duplicatas
ALTER TABLE tasks_new DROP CONSTRAINT IF EXISTS tasks_new_vendedor_id_fkey;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_task_id_fkey;
ALTER TABLE opportunity_items DROP CONSTRAINT IF EXISTS opportunity_items_opportunity_id_fkey;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_task_id_fkey;
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_task_id_fkey;
ALTER TABLE user_invitations DROP CONSTRAINT IF EXISTS user_invitations_created_by_fkey;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_created_by_fkey;
ALTER TABLE task_creation_log DROP CONSTRAINT IF EXISTS task_creation_log_task_id_fkey;