-- Remove existing conflicting constraints
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS valid_roles;

-- Create unified constraint with all necessary roles
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_role_unified_check 
CHECK (role IN ('manager', 'supervisor', 'sales_consultant', 'rac', 'technical_consultant', 'consultant'));