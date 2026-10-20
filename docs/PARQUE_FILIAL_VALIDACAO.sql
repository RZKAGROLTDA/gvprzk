-- =============================================================================
-- Filial da Validação — Parque de Máquinas e Regularização
-- Status: PREPARADO. NÃO APLICADO. Aguardando autorização.
--
-- Regras implementadas:
--  1. Novo registro: client_equipment.validation_filial_id (filial responsável
--     pela última validação) + validation_filial_source (origem do vínculo,
--     para auditoria). A filial cadastral (filial_id) NÃO é alterada.
--  2. Novas validações (validate_client_equipment): gravam obrigatoriamente a
--     filial autorizada usada na operação (Filial Ativa validada no servidor;
--     visão global sem Filial Ativa usa a própria filial da máquina). Mudança
--     de situação para vendida/inativa/sucateada também registra a filial
--     responsável. Nenhuma atribuição arbitrária: sem filial determinável,
--     o vínculo anterior é mantido.
--  3. Backfill SOMENTE com evidência confiável (updated_at preservado):
--     a) backfill_perfil   — validador com exatamente 1 filial autorizada
--        (principal + adicionais ativas): 5.844 máquinas (medido em 20/10).
--     b) backfill_tarefa   — validador multi-filial com exatamente 1 tarefa
--        vinculada cuja filial está entre as autorizadas: 211 máquinas.
--     c) backfill_historico — validador sem perfil ativo, presente em
--        historical_users com filial: 74 máquinas.
--     Restam 289 máquinas validadas sem vínculo confiável -> revisão manual.
--  4. Filtros multifiliais dos dois módulos passam a usar a filial efetiva:
--     COALESCE(validation_filial_id, filial_id). Máquinas nunca validadas
--     continuam aparecendo pela filial cadastral; "Sem filial" = sem vínculo
--     de validação E sem filial cadastral. Mesmo critério em indicadores,
--     listagem, validadores, resumo, exportação (via listagem) e pendentes.
--  5. Correção de equipment_regularization_pending_machines: texto exato do
--     arquivo aprovado REGULARIZACAO_MULTI_FILIAL.sql (o valor filial_id que
--     faltava no jsonb_build_object), com o critério da filial efetiva.
--  6. Criação de lote: elegibilidade pela filial efetiva; o item do lote grava
--     a filial efetiva no momento (snapshot). Lotes e itens existentes não
--     são alterados; a lista de lotes continua lendo o snapshot do item.
--
-- Não muda: RLS, cargos, vínculos, user_filiais, profiles, filiais, CRM, POPS,
-- históricos, lotes existentes, "Salvar e validar" (mesma autorização) e o
-- agrupamento por filial do validador na "Execução das Validações".
-- =============================================================================

-- 1. Colunas novas (nulos permitidos; sem backfill automático fora das regras)
ALTER TABLE public.client_equipment
  ADD COLUMN IF NOT EXISTS validation_filial_id uuid REFERENCES public.filiais(id),
  ADD COLUMN IF NOT EXISTS validation_filial_source text;

