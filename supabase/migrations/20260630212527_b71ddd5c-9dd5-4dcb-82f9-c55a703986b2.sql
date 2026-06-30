CREATE OR REPLACE FUNCTION public.search_clients(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE(client_code text, client_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT COALESCE(NULLIF(trim(p_query), ''), '') AS term
  ),
  norm AS (
    SELECT term, ltrim(term, '0') AS term_nz, lower(term) AS term_low
    FROM q
  ),
  base AS (
    SELECT DISTINCT ON (ltrim(trim(ce.client_code::text), '0'))
      ltrim(trim(ce.client_code::text), '0') AS code_nz,
      trim(ce.client_code::text) AS client_code,
      ce.client_name,
      ce.updated_at
    FROM public.client_equipment ce, norm n
    WHERE ce.client_code IS NOT NULL
      AND (
        n.term = ''
        OR ltrim(trim(ce.client_code::text), '0') LIKE n.term_nz || '%'
        OR trim(ce.client_code::text) LIKE '%' || n.term || '%'
        OR lower(coalesce(ce.client_name, '')) LIKE '%' || n.term_low || '%'
      )
    ORDER BY ltrim(trim(ce.client_code::text), '0'), ce.updated_at DESC NULLS LAST
  )
  SELECT client_code, client_name
  FROM base
  ORDER BY client_name NULLS LAST, client_code
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

REVOKE EXECUTE ON FUNCTION public.search_clients(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_clients(text, integer) TO authenticated;