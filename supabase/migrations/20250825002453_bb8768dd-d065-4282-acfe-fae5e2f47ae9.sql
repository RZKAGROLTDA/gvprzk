-- Remove the constraint that prevents multiple tasks per day
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS unique_task_per_day;

-- Add a more flexible unique constraint that allows same client/property/date 
-- but prevents exact duplicates (including time)
ALTER TABLE public.tasks ADD CONSTRAINT unique_task_detailed 
UNIQUE (client, property, responsible, start_date, start_time);