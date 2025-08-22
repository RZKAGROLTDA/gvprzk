-- Clean up existing duplicate tasks, keeping only the most recent one per group
WITH task_groups AS (
  SELECT 
    client,
    property,
    responsible,
    COALESCE(start_date::date, created_at::date) as task_date,
    COUNT(*) as task_count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created,
    array_agg(id ORDER BY created_at DESC) as task_ids
  FROM tasks
  WHERE created_at > NOW() - INTERVAL '30 days'  -- Only recent tasks
  GROUP BY client, property, responsible, COALESCE(start_date::date, created_at::date)
  HAVING COUNT(*) > 1
),
duplicates_to_delete AS (
  SELECT unnest(task_ids[2:]) as id_to_delete  -- Keep first (most recent), delete rest
  FROM task_groups
)
DELETE FROM tasks 
WHERE id IN (SELECT id_to_delete FROM duplicates_to_delete);

-- Add a unique constraint to prevent future duplicates
ALTER TABLE tasks 
ADD CONSTRAINT unique_task_per_day 
UNIQUE (client, property, responsible, start_date);

-- Create function to log task creation attempts
CREATE OR REPLACE FUNCTION log_task_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into a log table (we'll create this too)
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

-- Create log table for monitoring
CREATE TABLE IF NOT EXISTS task_creation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL,
  client TEXT,
  property TEXT,
  responsible TEXT,
  start_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on the log table
ALTER TABLE task_creation_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for the log table
CREATE POLICY "Users can view their own task creation logs" 
ON task_creation_log 
FOR SELECT 
USING (auth.uid()::text = created_by OR auth.jwt() ->> 'role' = 'manager');

-- Create trigger for logging
CREATE TRIGGER trigger_log_task_creation
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_creation();