-- 2. Validação/edição: registra a filial responsável
CREATE OR REPLACE FUNCTION public.validate_client_equipment(p_equipment_id uuid, p_filial_id uuid DEFAULT NULL::uuid, p_mark_validated boolean DEFAULT true, p_model text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_hours numeric DEFAULT NULL::numeric, p_serial_chassis text DEFAULT NULL::text, p_observation text DEFAULT NULL::text, p_machine_status text DEFAULT NULL::text, p_client_code text DEFAULT NULL::text, p_clear_year boolean DEFAULT false, p_clear_hours boolean DEFAULT false)
 RETURNS SETOF client_equipment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_eff uuid[];
  v_cur_filial uuid;
  v_cur_code text;
  v_new_filial uuid;
  v_registra boolean;
  v_filial_resp uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso negado: cadastro nao aprovado ou inativo' USING ERRCODE = '42501';
  END IF;

  v_eff := public.effective_filial_ids(p_filial_id);

  SELECT ce.filial_id, ce.client_code INTO v_cur_filial, v_cur_code
    FROM public.client_equipment ce WHERE ce.id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maquina nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_cur_filial IS NULL THEN
    IF p_mark_validated THEN
      IF cardinality(v_eff) <> 1 THEN
        RAISE EXCEPTION 'Selecione uma filial no cabecalho para validar esta maquina'
          USING ERRCODE = '42501';
      END IF;
      v_new_filial := v_eff[1];
    ELSE
      v_new_filial := NULL;
    END IF;
  ELSE
    IF cardinality(v_eff) > 0 AND NOT (v_cur_filial = ANY(v_eff)) THEN
      RAISE EXCEPTION 'Acesso negado: maquina de outra filial' USING ERRCODE = '42501';
    END IF;
    v_new_filial := v_cur_filial;
  END IF;

  -- Registra a filial responsável na validação ou na mudança de situação.
  v_registra := p_mark_validated
    OR (p_machine_status IS NOT NULL
        AND p_machine_status IN ('vendida','inativa','sucateada')
        AND p_machine_status IS DISTINCT FROM
            (SELECT ce2.machine_status FROM public.client_equipment ce2 WHERE ce2.id = p_equipment_id));
  v_filial_resp := CASE
    WHEN cardinality(v_eff) = 1 THEN v_eff[1]
    WHEN v_cur_filial IS NOT NULL THEN v_cur_filial
    ELSE NULL END;

  RETURN QUERY
  UPDATE public.client_equipment ce
     SET model = CASE WHEN p_model IS NULL THEN ce.model
                      ELSE NULLIF(btrim(p_model), '') END,
         serial_chassis = CASE WHEN p_serial_chassis IS NULL THEN ce.serial_chassis
                               ELSE NULLIF(btrim(p_serial_chassis), '') END,
         observation = CASE WHEN p_observation IS NULL THEN ce.observation
                            ELSE NULLIF(btrim(p_observation), '') END,
         year = CASE WHEN COALESCE(p_clear_year, false) THEN NULL
                     ELSE COALESCE(p_year, ce.year) END,
         hours = CASE WHEN COALESCE(p_clear_hours, false) THEN NULL
                      ELSE COALESCE(p_hours, ce.hours) END,
         machine_status = COALESCE(p_machine_status, ce.machine_status),
         client_code = CASE WHEN v_cur_code IS NULL OR btrim(v_cur_code) = ''
                            THEN COALESCE(p_client_code, ce.client_code) ELSE ce.client_code END,
         filial_id = v_new_filial,
         validated_by = CASE WHEN p_mark_validated THEN v_uid ELSE ce.validated_by END,
         last_validation_at = CASE WHEN p_mark_validated THEN now() ELSE ce.last_validation_at END,
         validation_filial_id = CASE WHEN v_registra AND v_filial_resp IS NOT NULL
                                     THEN v_filial_resp ELSE ce.validation_filial_id END,
         validation_filial_source = CASE WHEN v_registra AND v_filial_resp IS NOT NULL
                                         THEN CASE WHEN p_mark_validated THEN 'validacao' ELSE 'situacao' END
                                         ELSE ce.validation_filial_source END,
         updated_at = now()
   WHERE ce.id = p_equipment_id
  RETURNING ce.*;
END
$function$;

-- 3. Backfill com evidência confiável (triggers desabilitados para preservar
--    updated_at e não reordenar a listagem do Parque)
ALTER TABLE public.client_equipment DISABLE TRIGGER USER;

-- 3a. Validador com exatamente uma filial autorizada (perfil + adicionais)
WITH uf AS (
  SELECT p.user_id,
         array_remove(array_append(
           ARRAY(SELECT u2.filial_id FROM public.user_filiais u2
                  WHERE u2.user_id = p.user_id AND u2.active),
           p.filial_id), NULL) AS fils
  FROM public.profiles p
)
UPDATE public.client_equipment ce
   SET validation_filial_id = uf.fils[1],
       validation_filial_source = 'backfill_perfil'
  FROM uf
 WHERE ce.validated_by = uf.user_id
   AND ce.last_validation_at IS NOT NULL
   AND ce.validation_filial_id IS NULL
   AND cardinality(uf.fils) = 1;

