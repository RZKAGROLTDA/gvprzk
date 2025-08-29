-- Simplified migration for partial_sales_value column
-- Only add column and basic functions without task_products dependency

-- Step 1: Add partial_sales_value column if it doesn't exist
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS partial_sales_value DECIMAL(10,2);

-- Step 2: Create simplified function to calculate partial sales value
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
    -- Try to calculate from products table if it exists
    SELECT COALESCE(SUM(
      CASE 
        WHEN selected = true 
        THEN (COALESCE(quantity, 0) * COALESCE(price, 0))
        ELSE 0 
      END
    ), 0)
    INTO calculated_value
    FROM products p
    WHERE p.task_id = calculate_task_partial_sales_value.task_id;
  END IF;
  
  RETURN calculated_value;
EXCEPTION
  WHEN undefined_table THEN
    -- If products table doesn't exist, return 0
    RETURN 0;
END;
$$;

-- Step 3: Create trigger function to automatically update partial_sales_value
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

-- Step 4: Create trigger on tasks table
DROP TRIGGER IF EXISTS trigger_update_partial_sales_value ON tasks;
CREATE TRIGGER trigger_update_partial_sales_value
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_partial_sales_value_trigger();

-- Step 5: Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_task_partial_sales_value(UUID) TO authenticated;