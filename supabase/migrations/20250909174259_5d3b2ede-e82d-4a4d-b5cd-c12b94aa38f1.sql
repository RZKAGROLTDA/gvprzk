-- Corrigir inconsistência entre role no auth.users.raw_user_meta_data e profiles.role
-- O usuário 9772f518-1f3e-49db-8536-2648d1ca1959 tem role 'supervisor' no profiles mas 'consultant' no auth metadata

UPDATE auth.users 
SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"supervisor"')
WHERE id = '9772f518-1f3e-49db-8536-2648d1ca1959' 
AND raw_user_meta_data->>'role' != 'supervisor';

-- Verificar se há outras inconsistências e corrigi-las
UPDATE auth.users 
SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', to_jsonb(p.role))
FROM profiles p
WHERE auth.users.id = p.user_id 
AND raw_user_meta_data->>'role' != p.role;