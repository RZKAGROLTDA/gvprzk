-- 1) ENUMS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'goal_period_type'
  ) THEN
    CREATE TYPE public.goal_period_type AS ENUM ('daily', 'weekly');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'goal_activity_type'
  ) THEN
    CREATE TYPE public.goal_activity_type AS ENUM ('visita', 'ligacao');
  END IF;
END $$;

-- 2) TABELA
CREATE TABLE IF NOT EXISTS public.activity_goal_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          public.app_role NOT NULL,
  activity_type public.goal_activity_type NOT NULL,
  target_value  integer NOT NULL DEFAULT 0,
  period_type   public.goal_period_type NOT NULL,
  weekdays_only boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  notes         text,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_goal_settings_role_activity_uniq UNIQUE (role, activity_type)
);

-- 3) GRANTS (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_goal_settings TO authenticated;
GRANT ALL ON public.activity_goal_settings TO service_role;

-- 4) REVOKE explícito de anon/PUBLIC
REVOKE ALL ON public.activity_goal_settings FROM anon;
REVOKE ALL ON public.activity_goal_settings FROM PUBLIC;

-- 5) RLS
ALTER TABLE public.activity_goal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_goal_settings_select ON public.activity_goal_settings;
CREATE POLICY activity_goal_settings_select
ON public.activity_goal_settings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  )
);

DROP POLICY IF EXISTS activity_goal_settings_insert ON public.activity_goal_settings;
CREATE POLICY activity_goal_settings_insert
ON public.activity_goal_settings
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS activity_goal_settings_update ON public.activity_goal_settings;
CREATE POLICY activity_goal_settings_update
ON public.activity_goal_settings
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS activity_goal_settings_delete ON public.activity_goal_settings;
CREATE POLICY activity_goal_settings_delete
ON public.activity_goal_settings
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6) FUNÇÃO DE VALIDAÇÃO
CREATE OR REPLACE FUNCTION public.validate_activity_goal_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.target_value < 0 THEN
    RAISE EXCEPTION 'target_value não pode ser negativo (recebido: %)', NEW.target_value;
  END IF;

  IF NEW.target_value > 100 THEN
    RAISE EXCEPTION 'target_value acima do limite razoável (recebido: %)', NEW.target_value;
  END IF;

  IF NEW.period_type = 'weekly' AND NEW.weekdays_only THEN
    RAISE EXCEPTION 'weekdays_only só é aplicável quando period_type = daily';
  END IF;

  NEW.updated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- 7) TRIGGERS
DROP TRIGGER IF EXISTS trg_activity_goal_settings_updated_at ON public.activity_goal_settings;
CREATE TRIGGER trg_activity_goal_settings_updated_at
BEFORE UPDATE ON public.activity_goal_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_activity_goal_settings_validate ON public.activity_goal_settings;
CREATE TRIGGER trg_activity_goal_settings_validate
BEFORE INSERT OR UPDATE ON public.activity_goal_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_activity_goal_settings();

-- 8) ÍNDICE
CREATE INDEX IF NOT EXISTS idx_activity_goal_settings_active
  ON public.activity_goal_settings (role, activity_type)
  WHERE active;

-- 9) REGISTROS INICIAIS
INSERT INTO public.activity_goal_settings
  (role, activity_type, target_value, period_type, weekdays_only, active, notes)
VALUES
  ('sales_consultant',      'visita',  3, 'weekly', false, true, 'Meta inicial'),
  ('sales_consultant',      'ligacao', 3, 'daily',  false, true, 'Meta inicial'),
  ('consultant',            'visita',  3, 'weekly', false, true, 'Meta inicial'),
  ('consultant',            'ligacao', 3, 'daily',  false, true, 'Meta inicial'),
  ('technical_consultant',  'visita',  3, 'weekly', false, true, 'Meta inicial'),
  ('technical_consultant',  'ligacao', 3, 'daily',  false, true, 'Meta inicial'),
  ('rac',                   'visita',  3, 'daily',  true,  true, 'Meta inicial — seg a sex'),
  ('cpa',                   'visita',  3, 'daily',  true,  true, 'Meta inicial — seg a sex'),
  ('csa',                   'visita',  3, 'daily',  true,  true, 'Meta inicial — seg a sex')
ON CONFLICT (role, activity_type) DO NOTHING;