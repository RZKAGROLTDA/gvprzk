CREATE OR REPLACE FUNCTION public.search_clients_for_campaigns(p_query text)
 RETURNS TABLE(client_code text, client_name text, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
  v_digits text;
  v_norm text;
  v_is_authorized boolean := false;
  v_profile record;
BEGIN
  -- Validação de segurança
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT approval_status, employment_status
      INTO v_profile
      FROM public.profiles
     WHERE user_id = auth.uid()
     LIMIT 1;

    IF v_profile.approval_status = 'approved' AND v_profile.employment_status = 'active' THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Acesso não autorizado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
  IF v_digits <> '' THEN
    v_norm := regexp_replace(v_digits, '^0+', '');
    IF v_norm = '' THEN v_norm := '0'; END IF;
  END IF;

  RETURN QUERY
  WITH master AS (
    SELECT cm.client_code,
           cm.client_name,
           'clients_master'::text AS source,
           cm.client_code_norm AS norm
    FROM public.clients_master cm
    WHERE cm.active
      AND (
        v_q = ''
        OR (v_norm IS NOT NULL AND (cm.client_code_norm = v_norm OR cm.client_code_norm LIKE v_norm || '%'))
        OR cm.client_code ILIKE '%' || v_q || '%'
        OR cm.client_name ILIKE '%' || v_q || '%'
        OR cm.client_name_norm ILIKE '%' || upper(v_q) || '%'
      )
    ORDER BY (v_norm IS NOT NULL AND cm.client_code_norm = v_norm) DESC, cm.client_name
    LIMIT 50
  ),
  legacy AS (
    SELECT x.client_code, x.client_name, x.source,
           COALESCE(NULLIF(regexp_replace(regexp_replace(x.client_code, '[^0-9]', '', 'g'), '^0+', ''), ''), regexp_replace(x.client_code, '[^0-9]', '', 'g')) AS norm
    FROM (
      SELECT m.client_code, m.client_name, m.source
      FROM public.campaign_clients_master m
      WHERE v_q = ''
         OR m.client_name ILIKE '%' || v_q || '%'
         OR m.client_code ILIKE '%' || v_q || '%'
         OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(m.client_code, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
      UNION
      SELECT DISTINCT t.clientcode AS client_code, t.client AS client_name, 'tasks'::text AS source
      FROM public.tasks t
      WHERE t.clientcode IS NOT NULL
        AND t.client IS NOT NULL
        AND (
          v_q = ''
          OR t.client ILIKE '%' || v_q || '%'
          OR t.clientcode ILIKE '%' || v_q || '%'
          OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(t.clientcode, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
        )
    ) x
  ),
  combined AS (
    SELECT * FROM master
    UNION ALL
    SELECT l.client_code, l.client_name, l.source, l.norm
    FROM legacy l
    WHERE NOT EXISTS (SELECT 1 FROM master mm WHERE mm.norm = l.norm)
      AND NOT EXISTS (SELECT 1 FROM public.clients_master c WHERE c.client_code_norm = l.norm)
  )
  SELECT DISTINCT ON (c.norm) c.client_code, c.client_name, c.source
  FROM combined c
  ORDER BY c.norm, (c.source = 'clients_master') DESC
  LIMIT 50;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_clients_for_campaigns(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_clients_for_campaigns(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_clients_for_campaigns(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_clients_for_campaigns(text) TO service_role;