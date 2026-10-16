-- =============================================================================
-- Validação de Máquinas — filtro multi-filial (filial cadastrada da máquina)
-- Status: PREPARADO / SIMULADO. NÃO APLICADO.
--
-- Regras:
-- * Chamadas atuais (sem p_filial_ids e sem p_include_sem_filial) mantêm
--   exatamente o comportamento de hoje (effective_filial_ids(p_filial_id)).
-- * Modo multi-filial: cada filial da lista é validada no servidor contra as
--   filiais autorizadas (get_user_filial_ids_internal). Qualquer filial não
--   autorizada -> 42501. Admin/Gerente (globais) podem qualquer filial existente.
-- * "Sem filial" (filial_id IS NULL) só para visão global; demais -> 42501.
-- * Lista vazia e sem "Sem filial" -> nenhum resultado (nunca amplia).
-- * Não altera RLS, cargos, vínculos, dados nem "Salvar e validar".
-- =============================================================================

-- Helper interno de escopo (não exposto à API)
CREATE OR REPLACE FUNCTION public.equipment_park_scope(
  p_filial_id uuid,
  p_filial_ids uuid[],
  p_include_sem_filial boolean
) RETURNS TABLE(all_filiais boolean, ids uuid[], include_null boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_global boolean;
  v_ids uuid[];
  v_allowed uuid[];
  v_eff uuid[];
  v_null boolean := COALESCE(p_include_sem_filial, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Modo legado: comportamento atual, sem nenhuma mudança.
  IF p_filial_ids IS NULL AND NOT v_null THEN
    v_eff := public.effective_filial_ids(p_filial_id);
    RETURN QUERY SELECT cardinality(v_eff) = 0, v_eff, false;
    RETURN;
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_filial_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);

  IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.filiais f WHERE f.id = x)) THEN
    RAISE EXCEPTION 'Filial inexistente' USING ERRCODE = '42501';
  END IF;

  v_global := public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager');

  IF NOT v_global THEN
    v_allowed := public.get_user_filial_ids_internal(v_uid);
    IF COALESCE(array_length(v_allowed, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Acesso negado: usuário sem filial autorizada' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT (x = ANY (v_allowed))) THEN
      RAISE EXCEPTION 'Acesso negado: filial não autorizada' USING ERRCODE = '42501';
    END IF;
    IF v_null THEN
      RAISE EXCEPTION 'Acesso negado: "Sem filial" exige visão global' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY SELECT false, v_ids, v_null;
END $$;

REVOKE ALL ON FUNCTION public.equipment_park_scope(uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_park_scope(uuid, uuid[], boolean) TO service_role;

-- -----------------------------------------------------------------------------
-- Listagem paginada
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer);

CREATE FUNCTION public.get_equipment_park_paginated(
  p_search text DEFAULT NULL, p_filial_id uuid DEFAULT NULL, p_machine_status text DEFAULT NULL,
  p_puk_status text DEFAULT NULL, p_validation_priority boolean DEFAULT NULL, p_machine_type text DEFAULT NULL,
  p_validated_by uuid[] DEFAULT NULL, p_client_code text DEFAULT NULL, p_client_name text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(id uuid, client_code text, client_name text, filial_id uuid, filial_nome text, model text,
  serial_chassis text, hours numeric, year integer, observation text, machine_type text, product_raw text,
  puk_status text, machine_status text, last_validation_at timestamptz, validated_by uuid,
  validation_priority boolean, validation_source text, validation_priority_reason text,
  validation_priority_updated_at timestamptz, previous_client_code text, previous_client_name text,
  transferred_by uuid, transferred_at timestamptz, transfer_observation text, created_at timestamptz,
  updated_at timestamptz, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_machine_type text := NULLIF(BTRIM(COALESCE(p_machine_type, '')), '');
  v_client_code text := NULLIF(BTRIM(COALESCE(p_client_code, '')), '');
  v_client_name text := NULLIF(BTRIM(COALESCE(p_client_name, '')), '');
  v_validated_by uuid[] := CASE WHEN p_validated_by IS NULL OR array_length(p_validated_by, 1) IS NULL THEN NULL ELSE p_validated_by END;
  s record;
BEGIN
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao parque de maquinas';
  END IF;
  SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  RETURN QUERY
  WITH filtered AS (
    SELECT ce.* FROM public.client_equipment ce
    WHERE (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
      AND (p_machine_status IS NULL OR ce.machine_status = p_machine_status)
      AND (p_puk_status IS NULL OR ce.puk_status = p_puk_status)
      AND (p_validation_priority IS NULL OR ce.validation_priority = p_validation_priority)
      AND (v_machine_type IS NULL OR ce.machine_type = v_machine_type)
      AND (v_validated_by IS NULL OR ce.validated_by = ANY (v_validated_by))
      AND (v_client_code IS NULL OR ce.client_code = v_client_code)
      AND (v_client_name IS NULL OR ce.client_name ILIKE '%' || v_client_name || '%')
      AND (v_search IS NULL
        OR ce.client_name ILIKE '%' || v_search || '%'
        OR ce.client_code ILIKE '%' || v_search || '%'
        OR ce.model ILIKE '%' || v_search || '%'
        OR ce.serial_chassis ILIKE '%' || v_search || '%')
  ), counted AS (SELECT COUNT(*)::bigint AS total FROM filtered)
  SELECT f.id, f.client_code, f.client_name, f.filial_id, fi.nome, f.model, f.serial_chassis,
    f.hours, f.year, f.observation, f.machine_type, f.product_raw, f.puk_status,
    f.machine_status, f.last_validation_at, f.validated_by, f.validation_priority,
    f.validation_source, f.validation_priority_reason, f.validation_priority_updated_at,
    f.previous_client_code, f.previous_client_name, f.transferred_by, f.transferred_at,
    f.transfer_observation, f.created_at, f.updated_at, c.total
  FROM filtered f CROSS JOIN counted c
  LEFT JOIN public.filiais fi ON fi.id = f.filial_id
  ORDER BY f.validation_priority DESC, f.updated_at DESC
  LIMIT v_limit OFFSET v_offset;
END $$;

-- -----------------------------------------------------------------------------
-- Indicadores
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_equipment_park_kpis(text, uuid, text, text, boolean);

CREATE FUNCTION public.get_equipment_park_kpis(
  p_search text DEFAULT NULL, p_filial_id uuid DEFAULT NULL, p_machine_status text DEFAULT NULL,
  p_puk_status text DEFAULT NULL, p_validation_priority boolean DEFAULT NULL,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(total bigint, total_validadas bigint, prioridades bigint, nao_prioridades bigint,
  clientes bigint, pendentes bigint, validacoes_7d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  s record;
BEGIN
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao parque de maquinas';
  END IF;
  SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  RETURN QUERY
  WITH filtered AS (
    SELECT ce.client_code, ce.validation_priority, ce.last_validation_at
    FROM public.client_equipment ce
    WHERE (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
      AND (p_machine_status IS NULL OR ce.machine_status = p_machine_status)
      AND (p_puk_status IS NULL OR ce.puk_status = p_puk_status)
      AND (p_validation_priority IS NULL OR ce.validation_priority = p_validation_priority)
      AND (v_search IS NULL
        OR ce.client_name ILIKE '%' || v_search || '%'
        OR ce.client_code ILIKE '%' || v_search || '%'
        OR ce.model ILIKE '%' || v_search || '%'
        OR ce.serial_chassis ILIKE '%' || v_search || '%')
  )
  SELECT COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE last_validation_at IS NOT NULL)::bigint,
    COUNT(*) FILTER (WHERE validation_priority)::bigint,
    COUNT(*) FILTER (WHERE NOT validation_priority)::bigint,
    COUNT(DISTINCT client_code)::bigint,
    COUNT(*) FILTER (WHERE last_validation_at IS NULL)::bigint,
    COUNT(*) FILTER (WHERE last_validation_at >= now() - interval '7 days')::bigint
  FROM filtered;
END $$;

-- -----------------------------------------------------------------------------
-- Validadores
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_equipment_validators(uuid);

CREATE FUNCTION public.get_equipment_validators(
  p_filial_id uuid DEFAULT NULL, p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(user_id uuid, name text, filial_id uuid, filial_nome text, validated_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT * FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial)
  ), base AS (
    SELECT public.resolve_primary_user_id(ce.validated_by) AS uid,
           ce.id AS eq_id, ce.filial_id AS eq_filial_id
    FROM public.client_equipment ce
    CROSS JOIN s
    WHERE ce.validated_by IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND public.can_view_equipment_park()
      AND (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
  ), agg AS (
    SELECT b.uid, count(b.eq_id) AS validated_count,
           mode() WITHIN GROUP (ORDER BY b.eq_filial_id) AS eq_filial_id
    FROM base b GROUP BY b.uid
  )
  SELECT a.uid,
    COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(h.name), ''), 'Usuário inativo/removido'),
    COALESCE(p.filial_id, h.filial_id, a.eq_filial_id),
    COALESCE(f.nome, '—'),
    a.validated_count
  FROM agg a
  LEFT JOIN public.profiles p         ON p.user_id = a.uid
  LEFT JOIN public.historical_users h ON h.user_id = a.uid
  LEFT JOIN public.filiais f          ON f.id = COALESCE(p.filial_id, h.filial_id, a.eq_filial_id)
  ORDER BY a.validated_count DESC;
$$;

-- -----------------------------------------------------------------------------
-- Execução das Validações (resumo)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_equipment_validation_summary(uuid);

CREATE FUNCTION public.get_equipment_validation_summary(
  p_filial_id uuid DEFAULT NULL, p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(total_validated bigint, priority_validated bigint, non_priority_validated bigint,
  distinct_validated_clients bigint, by_filial jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT * FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial)
  ), resolved AS (
    SELECT ce.validation_priority,
      CASE
        WHEN nullif(trim(ce.client_code), '') IS NOT NULL THEN 'c:' || lower(trim(ce.client_code))
        WHEN nullif(trim(ce.client_name), '') IS NOT NULL THEN 'n:' || lower(trim(ce.client_name))
        ELSE NULL
      END AS client_key,
      COALESCE(fp.nome, fh.nome, fe.nome, '—') AS filial_nome
    FROM public.client_equipment ce
    CROSS JOIN s
    LEFT JOIN public.profiles p          ON p.user_id = ce.validated_by
    LEFT JOIN public.historical_users h  ON h.user_id = ce.validated_by
    LEFT JOIN public.filiais fp ON fp.id = p.filial_id
    LEFT JOIN public.filiais fh ON fh.id = h.filial_id
    LEFT JOIN public.filiais fe ON fe.id = ce.filial_id
    WHERE ce.last_validation_at IS NOT NULL
      AND public.can_view_equipment_park()
      AND (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
  ), agg AS (
    SELECT GROUPING(filial_nome) AS is_total, filial_nome,
      count(*)::bigint AS validated_count,
      count(*) FILTER (WHERE validation_priority IS TRUE)::bigint AS priority_count,
      count(*) FILTER (WHERE validation_priority IS DISTINCT FROM TRUE)::bigint AS non_priority_count,
      (count(DISTINCT client_key) FILTER (WHERE client_key IS NOT NULL))::bigint AS client_count
    FROM resolved GROUP BY ROLLUP(filial_nome)
  )
  SELECT
    COALESCE((SELECT a.validated_count    FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((SELECT a.priority_count     FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((SELECT a.non_priority_count FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((SELECT a.client_count       FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'filial_nome', a.filial_nome, 'validated_count', a.validated_count,
               'priority_count', a.priority_count, 'non_priority_count', a.non_priority_count,
               'client_count', a.client_count) ORDER BY a.validated_count DESC)
      FROM agg a WHERE a.is_total = 0), '[]'::jsonb);
$$;

-- Permissões de execução (iguais para as quatro consultas)
REVOKE ALL ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_equipment_validators(uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_equipment_validation_summary(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_equipment_validators(uuid, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_equipment_validation_summary(uuid, uuid[], boolean) TO authenticated, service_role;
