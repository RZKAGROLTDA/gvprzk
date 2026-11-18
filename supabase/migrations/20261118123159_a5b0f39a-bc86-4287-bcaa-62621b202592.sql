INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, p.role::text::public.app_role
FROM public.profiles p
WHERE p.user_id IN (
 'f0c70aec-b269-4b1c-b0ef-deea7c840c85','f74bacf4-63ea-4fbd-a9db-017fe498dd55','78fb8c88-0d89-453e-9b6b-75daa5244c38',
 'c74ee428-ac4c-48d1-b357-9bfe28aa91e7','9eb3e3be-6505-41bb-987d-9465933c3521','472fcf2b-fc62-4566-9b4f-f1ea1b7483f4',
 'f3c8d804-4fbf-451e-8b9a-a07306f0af42','82ac6e6d-0d77-4116-9bce-c727d1872039','a851617a-0267-4a57-8c00-02251934237f',
 'fdebff2a-3df1-4e70-9a70-58bbcd686c49','d551e0e0-6853-4e92-bf5e-8fa1a1cd155a','97bf817f-96f0-4999-ad90-97c49246d0e7',
 '3fece1b8-8d46-4f18-a5aa-fe7af4a177bf','e9dc4d1f-3f9f-4c96-9be1-20b243b08118','32550267-7031-474d-947a-0f823a1b8f39',
 '720575ab-9160-4a41-a408-e39270e60e97','4b239119-7a6f-4382-8318-e218778d0fda','72747751-4e58-490f-bb26-04f33660c7f0',
 '6eae30a5-f77d-4cc8-aa7e-b2a20917639e','3c61fc01-9d52-4b55-8bb2-538f48d66d0c','e26702d8-a8da-4a12-ac3c-51b3b3ff30e0')
AND p.approval_status = 'approved'
AND coalesce(p.employment_status::text,'active') = 'active'
AND p.role::text IN ('supervisor','cpa','csa','rac','consultant','sales_consultant','technical_consultant')
AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id)
ON CONFLICT (user_id, role) DO NOTHING;