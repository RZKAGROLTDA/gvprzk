CREATE OR REPLACE FUNCTION public.search_clients(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE(client_code text, client_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_q      text := btrim(COALESCE(p_query, ''));
  v_digits text;
  v_norm   text;
  v_limit  int  := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_ok     boolean := false;
  v_profile record;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_ok := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT approval_status, employment_status
      INTO v_profile
      FROM public.profiles
     WHERE user_id = auth.uid()
     LIMIT 1;
    IF v_profile.approval_status = 'approved' AND v_profile.employment_status = 'active' THEN
      v_ok := true;
    END IF;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_q = '' THEN
    RETURN;
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
           cm.client_code_norm AS norm,
           (v_norm IS NOT NULL AND cm.client_code_norm = v_norm) AS exact_code
    FROM public.clients_master cm
    WHERE cm.active
      AND (
        (v_norm IS NOT NULL AND (cm.client_code_norm = v_norm OR cm.client_code_norm LIKE v_norm || '%'))
        OR cm.client_code ILIKE '%' || v_q || '%'
        OR cm.client_name ILIKE '%' || v_q || '%'
        OR cm.client_name_norm ILIKE '%' || upper(v_q) || '%'
      )
    ORDER BY (v_norm IS NOT NULL AND cm.client_code_norm = v_norm) DESC, cm.client_name
    LIMIT v_limit
  ),
  legacy AS (
    SELECT x.client_code,
           x.client_name,
           x.source,
           COALESCE(NULLIF(regexp_replace(regexp_replace(x.client_code, '[^0-9]', '', 'g'), '^0+', ''), ''),
                    regexp_replace(x.client_code, '[^0-9]', '', 'g')) AS norm
    FROM (
      SELECT DISTINCT btrim(ce.client_code::text) AS client_code, ce.client_name, 'client_equipment'::text AS source
      FROM public.client_equipment ce
      WHERE ce.client_code IS NOT NULL
        AND ce.client_name IS NOT NULL
        AND (
          ce.client_code ILIKE '%' || v_q || '%'
          OR ce.client_name ILIKE '%' || v_q || '%'
          OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(ce.client_code, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
        )
      UNION
      SELECT DISTINCT btrim(m.client_code) AS client_code, m.client_name, 'campaign_clients_master'::text AS source
      FROM public.campaign_clients_master m
      WHERE m.client_code IS NOT NULL
        AND m.client_name IS NOT NULL
        AND (
          m.client_code ILIKE '%' || v_q || '%'
          OR m.client_name ILIKE '%' || v_q || '%'
          OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(m.client_code, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
        )
    ) x
  ),
  combined AS (
    SELECT m.client_code, m.client_name, m.source, m.norm, m.exact_code
    FROM master m
    UNION ALL
    SELECT l.client_code, l.client_name, l.source, l.norm, false AS exact_code
    FROM legacy l
    WHERE NOT EXISTS (SELECT 1 FROM master mm WHERE mm.norm = l.norm)
      AND NOT EXISTS (SELECT 1 FROM public.clients_master c WHERE c.active AND c.client_code_norm = l.norm)
  ),
  deduped AS (
    SELECT DISTINCT ON (c.norm) c.client_code, c.client_name, c.source, c.exact_code
    FROM combined c
    ORDER BY c.norm, (c.source = 'clients_master') DESC
  )
  SELECT d.client_code, d.client_name
  FROM deduped d
  ORDER BY d.exact_code DESC, d.client_name NULLS LAST, d.client_code
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_clients(text, integer) TO authenticated, service_role;