-- 3b. Validador multi-filial com exatamente uma tarefa vinculada cuja filial
--     (por nome normalizado) está entre as filiais autorizadas
WITH uf AS (
  SELECT p.user_id,
         array_remove(array_append(
           ARRAY(SELECT u2.filial_id FROM public.user_filiais u2
                  WHERE u2.user_id = p.user_id AND u2.active),
           p.filial_id), NULL) AS fils
  FROM public.profiles p
), ev AS (
  SELECT ce.id, COUNT(DISTINCT f.id) AS n, MIN(f.id) AS fil
    FROM public.client_equipment ce
    JOIN uf ON uf.user_id = ce.validated_by AND cardinality(uf.fils) > 1
    JOIN public.task_equipment te ON te.equipment_id = ce.id
    JOIN public.tasks t ON t.id = te.task_id AND t.filial IS NOT NULL
    JOIN public.filiais f ON f.id = ANY (uf.fils)
         AND lower(trim(f.nome)) = lower(trim(t.filial))
   WHERE ce.last_validation_at IS NOT NULL
     AND ce.validation_filial_id IS NULL
   GROUP BY ce.id
)
UPDATE public.client_equipment ce
   SET validation_filial_id = ev.fil,
       validation_filial_source = 'backfill_tarefa'
  FROM ev
 WHERE ce.id = ev.id AND ev.n = 1;

-- 3c. Validador sem perfil ativo, presente no histórico com filial
UPDATE public.client_equipment ce
   SET validation_filial_id = hu.filial_id,
       validation_filial_source = 'backfill_historico'
  FROM public.historical_users hu
 WHERE hu.user_id = ce.validated_by
   AND hu.filial_id IS NOT NULL
   AND ce.last_validation_at IS NOT NULL
   AND ce.validation_filial_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = ce.validated_by);

ALTER TABLE public.client_equipment ENABLE TRIGGER USER;

