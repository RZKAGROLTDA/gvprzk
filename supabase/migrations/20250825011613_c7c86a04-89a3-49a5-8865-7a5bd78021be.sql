-- Add equipment fields to tasks table
ALTER TABLE public.tasks 
ADD COLUMN family_product TEXT,
ADD COLUMN equipment_quantity INTEGER DEFAULT 0,
ADD COLUMN equipment_list JSONB DEFAULT '[]'::jsonb;

-- Add index for equipment queries
CREATE INDEX idx_tasks_family_product ON public.tasks(family_product);
CREATE INDEX idx_tasks_equipment_list ON public.tasks USING GIN(equipment_list);

-- Add comment for documentation
COMMENT ON COLUMN public.tasks.family_product IS 'Main product family for the task';
COMMENT ON COLUMN public.tasks.equipment_quantity IS 'Total quantity of equipment';
COMMENT ON COLUMN public.tasks.equipment_list IS 'Detailed list of equipment in JSON format';