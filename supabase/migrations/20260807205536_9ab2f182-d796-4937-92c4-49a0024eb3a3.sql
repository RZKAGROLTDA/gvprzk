CREATE TABLE public.user_app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  platform text,
  user_agent text,
  build_hash text NOT NULL,
  build_time timestamptz,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_app_versions_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX idx_uav_user ON public.user_app_versions(user_id);
CREATE INDEX idx_uav_build_hash ON public.user_app_versions(build_hash);
CREATE INDEX idx_uav_last_seen ON public.user_app_versions(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_app_versions TO authenticated;
GRANT ALL ON public.user_app_versions TO service_role;

ALTER TABLE public.user_app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own device version insert"
ON public.user_app_versions
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own device version update"
ON public.user_app_versions
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own device version select"
ON public.user_app_versions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "admins and managers view all versions"
ON public.user_app_versions
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_user_app_versions_updated_at
BEFORE UPDATE ON public.user_app_versions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();