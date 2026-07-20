
-- 1. Permitir NULL nas colunas de autoria
ALTER TABLE public.tasks   ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN created_by DROP NOT NULL;

-- 2. Trocar CASCADE por SET NULL nas FKs para auth.users
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS fk_clients_created_by;
ALTER TABLE public.clients
  ADD CONSTRAINT fk_clients_created_by
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Enum de situação do vínculo e colunas em profiles
DO $$ BEGIN
  CREATE TYPE public.employment_status AS ENUM ('active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_status public.employment_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_employment_status
  ON public.profiles(employment_status)
  WHERE employment_status = 'inactive';

-- 4. has_role passa a exigir vínculo ativo
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles  p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  )
$$;
