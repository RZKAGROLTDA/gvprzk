
-- Add checklist_machine snapshot column on tasks (jsonb)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS checklist_machine jsonb;

-- Add response_status + response_notes on products (used by workshop-checklist)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS response_status text,
  ADD COLUMN IF NOT EXISTS response_notes text;

-- Constrain response_status to allowed values (NULL allowed for legacy)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_response_status_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_response_status_check
      CHECK (response_status IS NULL OR response_status IN ('conforme','atencao','nao_conforme','na'));
  END IF;
END $$;
