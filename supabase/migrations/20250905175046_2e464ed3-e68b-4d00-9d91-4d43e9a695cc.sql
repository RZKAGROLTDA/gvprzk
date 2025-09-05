-- Desabilitar o trigger que está causando conflito
DROP TRIGGER IF EXISTS manage_opportunity_closure_trigger ON opportunities;

-- Remover a função também se não for mais necessária
DROP FUNCTION IF EXISTS manage_opportunity_closure();