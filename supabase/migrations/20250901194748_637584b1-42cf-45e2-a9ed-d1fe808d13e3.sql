-- Remove approval system - make users auto-approved
-- Change default approval_status to 'approved'
ALTER TABLE public.profiles 
ALTER COLUMN approval_status SET DEFAULT 'approved';

-- Update all existing pending users to approved
UPDATE public.profiles 
SET approval_status = 'approved', updated_at = now()
WHERE approval_status = 'pending';

-- Remove the emergency function as it's no longer needed
DROP FUNCTION IF EXISTS public.emergency_promote_to_manager();