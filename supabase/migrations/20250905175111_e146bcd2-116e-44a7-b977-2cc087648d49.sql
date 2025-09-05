-- Remover o trigger e a função com CASCADE
DROP TRIGGER IF EXISTS trigger_manage_opportunity_closure ON opportunities;
DROP FUNCTION IF EXISTS manage_opportunity_closure() CASCADE;