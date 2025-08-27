-- Migration script for adding partial sales value calculation
-- Execute this manually in Supabase SQL Editor or via RPC

-- Step 1: Add partial_sales_value column if it doesn't exist
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS partial_sales_value DECIMAL(10,2);

-- Step 2: Create function to calculate partial sales value for a task
CREATE OR REPLACE FUNCTION calculate_task_partial_sales_value(task_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_sales_type TEXT;
  task_sales_confirmed BOOLEAN;
  calculated_value DECIMAL(10,2) := 0;
BEGIN
  -- Get task sales info
  SELECT sales_type, sales_confirmed 
  INTO task_sales_type, task_sales_confirmed
  FROM tasks 
  WHERE id = task_id;
  
  -- Only calculate for confirmed partial sales
  IF task_sales_type = 'parcial' AND task_sales_confirmed = true THEN
    -- Calculate sum of selected products
    SELECT COALESCE(SUM(
      CASE 
        WHEN (product_data->>'selected')::boolean = true 
        THEN (COALESCE((product_data->>'quantity')::decimal, 0) * COALESCE((product_data->>'price')::decimal, 0))
        ELSE 0 
      END
    ), 0)
    INTO calculated_value
    FROM task_products tp
    WHERE tp.task_id = calculate_task_partial_sales_value.task_id;
  END IF;
  
  RETURN calculated_value;
END;
$$;

-- Step 3: Create RPC function to migrate all historical data
CREATE OR REPLACE FUNCTION migrate_partial_sales_values()
RETURNS TABLE(updated_count INTEGER, total_processed INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_record RECORD;
  calculated_value DECIMAL(10,2);
  update_count INTEGER := 0;
  process_count INTEGER := 0;
BEGIN
  -- Process all tasks with partial sales
  FOR task_record IN 
    SELECT id FROM tasks 
    WHERE sales_type = 'parcial' AND sales_confirmed = true
  LOOP
    process_count := process_count + 1;
    
    -- Calculate partial sales value
    calculated_value := calculate_task_partial_sales_value(task_record.id);
    
    -- Update the task with calculated value
    UPDATE tasks 
    SET partial_sales_value = calculated_value,
        updated_at = NOW()
    WHERE id = task_record.id;
    
    update_count := update_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT update_count, process_count;
END;
$$;

-- Step 4: Create trigger function to automatically update partial_sales_value
CREATE OR REPLACE FUNCTION update_partial_sales_value_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_value DECIMAL(10,2);
BEGIN
  -- Only update for partial sales
  IF NEW.sales_type = 'parcial' AND NEW.sales_confirmed = true THEN
    calculated_value := calculate_task_partial_sales_value(NEW.id);
    NEW.partial_sales_value := calculated_value;
  ELSIF NEW.sales_type != 'parcial' THEN
    NEW.partial_sales_value := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 5: Create trigger on tasks table
DROP TRIGGER IF EXISTS trigger_update_partial_sales_value ON tasks;
CREATE TRIGGER trigger_update_partial_sales_value
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_partial_sales_value_trigger();

-- Step 6: Create trigger function for task_products changes
CREATE OR REPLACE FUNCTION update_task_partial_sales_on_products_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  task_sales_type TEXT;
  task_sales_confirmed BOOLEAN;
  calculated_value DECIMAL(10,2);
BEGIN
  -- Get task info
  SELECT sales_type, sales_confirmed 
  INTO task_sales_type, task_sales_confirmed
  FROM tasks 
  WHERE id = COALESCE(NEW.task_id, OLD.task_id);
  
  -- Only update for confirmed partial sales
  IF task_sales_type = 'parcial' AND task_sales_confirmed = true THEN
    calculated_value := calculate_task_partial_sales_value(COALESCE(NEW.task_id, OLD.task_id));
    
    UPDATE tasks 
    SET partial_sales_value = calculated_value,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.task_id, OLD.task_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 7: Create trigger on task_products table
DROP TRIGGER IF EXISTS trigger_update_task_partial_sales_on_products ON task_products;
CREATE TRIGGER trigger_update_task_partial_sales_on_products
  AFTER INSERT OR UPDATE OR DELETE ON task_products
  FOR EACH ROW
  EXECUTE FUNCTION update_task_partial_sales_on_products_change();

-- Step 8: Grant execute permissions
GRANT EXECUTE ON FUNCTION migrate_partial_sales_values() TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_task_partial_sales_value(UUID) TO authenticated;

-- Step 9: Run the migration (uncomment to execute)
-- SELECT * FROM migrate_partial_sales_values();