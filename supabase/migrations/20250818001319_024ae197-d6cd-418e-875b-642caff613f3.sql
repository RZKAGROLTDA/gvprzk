-- Remove o valor padrão da coluna sales_confirmed para permitir NULL
ALTER TABLE tasks ALTER COLUMN sales_confirmed DROP DEFAULT;

-- Corrige dados existentes: tarefas que são prospects mas foram marcadas incorretamente como false
UPDATE tasks 
SET sales_confirmed = NULL 
WHERE is_prospect = true 
AND sales_confirmed = false 
AND (prospect_notes IS NULL OR prospect_notes = '');

-- Adiciona comentário para documentar a mudança
COMMENT ON COLUMN tasks.sales_confirmed IS 'Status de confirmação de venda: true=confirmada, false=perdida, null=prospect em andamento';