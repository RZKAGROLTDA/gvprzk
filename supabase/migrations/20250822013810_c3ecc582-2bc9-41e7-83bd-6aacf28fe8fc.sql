-- Fix function search path security issue by recreating the function properly
DROP TRIGGER IF EXISTS trigger_log_task_creation ON tasks;

CREATE OR REPLACE FUNCTION log_task_creation()
RETURNS TRIGGER 
SET search_path = public
AS $$
BEGIN
  -- Insert into a log table
  INSERT INTO task_creation_log (
    task_id,
    client,
    property,
    responsible,
    start_date,
    created_at,
    created_by
  ) VALUES (
    NEW.id,
    NEW.client,
    NEW.property,
    NEW.responsible,
    NEW.start_date,
    NEW.created_at,
    NEW.created_by
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_log_task_creation
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_creation();