-- 4. Parque — listagem paginada (mesma assinatura + 2 colunas informativas)
DROP FUNCTION IF EXISTS public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean);

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
  updated_at timestamptz, validation_filial_id uuid, validation_filial_nome text, total_count bigint)
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
    WHERE (s.all_filiais OR COALESCE(ce.validation_filial_id, ce.filial_id) = ANY (s.ids)
           OR (s.include_null AND ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
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
    f.transfer_observation, f.created_at, f.updated_at,
    f.validation_filial_id, fv.nome, c.total
  FROM filtered f CROSS JOIN counted c
  LEFT JOIN public.filiais fi ON fi.id = f.filial_id
  LEFT JOIN public.filiais fv ON fv.id = f.validation_filial_id
  ORDER BY f.validation_priority DESC, f.updated_at DESC
  LIMIT v_limit OFFSET v_offset;
END $$;

-- 4. Parque — indicadores
DROP FUNCTION IF EXISTS public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean);

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
    WHERE (s.all_filiais OR COALESCE(ce.validation_filial_id, ce.filial_id) = ANY (s.ids)
           OR (s.include_null AND ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
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

-- 4. Parque — validadores
DROP FUNCTION IF EXISTS public.get_equipment_validators(uuid, uuid[], boolean);

CREATE FUNCTION public.get_equipment_validators(
  p_filial_id uuid DEFAULT NULL, p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(user_id uuid, name text, filial_id uuid, filial_nome text, validated_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT * FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial)
  ), base AS (
    SELECT public.resolve_primary_user_id(ce.validated_by) AS uid,
           ce.id AS eq_id, COALESCE(ce.validation_filial_id, ce.filial_id) AS eq_filial_id
    FROM public.client_equipment ce
    CROSS JOIN s
    WHERE ce.validated_by IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND public.can_view_equipment_park()
      AND (s.all_filiais OR COALESCE(ce.validation_filial_id, ce.filial_id) = ANY (s.ids)
           OR (s.include_null AND ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
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

-- 4. Parque — Execução das Validações (seleção pela filial efetiva da máquina;
--    agrupamento por filial do validador preservado)
DROP FUNCTION IF EXISTS public.get_equipment_validation_summary(uuid, uuid[], boolean);

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
    LEFT JOIN public.filiais fe ON fe.id = COALESCE(ce.validation_filial_id, ce.filial_id)
    WHERE ce.last_validation_at IS NOT NULL
      AND public.can_view_equipment_park()
      AND (s.all_filiais OR COALESCE(ce.validation_filial_id, ce.filial_id) = ANY (s.ids)
           OR (s.include_null AND ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
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

-- 5. Regularização — contadores (filial efetiva)
DROP FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean);
CREATE FUNCTION public.equipment_regularization_pending_kpis(
  p_filial_id uuid DEFAULT NULL, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL,
  p_situation text DEFAULT NULL, p_chassis text DEFAULT NULL,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_situation text := public.equipment_regularization_situation_norm(p_situation); v_client text := NULLIF(TRIM(p_client), ''); v_chassis text := NULLIF(TRIM(p_chassis), ''); s record;
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  RETURN (
    WITH base AS (
      SELECT ce.id, COALESCE(ce.validation_filial_id, ce.filial_id) AS filial_id, ce.client_code, ce.client_name, ce.machine_status
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND (s.all_filiais OR COALESCE(ce.validation_filial_id, ce.filial_id) = ANY (s.ids)
             OR (s.include_null AND ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
        AND (NOT p_without_filial OR (ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
        AND (v_client IS NULL OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%' OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    ),
    pending AS (SELECT * FROM base WHERE NOT public.equipment_regularization_is_locked(id)),
    regularized AS (SELECT id FROM base WHERE public.equipment_regularization_is_regularized(id))
    SELECT jsonb_build_object(
      'total_pending', (SELECT COUNT(*) FROM pending),
      'total_clients', (SELECT COUNT(DISTINCT (COALESCE(NULLIF(TRIM(client_code), ''), UPPER(TRIM(client_name))) || '|' || COALESCE(filial_id::text, 'SEM_FILIAL'))) FROM pending),
      'total_regularized', (SELECT COUNT(*) FROM regularized),
      'by_situation', jsonb_build_object(
        'vendida', (SELECT COUNT(*) FROM pending WHERE machine_status = 'vendida'),
        'inativa', (SELECT COUNT(*) FROM pending WHERE machine_status = 'inativa'),
        'sucata',  (SELECT COUNT(*) FROM pending WHERE machine_status = 'sucateada')))
  );
END $$;

-- 5. Regularização — pendentes por cliente (filial efetiva)
DROP FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean);
CREATE FUNCTION public.equipment_regularization_pending_clients(
  p_filial_id uuid DEFAULT NULL, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL,
  p_situation text DEFAULT NULL, p_chassis text DEFAULT NULL, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_situation text := public.equipment_regularization_situation_norm(p_situation); v_client text := NULLIF(TRIM(p_client), ''); v_chassis text := NULLIF(TRIM(p_chassis), ''); s record;
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  RETURN (
    WITH pending AS (
      SELECT COALESCE(ce.validation_filial_id, ce.filial_id) AS filial_id, ce.client_code, ce.client_name, ce.machine_status, ce.last_validation_at
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (s.all_filiais OR COALESCE(ce.validation_filial_id, ce.filial_id) = ANY (s.ids)
             OR (s.include_null AND ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
        AND (NOT p_without_filial OR (ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
        AND (v_client IS NULL OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%' OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    ),
    grouped AS (
      SELECT COALESCE(NULLIF(TRIM(client_code), ''), UPPER(TRIM(client_name))) || '|' || COALESCE(filial_id::text, 'SEM_FILIAL') AS client_key,
        MAX(client_code) AS client_code, MAX(client_name) AS client_name, filial_id, MAX(last_validation_at) AS last_validation_at, COUNT(*) AS total_pending,
        COUNT(*) FILTER (WHERE machine_status = 'vendida') AS vendida, COUNT(*) FILTER (WHERE machine_status = 'inativa') AS inativa,
        COUNT(*) FILTER (WHERE machine_status = 'sucateada') AS sucata
      FROM pending GROUP BY 1, filial_id
    ),
    total AS (SELECT COUNT(*) AS total_groups FROM grouped)
    SELECT jsonb_build_object('total_groups', (SELECT total_groups FROM total), 'page', p_page, 'page_size', p_page_size,
      'clients', COALESCE((SELECT jsonb_agg(jsonb_build_object('client_key', g.client_key, 'client_code', g.client_code, 'client_name', g.client_name,
          'filial_id', g.filial_id, 'filial_nome', f.nome, 'total_pending', g.total_pending, 'last_validation_at', g.last_validation_at,
          'by_situation', jsonb_build_object('vendida', g.vendida, 'inativa', g.inativa, 'sucata', g.sucata)) ORDER BY g.total_pending DESC, g.client_name, g.client_key)
        FROM (SELECT * FROM grouped ORDER BY total_pending DESC, client_name, client_key LIMIT p_page_size OFFSET (p_page - 1) * p_page_size) g
        LEFT JOIN public.filiais f ON f.id = g.filial_id), '[]'::jsonb))
  );
END $$;

-- 5. Regularização — máquinas pendentes de um cliente
--    (texto do arquivo aprovado REGULARIZACAO_MULTI_FILIAL.sql, com o valor
--     filial_id presente no jsonb_build_object + critério da filial efetiva)
DROP FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean);
CREATE FUNCTION public.equipment_regularization_pending_machines(
  p_client_key text, p_filial_id uuid DEFAULT NULL, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL,
  p_situation text DEFAULT NULL, p_chassis text DEFAULT NULL,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_situation text := public.equipment_regularization_situation_norm(p_situation); v_client text := NULLIF(TRIM(p_client), ''); v_chassis text := NULLIF(TRIM(p_chassis), ''); s record;
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  RETURN (
    WITH pending AS (
      SELECT ce.id, ce.client_code, ce.client_name, COALESCE(ce.validation_filial_id, ce.filial_id) AS filial_id, ce.model, ce.serial_chassis, ce.year, ce.machine_status, ce.last_validation_at, ce.validation_source
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (COALESCE(NULLIF(TRIM(ce.client_code), ''), UPPER(TRIM(ce.client_name))) || '|' || COALESCE(COALESCE(ce.validation_filial_id, ce.filial_id)::text, 'SEM_FILIAL')) = p_client_key
        AND (s.all_filiais OR COALESCE(ce.validation_filial_id, ce.filial_id) = ANY (s.ids)
             OR (s.include_null AND ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
        AND (NOT p_without_filial OR (ce.validation_filial_id IS NULL AND ce.filial_id IS NULL))
        AND (v_client IS NULL OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%' OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('equipment_id', id, 'client_code', client_code, 'client_name', client_name, 'filial_id', filial_id,
      'model', model, 'serial_chassis', serial_chassis, 'year', year,
      'machine_situation', CASE WHEN machine_status = 'sucateada' THEN 'sucata' ELSE machine_status END,
      'last_validation_at', last_validation_at, 'validation_source', validation_source) ORDER BY client_name, serial_chassis, id), '[]'::jsonb)
    FROM pending
  );
END $$;

-- 5. Regularização — criação de lote (elegibilidade pela filial efetiva;
--    item do lote grava a filial efetiva como snapshot; modo legado mantido)
DROP FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean);
CREATE FUNCTION public.equipment_regularization_create_batch(
  p_equipment_ids uuid[], p_header_city text DEFAULT NULL, p_header_state text DEFAULT NULL, p_document_date date DEFAULT NULL,
  p_signer_name text DEFAULT NULL, p_signer_role text DEFAULT NULL, p_recipient_name text DEFAULT NULL, p_recipient_email text DEFAULT NULL,
  p_pmp_number text DEFAULT NULL, p_notes text DEFAULT NULL, p_filial_id uuid DEFAULT NULL,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_batch_id uuid; v_eq public.client_equipment; v_id uuid; v_situation text;
  v_count integer := 0; v_filiais uuid[]; v_first_filial uuid; v_first_set boolean := false;
  v_legacy boolean := p_filial_ids IS NULL AND NOT COALESCE(p_include_sem_filial, false);
  v_eff_filial uuid;
  s record;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque'; END IF;
  IF p_equipment_ids IS NULL OR array_length(p_equipment_ids, 1) IS NULL THEN RAISE EXCEPTION 'Nenhuma maquina informada para regularizacao'; END IF;
  IF v_legacy THEN
    v_filiais := public.effective_filial_ids(p_filial_id);
  ELSE
    SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  END IF;
  PERFORM 1 FROM public.client_equipment WHERE id = ANY(p_equipment_ids) ORDER BY id FOR UPDATE;
  FOREACH v_id IN ARRAY p_equipment_ids LOOP
    SELECT * INTO v_eq FROM public.client_equipment WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Maquina % nao encontrada', v_id; END IF;
    v_situation := CASE WHEN v_eq.machine_status = 'sucateada' THEN 'sucata' WHEN v_eq.machine_status IN ('vendida','inativa') THEN v_eq.machine_status ELSE NULL END;
    IF v_situation IS NULL THEN RAISE EXCEPTION 'Maquina % nao esta pendente de regularizacao (situacao: %)', v_id, v_eq.machine_status; END IF;
    v_eff_filial := COALESCE(v_eq.validation_filial_id, v_eq.filial_id);
    IF v_legacy THEN
      IF cardinality(v_filiais) > 0 THEN
        IF v_eff_filial IS NULL THEN RAISE EXCEPTION 'Maquina % sem filial cadastrada nao pode entrar em lote na filial ativa', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
        IF NOT (v_eff_filial = ANY(v_filiais)) THEN RAISE EXCEPTION 'Maquina % pertence a outra filial e nao pode entrar neste lote', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
      END IF;
      IF NOT v_first_set THEN v_first_filial := v_eff_filial; v_first_set := true;
      ELSIF v_eff_filial IS DISTINCT FROM v_first_filial THEN RAISE EXCEPTION 'Lote nao pode conter maquinas de filiais diferentes' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF v_eff_filial IS NULL AND NOT s.include_null THEN
        RAISE EXCEPTION 'Maquina % sem filial cadastrada: permitido apenas na visao global com "Sem filial" selecionado', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501';
      END IF;
      IF v_eff_filial IS NOT NULL AND NOT (v_eff_filial = ANY (s.ids)) THEN
        RAISE EXCEPTION 'Maquina % pertence a filial fora da selecao autorizada', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501';
      END IF;
    END IF;
    IF public.equipment_regularization_is_regularized(v_id) THEN RAISE EXCEPTION 'A maquina % ja foi regularizada em outro lote', COALESCE(v_eq.serial_chassis, v_id::text); END IF;
    IF public.equipment_regularization_is_locked(v_id) THEN RAISE EXCEPTION 'A maquina % ja esta em outro lote aberto', COALESCE(v_eq.serial_chassis, v_id::text); END IF;
  END LOOP;
  INSERT INTO public.equipment_regularization_batches (header_city, header_state, document_date, signer_name, signer_role, recipient_name, recipient_email, pmp_number, status, notes, created_by, history)
  VALUES (COALESCE(NULLIF(TRIM(p_header_city), ''), 'Regularizacao de Maquinas'), COALESCE(NULLIF(TRIM(p_header_state), ''), 'NA'), COALESCE(p_document_date, CURRENT_DATE),
     COALESCE(NULLIF(TRIM(p_signer_name), ''), 'Regularizacao de Maquinas'), COALESCE(NULLIF(TRIM(p_signer_role), ''), 'Gerente Corporativo de Serviços'),
     NULLIF(TRIM(p_recipient_name), ''), NULLIF(TRIM(p_recipient_email), ''), NULLIF(TRIM(p_pmp_number), ''),
     'aguardando_envio', NULLIF(TRIM(p_notes), ''), v_uid,
     public.equipment_regularization_history_entry('criacao', jsonb_build_object('machines', array_length(p_equipment_ids,1))))
  RETURNING id INTO v_batch_id;
  FOREACH v_id IN ARRAY p_equipment_ids LOOP
    SELECT * INTO v_eq FROM public.client_equipment WHERE id = v_id;
    v_situation := CASE WHEN v_eq.machine_status = 'sucateada' THEN 'sucata' WHEN v_eq.machine_status IN ('vendida','inativa') THEN v_eq.machine_status ELSE NULL END;
    -- filial_id do item = filial efetiva (validação > cadastral) no momento do lote
    INSERT INTO public.equipment_regularization_items (batch_id, equipment_id, filial_id, dealer_location, serial_chassis, client_code, client_name, machine_situation, model, year, pmp_number)
    VALUES (v_batch_id, v_eq.id, COALESCE(v_eq.validation_filial_id, v_eq.filial_id), v_eq.product_raw, v_eq.serial_chassis, v_eq.client_code, v_eq.client_name, v_situation, v_eq.model, v_eq.year, NULLIF(TRIM(p_pmp_number), ''));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('batch_id', v_batch_id, 'total', v_count, 'status', 'aguardando_envio');
END $$;

-- 6. Permissões idênticas às atuais
REVOKE ALL ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_equipment_validators(uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_equipment_validation_summary(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_equipment_validators(uuid, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_equipment_validation_summary(uuid, uuid[], boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean) TO anon, authenticated, service_role;
