
CREATE OR REPLACE FUNCTION public.get_secure_task_media(p_task_id uuid)
RETURNS TABLE(photos text[], documents text[], technical_visit_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_filial_nome text;
  v_is_approved boolean;
  v_is_active boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.role, f.nome,
         (p.approval_status = 'approved'),
         (COALESCE(p.employment_status, 'active') = 'active')
  INTO v_user_role, v_user_filial_nome, v_is_approved, v_is_active
  FROM profiles p
  LEFT JOIN filiais f ON p.filial_id = f.id
  WHERE p.user_id = v_user_id;

  IF NOT COALESCE(v_is_approved, false) THEN
    RETURN;
  END IF;
  IF NOT COALESCE(v_is_active, false) THEN
    RETURN;
  END IF;

  IF v_user_role IN ('admin', 'manager') THEN
    RETURN QUERY
    SELECT t.photos, t.documents, t.technical_visit_data
    FROM tasks t
    WHERE t.id = p_task_id
    LIMIT 1;
    RETURN;
  END IF;

  IF v_user_role = 'supervisor' THEN
    RETURN QUERY
    SELECT t.photos, t.documents, t.technical_visit_data
    FROM tasks t
    WHERE t.id = p_task_id AND t.filial = v_user_filial_nome
    LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.photos, t.documents, t.technical_visit_data
  FROM tasks t
  WHERE t.id = p_task_id AND t.created_by = v_user_id
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_secure_task_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_secure_task_media(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_secure_task_media(uuid) TO service_role;
