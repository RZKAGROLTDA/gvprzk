-- Add sales_type field to tasks table to store the actual sale type chosen by user
ALTER TABLE public.tasks 
ADD COLUMN sales_type TEXT CHECK (sales_type IN ('prospect', 'parcial', 'ganho', 'perdido'));

-- Update existing tasks to have correct sales_type based on current logic
UPDATE public.tasks 
SET sales_type = CASE 
  WHEN sales_confirmed = true THEN 'ganho'
  WHEN sales_confirmed = false THEN 'perdido'
  WHEN is_prospect = true AND sales_confirmed IS NULL THEN 'prospect'
  ELSE 'prospect'
END;

-- Create index for performance
CREATE INDEX idx_tasks_sales_type ON public.tasks(sales_type);