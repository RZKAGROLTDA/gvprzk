-- a) constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_unified_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_unified_check
  CHECK (role = ANY (ARRAY['manager','supervisor','sales_consultant','rac',
                           'technical_consultant','consultant','cpa','csa']));

-- b) can_modify_user_role
CREATE OR REPLACE FUNCTION public.can_modify_user_role(target_user_id uuid, new_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
BEGIN
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF current_user_role != 'manager' THEN
    RETURN false;
  END IF;

  IF target_user_id = auth.uid() THEN
    RETURN false;
  END IF;

  IF new_role NOT IN ('manager', 'rac', 'consultant', 'supervisor', 'sales_consultant', 'technical_consultant', 'cpa', 'csa') THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

-- c) update_user_role_secure
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  calling_user_role TEXT;
BEGIN
  SELECT role INTO calling_user_role
  FROM public.profiles
  WHERE user_id = auth.uid() AND approval_status = 'approved'
  LIMIT 1;

  IF calling_user_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can update user roles';
  END IF;

  IF new_role NOT IN ('manager', 'supervisor', 'rac', 'consultant', 'sales_consultant', 'technical_consultant', 'admin', 'cpa', 'csa') THEN
    RAISE EXCEPTION 'Invalid role specified';
  END IF;

  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE user_id = target_user_id;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id;

  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (target_user_id, new_role::app_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.secure_log_security_event(
    'user_role_updated',
    auth.uid(),
    jsonb_build_object(
      'target_user_id', target_user_id,
      'new_role', new_role,
      'updated_by', auth.uid()
    ),
    3
  );
END;
$function$;

-- d) get_user_role (reconhecimento explícito, sem fallback)
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN 'admin'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager') THEN 'manager'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'supervisor') THEN 'supervisor'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'rac') THEN 'rac'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'cpa') THEN 'cpa'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'csa') THEN 'csa'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'consultant') THEN 'consultant'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'sales_consultant') THEN 'sales_consultant'
          WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'technical_consultant') THEN 'technical_consultant'
          ELSE 'none'
        END
    ),
    'none'
  );
$function$;

-- e) get_user_security_level (ramo RAC inclui cpa/csa)
CREATE OR REPLACE FUNCTION public.get_user_security_level()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN has_role(auth.uid(), 'admin'::app_role) THEN 'admin'

    WHEN EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'manager'
      AND p.approval_status = 'approved'
    ) THEN 'manager'

    WHEN has_role(auth.uid(), 'supervisor'::app_role)
         AND EXISTS (
           SELECT 1 FROM profiles p
           WHERE p.user_id = auth.uid()
           AND p.approval_status = 'approved'
         ) THEN 'supervisor'

    WHEN EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('rac','cpa','csa')
      AND p.approval_status = 'approved'
    ) THEN 'rac'

    WHEN EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
    ) THEN 'user'

    ELSE 'none'
  END;
$function$;

-- f) can_access_task_related_data (escopo de filial idêntico ao RAC)
CREATE OR REPLACE FUNCTION public.can_access_task_related_data(p_task_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_by uuid;
  v_task_filial text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT t.created_by, t.filial
    INTO v_created_by, v_task_filial
  FROM public.tasks t
  WHERE t.id = p_task_id;

  IF v_created_by IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() = v_created_by THEN
    RETURN true;
  END IF;

  v_role := public.get_user_role();

  IF v_role IN ('manager','admin') THEN
    RETURN true;
  END IF;

  IF v_role IN ('supervisor','rac','cpa','csa') THEN
    IF EXISTS (
      SELECT 1
      FROM public.profiles p1
      JOIN public.profiles p2 ON p2.user_id = v_created_by
      WHERE p1.user_id = auth.uid()
        AND p1.filial_id IS NOT NULL
        AND p1.filial_id = p2.filial_id
    ) THEN
      RETURN true;
    END IF;

    IF v_task_filial IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.profiles p1
      JOIN public.filiais f ON f.id = p1.filial_id
      WHERE p1.user_id = auth.uid()
        AND p1.approval_status = 'approved'
        AND f.nome = v_task_filial
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$;

-- g) can_insert_vacation
CREATE OR REPLACE FUNCTION public.can_insert_vacation(p_filial_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND (public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND p.filial_id = p_filial_id
      AND (public.has_role(auth.uid(), 'supervisor'::app_role)
        OR public.has_role(auth.uid(), 'rac'::app_role)
        OR public.has_role(auth.uid(), 'cpa'::app_role)
        OR public.has_role(auth.uid(), 'csa'::app_role))
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- h) grupo comercial individual: reescrita determinística
DO $do$
DECLARE r record; v_def text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
             AND (p.prosrc LIKE '%''rac'', ''consultant'', ''sales_consultant'', ''technical_consultant''%'
               OR p.prosrc LIKE '%''consultant'', ''rac'', ''sales_consultant'', ''technical_consultant''%')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, '''rac'', ''consultant'', ''sales_consultant'', ''technical_consultant''',
                            '''rac'', ''consultant'', ''sales_consultant'', ''technical_consultant'', ''cpa'', ''csa''');
    v_def := replace(v_def, '''consultant'', ''rac'', ''sales_consultant'', ''technical_consultant''',
                            '''consultant'', ''rac'', ''sales_consultant'', ''technical_consultant'', ''cpa'', ''csa''');
    EXECUTE v_def;
  END LOOP;
END $do$;

-- i) ranking de exibição
DO $do$
DECLARE r record; v_def text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f'
             AND p.proname IN ('get_management_seller_summary','get_management_client_details')
             AND p.prosrc LIKE '%WHEN ''rac'' THEN 4%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'WHEN ''rac'' THEN 4',
                            'WHEN ''rac'' THEN 4 WHEN ''cpa'' THEN 4 WHEN ''csa'' THEN 4');
    EXECUTE v_def;
  END LOOP;
END $do$;