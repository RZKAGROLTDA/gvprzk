-- Corrigir dados existentes: definir sales_confirmed como NULL para prospects ativos
-- que não foram explicitamente marcados como perdidos
UPDATE tasks 
SET sales_confirmed = NULL 
WHERE is_prospect = true 
  AND sales_confirmed = false 
  AND (prospect_notes IS NULL OR prospect_notes = '' OR prospect_notes NOT IN ('Falta de peça', 'Preço', 'Prazo'));