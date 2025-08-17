-- Corrigir função de debug com search_path seguro
DROP FUNCTION IF EXISTS log_task_update();

CREATE OR REPLACE FUNCTION log_task_update()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE NOTICE 'Task update attempt: user=%, task_created_by=%, is_prospect=%, sales_confirmed=%', 
    auth.uid(), NEW.created_by, NEW.is_prospect, NEW.sales_confirmed;
  RETURN NEW;
END;
$$;