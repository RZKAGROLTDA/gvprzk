-- Add prospect_notes_justification column to tasks table if it doesn't exist
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS prospect_notes_justification text;