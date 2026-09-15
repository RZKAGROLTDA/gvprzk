ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pm_registration text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_pm_registration_unique_key
  ON public.profiles (pm_registration)
  WHERE pm_registration IS NOT NULL;