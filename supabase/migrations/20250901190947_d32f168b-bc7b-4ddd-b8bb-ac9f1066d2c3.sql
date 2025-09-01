-- Approve Robson Ferro as administrator
UPDATE public.profiles 
SET approval_status = 'approved', updated_at = now()
WHERE email = 'robson.ferro@rzkagro.com.br' 
AND role = 'manager';

-- Add to admin_users table for additional admin privileges
INSERT INTO public.admin_users (email, user_id, created_by, is_active)
SELECT 
  'robson.ferro@rzkagro.com.br',
  user_id,
  user_id, -- self-created for bootstrap
  true
FROM public.profiles 
WHERE email = 'robson.ferro@rzkagro.com.br' 
AND role = 'manager'
ON CONFLICT (email) DO NOTHING;