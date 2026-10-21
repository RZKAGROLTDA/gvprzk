DO $sim$
DECLARE
  stmts text[] := ARRAY[
$st0$- =============================================================================
- Filial da Validação — Parque de Máquinas e Regularização (v2, corrigido)
- Status: PREPARADO. NÃO APLICADO. Aguardando autorização.
-
- Regras implementadas:
-  1. Novo registro: client_equipment.validation_filial_id (filial responsável
-     pela última validação) + validation_filial_source (origem do vínculo,
-     para auditoria). A filial cadastral (filial_id) NUNCA é alterada —
-     nenhuma instrução deste arquivo escreve em filial_id.
-  2. Novas validações (validate_client_equipment): gravam obrigatoriamente a
-     filial autorizada usada na operação. Se a filial responsável não puder
-     ser determinada com segurança (nenhuma filial selecionada/autorizada
-     identificável), a operação é RECUSADA (42501) — sem manutenção
-     silenciosa do vínculo anterior. Mudança de situação para
-     vendida/inativa/sucateada segue a mesma regra.
-  3. Backfill SOMENTE com evidência histórica datada (updated_at preservado):
-     backfill_tarefa — máquina vinculada a tarefa(s) cuja filial (por nome
-     normalizado) é única e cuja data é compatível com a data da validação
-     (start_date entre last_validation_at - 365 dias e last_validation_at).
-     NÃO usa a filial atual do colaborador (perfil/adicionais) nem
-     historical_users sem data de vigência como prova da filial na data da
-     validação. Medido em 21/10: 1.397 máquinas com evidência única;
-     2 ambíguas e as demais validadas sem evidência permanecem SEM filial
-     de validação, para revisão manual (quantidade real recalculada na
-     simulação — não assumir 289).
-  4. Critério de filial nos filtros multifiliais dos dois módulos:
-     - Máquina VALIDADA: usa exclusivamente validation_filial_id (nunca
-       faz fallback para a filial cadastral).
-     - Máquina NUNCA VALIDADA: usa a filial cadastral (filial_id),
-       permanecendo no Parque normalmente.
-     - "Sem filial" = sem filial efetiva por esse critério.
-     Mesmo critério em indicadores, listagem, validadores, resumo,
-     exportação (via listagem), pendentes da Regularização e criação de
-     lote. Na Regularização, os critérios próprios de situação
-     (vendida/inativa/sucateada) e pendência são mantidos.
-  5. Criação de lote: elegibilidade pela filial efetiva; o item do lote
-     grava a filial efetiva no momento (snapshot). Lotes e itens existentes
-     não são alterados; a lista de lotes continua lendo o snapshot do item.
-
- Não muda: RLS, cargos, vínculos, user_filiais, profiles, filiais, CRM, POPS,
- históricos, lotes existentes, filial cadastral de qualquer máquina,
- "Salvar e validar" (mesma autorização) e o agrupamento por filial do
- validador na "Execução das Validações".
- =============================================================================

- 1. Colunas novas (nulos permitidos; sem backfill automático fora das regras)
ALTER TABLE public.client_equipment
  ADD COLUMN IF NOT EXISTS validation_filial_id uuid REFERENCES public.filiais(id),
  ADD COLUMN IF NOT EXISTS validation_filial_source text$st0$,
$st1$- 2. Validação/edição: registra a filial responsável; NUNCA escreve filial_id
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

  -- Autorização de escopo pela filial cadastral (somente leitura do campo)
  IF v_cur_filial IS NOT NULL
     AND cardinality(v_eff) > 0 AND NOT (v_cur_filial = ANY(v_eff)) THEN
    RAISE EXCEPTION 'Acesso negado: maquina de outra filial' USING ERRCODE = '42501';
  END IF;

  -- Registra a filial responsável na validação ou na mudança de situação.
  v_registra := p_mark_validated
    OR (p_machine_status IS NOT NULL
        AND p_machine_status IN ('vendida','inativa','sucateada')
        AND p_machine_status IS DISTINCT FROM
            (SELECT ce2.machine_status FROM public.client_equipment ce2 WHERE ce2.id = p_equipment_id));
  v_filial_resp := CASE
    WHEN cardinality(v_eff) = 1 THEN v_eff[1]
    WHEN v_cur_filial IS NOT NULL AND v_cur_filial = ANY(v_eff) THEN v_cur_filial
    ELSE NULL END;
  IF v_registra AND v_filial_resp IS NULL THEN
    RAISE EXCEPTION 'Selecione uma filial autorizada no cabecalho para registrar a filial responsavel desta operacao'
      USING ERRCODE = '42501';
  END IF;

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
         validated_by = CASE WHEN p_mark_validated THEN v_uid ELSE ce.validated_by END,
         last_validation_at = CASE WHEN p_mark_validated THEN now() ELSE ce.last_validation_at END,
         validation_filial_id = CASE WHEN v_registra THEN v_filial_resp ELSE ce.validation_filial_id END,
         validation_filial_source = CASE WHEN v_registra
                                         THEN CASE WHEN p_mark_validated THEN 'validacao' ELSE 'situacao' END
                                         ELSE ce.validation_filial_source END,
         updated_at = now()
   WHERE ce.id = p_equipment_id
  RETURNING ce.*;
END
$function$$st1$,
$st2$- 3. Backfill SOMENTE com evidência histórica datada: tarefa vinculada com
-    filial única e data compatível com a validação (janela de 365 dias).
-    Triggers desabilitados apenas durante o backfill para preservar
-    updated_at e não reordenar a listagem do Parque. Seleção dinâmica e
-    idempotente (só preenche quem ainda não tem vínculo).
ALTER TABLE public.client_equipment DISABLE TRIGGER USER$st2$,
$st3$WITH ev AS (
  SELECT ce.id, COUNT(DISTINCT f.id) AS n, MIN(f.id::text)::uuid AS fil
    FROM public.client_equipment ce
    JOIN public.task_equipment te ON te.equipment_id = ce.id
    JOIN public.tasks t ON t.id = te.task_id AND t.filial IS NOT NULL
    JOIN public.filiais f ON lower(trim(f.nome)) = lower(trim(t.filial))
   WHERE ce.last_validation_at IS NOT NULL
     AND ce.validation_filial_id IS NULL
     AND t.start_date <= ce.last_validation_at::date
     AND t.start_date >= (ce.last_validation_at::date - 365)
   GROUP BY ce.id
)
UPDATE public.client_equipment ce
   SET validation_filial_id = ev.fil,
       validation_filial_source = 'backfill_tarefa'
  FROM ev
 WHERE ce.id = ev.id AND ev.n = 1$st3$,
$st4$ALTER TABLE public.client_equipment ENABLE TRIGGER USER$st4$,
$st5$- 4. Parque — listagem paginada (mesma assinatura + 2 colunas informativas)
-    Filial efetiva: validada => validation_filial_id; nunca validada => filial_id.
DROP FUNCTION IF EXISTS public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean)$st5$,
$st6$CREATE FUNCTION public.get_equipment_park_paginated(
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
    WHERE (s.all_filiais OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) = ANY (s.ids)
           OR (s.include_null AND (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL))
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
END $$$st6$,
$st7$- 4. Parque — indicadores (mesmo critério de filial efetiva)
DROP FUNCTION IF EXISTS public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean)$st7$,
$st8$CREATE FUNCTION public.get_equipment_park_kpis(
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
    WHERE (s.all_filiais OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) = ANY (s.ids)
           OR (s.include_null AND (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL))
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
END $$$st8$,
$st9$- 4. Parque — validadores (seleção pela filial efetiva da máquina)
DROP FUNCTION IF EXISTS public.get_equipment_validators(uuid, uuid[], boolean)$st9$,
$st10$CREATE FUNCTION public.get_equipment_validators(
  p_filial_id uuid DEFAULT NULL, p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(user_id uuid, name text, filial_id uuid, filial_nome text, validated_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT * FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial)
  ), base AS (
    SELECT public.resolve_primary_user_id(ce.validated_by) AS uid,
           ce.id AS eq_id,
           (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) AS eq_filial_id
    FROM public.client_equipment ce
    CROSS JOIN s
    WHERE ce.validated_by IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND public.can_view_equipment_park()
      AND ((CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) = ANY (s.ids)
           OR (s.include_null AND (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL))
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
$$$st10$,
$st11$- 4. Parque — Execução das Validações (seleção pela filial efetiva da máquina;
-    agrupamento por filial do validador preservado)
DROP FUNCTION IF EXISTS public.get_equipment_validation_summary(uuid, uuid[], boolean)$st11$,
$st12$CREATE FUNCTION public.get_equipment_validation_summary(
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
    LEFT JOIN public.filiais fe ON fe.id = ce.validation_filial_id
    WHERE ce.last_validation_at IS NOT NULL
      AND public.can_view_equipment_park()
      AND (s.all_filiais OR ce.validation_filial_id = ANY (s.ids)
           OR (s.include_null AND ce.validation_filial_id IS NULL))
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
$$$st12$,
$st13$- 5. Regularização — contadores (filial efetiva; critérios de situação e
-    pendência mantidos)
DROP FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean)$st13$,
$st14$CREATE FUNCTION public.equipment_regularization_pending_kpis(
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
      SELECT ce.id, (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) AS filial_id, ce.client_code, ce.client_name, ce.machine_status
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND (s.all_filiais OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) = ANY (s.ids)
             OR (s.include_null AND (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL))
        AND (NOT p_without_filial OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL)
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
END $$$st14$,
$st15$- 5. Regularização — pendentes por cliente (filial efetiva)
DROP FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean)$st15$,
$st16$CREATE FUNCTION public.equipment_regularization_pending_clients(
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
      SELECT (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) AS filial_id, ce.client_code, ce.client_name, ce.machine_status, ce.last_validation_at
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (s.all_filiais OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) = ANY (s.ids)
             OR (s.include_null AND (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL))
        AND (NOT p_without_filial OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL)
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
END $$$st16$,
$st17$- 5. Regularização — máquinas pendentes de um cliente (filial efetiva;
-    inclui a correção do jsonb_build_object com todos os rótulos)
DROP FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean)$st17$,
$st18$CREATE FUNCTION public.equipment_regularization_pending_machines(
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
      SELECT ce.id, ce.client_code, ce.client_name, (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) AS filial_id, ce.model, ce.serial_chassis, ce.year, ce.machine_status, ce.last_validation_at, ce.validation_source
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (COALESCE(NULLIF(TRIM(ce.client_code), ''), UPPER(TRIM(ce.client_name))) || '|' || COALESCE((CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END)::text, 'SEM_FILIAL')) = p_client_key
        AND (s.all_filiais OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) = ANY (s.ids)
             OR (s.include_null AND (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL))
        AND (NOT p_without_filial OR (CASE WHEN ce.last_validation_at IS NOT NULL THEN ce.validation_filial_id ELSE ce.filial_id END) IS NULL)
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
END $$$st18$,
$st19$- 5. Regularização — criação de lote (elegibilidade pela filial efetiva;
-    item do lote grava a filial efetiva como snapshot; modo legado mantido)
DROP FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean)$st19$,
$st20$CREATE FUNCTION public.equipment_regularization_create_batch(
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
    v_eff_filial := CASE WHEN v_eq.last_validation_at IS NOT NULL THEN v_eq.validation_filial_id ELSE v_eq.filial_id END;
    IF v_legacy THEN
      IF cardinality(v_filiais) > 0 THEN
        IF v_eff_filial IS NULL THEN RAISE EXCEPTION 'Maquina % sem filial de validacao nao pode entrar em lote na filial ativa', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
        IF NOT (v_eff_filial = ANY(v_filiais)) THEN RAISE EXCEPTION 'Maquina % pertence a outra filial e nao pode entrar neste lote', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
      END IF;
      IF NOT v_first_set THEN v_first_filial := v_eff_filial; v_first_set := true;
      ELSIF v_eff_filial IS DISTINCT FROM v_first_filial THEN RAISE EXCEPTION 'Lote nao pode conter maquinas de filiais diferentes' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF v_eff_filial IS NULL AND NOT s.include_null THEN
        RAISE EXCEPTION 'Maquina % sem filial de validacao: permitido apenas na visao global com "Sem filial" selecionado', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501';
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
    VALUES (v_batch_id, v_eq.id, (CASE WHEN v_eq.last_validation_at IS NOT NULL THEN v_eq.validation_filial_id ELSE v_eq.filial_id END), v_eq.product_raw, v_eq.serial_chassis, v_eq.client_code, v_eq.client_name, v_situation, v_eq.model, v_eq.year, NULLIF(TRIM(p_pmp_number), ''));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('batch_id', v_batch_id, 'total', v_count, 'status', 'aguardando_envio');
END $$$st20$,
$st21$- 6. Permissões idênticas às atuais
REVOKE ALL ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean) FROM PUBLIC, anon$st21$,
$st22$REVOKE ALL ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean) FROM PUBLIC, anon$st22$,
$st23$REVOKE ALL ON FUNCTION public.get_equipment_validators(uuid, uuid[], boolean) FROM PUBLIC, anon$st23$,
$st24$REVOKE ALL ON FUNCTION public.get_equipment_validation_summary(uuid, uuid[], boolean) FROM PUBLIC, anon$st24$,
$st25$GRANT EXECUTE ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer, uuid[], boolean) TO authenticated, service_role$st25$,
$st26$GRANT EXECUTE ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean, uuid[], boolean) TO authenticated, service_role$st26$,
$st27$GRANT EXECUTE ON FUNCTION public.get_equipment_validators(uuid, uuid[], boolean) TO authenticated, service_role$st27$,
$st28$GRANT EXECUTE ON FUNCTION public.get_equipment_validation_summary(uuid, uuid[], boolean) TO authenticated, service_role$st28$,
$st29$REVOKE ALL ON FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean) FROM PUBLIC$st29$,
$st30$REVOKE ALL ON FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean) FROM PUBLIC$st30$,
$st31$REVOKE ALL ON FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean) FROM PUBLIC$st31$,
$st32$REVOKE ALL ON FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean) FROM PUBLIC$st32$,
$st33$GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean) TO anon, authenticated, service_role$st33$,
$st34$GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean) TO anon, authenticated, service_role$st34$,
$st35$GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean) TO anon, authenticated, service_role$st35$,
$st36$GRANT EXECUTE ON FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean) TO anon, authenticated, service_role$st36$
];
  hashes text[] := ARRAY['be8c7b6c80497009593606f56e576b2a878c1b31b3a325e708f305238b50a06e','fea20068378c5235109223c28899b5c7a9c45dc5b1fb23e019aeb7fe670579eb','dc0aafbf9fddc99d765bb404cc9da253436a251a3396242c2d557b33fe97bc85','0a7329c0de09a33301f13302e02ee287ed5330454a471214c302123fd984e422','d08a317a5dbe0f2d3e284b8d55ca8085d110b3c192e089bd0b37dbf260e9964a','57dedb4e24254da2ac6ef459a2cba5d346268b056ff0fb5d2597f8bd547ef6c5','7be1bf06f7288b61d9178ef41e782c9dae16d51975bfc5ab84a99e3b5836ee07','6214adb586587312f6f9d14b658c290beab71ec1b3a425eb444c9b693a777bf4','ac1a7baab23a1d7aed47219cb540ed39092d5f1d6aaed5948b977dda5c210995','c612259924b7e044583cf315d324ad361e1bcae29257db45bc959e02b3719a95','ec726e6d8e6b01db7c976d9dcaa2965187b67e6a6798960f7afceb5518850eaa','066e33f99ebd64c429b78c5aca4bd7653d9b2fecaca798f153a2e7632f620ca0','eb7764c6f939a1b8cbae9b6eee13a233259f9256b1c556fc39bbd411ce30e4df','14992c742e07fda18da0f38f57fe83c793bce7ec868681cacfa4bae2b73cea60','bbe4388f5ccf9a82437ef0045a72d1b5a168fb341b5f3d2caabf8f965d16a5d7','6305610656ca40c00e9afe78aef66cfe23900edea97541203a8de828cc732e04','10d6a7470ffc713ccb0087f383237cca1183dd9b5688df1cb498ea242ca4988e','5e6068ddb6543d8ab35114d91bc1019edbf199982ecea1e419d7ccac5ff354c3','61cb1e2220dfa5a05b5b11a5ae7d712e8780c3511ec350b2c7d834de60c8de58','932eb72f7f30340db7aa7d72626580717733ff44705125960a68f34678ba7b94','ab463a53948245a73d57563df18e64301a74e9827281995d7e1d68201ff4f0ff','44a1d25552ae2476e6c8491d30a46ab893b9e26d505e9f05f59b657c633a461c','54c54a485bb86c0472fff658d01899782c7810fa8cdd5479d1ea203918473b05','88b85c978f7301e9b3c5956133e9c4716b46e0959d6ea1c7a1e5a1ee79811f56','12d0b7dead0017be4d9a5af7d6dde02d3f8ca76aaa091dd8255b398ad30a34f6','de673ab817b27ba5180d34e66fa440998f7f23c5f87232e096a1c70d604d5acf','410c0ee52216e1b91f441e5dc1186fd55d3a6d0110e6e17e4be26920b57b51eb','40d763b8c28076ef57eea827feebbe1b62f0256e7707f03e4d8b8f855221d760','bd6ad430b77379a190280139dce24fdd8ad9d6293870c157bd66e3394bf449e4','c6504a19c84f999099107aea5ce4982f4645ab06ef2d9ef8b4e21200d9f06ed6','b30006bb59b5db4215ee4bae466f0b0fc71219149b213bccdc1c81f9ab17ea1b','8862ef46d8adcaad869a5d12592515391703bbad18982c67f14f6a5a5ea88431','144ff637855e1cb41895f9c0f7a6ec7490aa2aeb6908237686ede2b28144965a','b3b645cc14e30236719083a88e5bdb0fa388f0a0fb13218f33439e463489f339','a747ff8b04a1f9e8f98877513ee9bcd44abbc3ecb831f45ce0197a17ac9e15a7','488aa8ae6ab48305a78a886ee8436ea400482ecd1b62d8f025e59f0f19af681a','39dbc13edabc7e8c9c7f5d964e1659663af4a7e86e30b42f0c34131e41109e09'];
  v_i int; v_fp_before text; v_fp_after text;
  v_report text := ''; v_n bigint; v_n2 bigint; v_j jsonb;
  v_adm text := '{"sub":"b6543a7f-3b83-42dc-aa69-930dcb56b21d","role":"authenticated"}';
  v_sup text := '{"sub":"9772f518-1f3e-49db-8536-2648d1ca1959","role":"authenticated"}';
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  SELECT md5(string_agg(COALESCE(filial_id::text,'#'), ',' ORDER BY id)) INTO v_fp_before FROM public.client_equipment;
  FOR v_i IN 1..array_length(stmts,1) LOOP
    IF encode(digest(stmts[v_i],'sha256'),'hex') <> hashes[v_i] THEN
      RAISE EXCEPTION 'SHA_DIVERGENTE no statement %', v_i;
    END IF;
    EXECUTE stmts[v_i];
  END LOOP;
  SELECT md5(string_agg(COALESCE(filial_id::text,'#'), ',' ORDER BY id)) INTO v_fp_after FROM public.client_equipment;
  IF v_fp_before IS DISTINCT FROM v_fp_after THEN RAISE EXCEPTION 'FALHA: filial cadastral alterada'; END IF;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE last_validation_at IS NOT NULL) INTO v_n, v_n2 FROM public.client_equipment;
  v_report := v_report || format('|maquinas=%s validadas=%s', v_n, v_n2);
  SELECT COUNT(*) FILTER (WHERE validation_filial_id IS NOT NULL),
         COUNT(*) FILTER (WHERE last_validation_at IS NOT NULL AND validation_filial_id IS NULL),
         COUNT(*) FILTER (WHERE validation_filial_source = 'backfill_tarefa')
    INTO v_n, v_n2, v_i FROM public.client_equipment;
  v_report := v_report || format('|com_filial_validacao=%s validadas_sem_vinculo=%s backfill_tarefa=%s', v_n, v_n2, v_i);
  SELECT (SELECT COUNT(*) FROM public.equipment_regularization_batches),
         (SELECT COUNT(*) FROM public.equipment_regularization_items) INTO v_n, v_n2;
  v_report := v_report || format('|lotes=%s itens=%s', v_n, v_n2);
  -- testes funcionais como gerente (visão global sem Filial Ativa)
  PERFORM set_config('request.jwt.claims', v_adm, true);
  SELECT total INTO v_n FROM public.get_equipment_park_kpis();
  v_report := v_report || '|kpis_legado_total=' || v_n;
  SELECT total INTO v_n FROM public.get_equipment_park_kpis(p_filial_ids => ARRAY['f131ae2a-ba13-4abf-ab64-dfb7cea5c7e4']::uuid[]);
  v_report := v_report || '|kpis_uma_filial=' || v_n;
  SELECT total INTO v_n FROM public.get_equipment_park_kpis(p_filial_ids => ARRAY['f131ae2a-ba13-4abf-ab64-dfb7cea5c7e4','1547cfe6-e532-436b-be87-448470f76e87']::uuid[]);
  v_report := v_report || '|kpis_duas_filiais=' || v_n;
  SELECT total INTO v_n FROM public.get_equipment_park_kpis(p_filial_ids => '{}'::uuid[], p_include_sem_filial => false);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHA: selecao vazia deveria retornar 0, retornou %', v_n; END IF;
  v_report := v_report || '|kpis_vazia=0';
  SELECT total INTO v_n FROM public.get_equipment_park_kpis(p_filial_ids => '{}'::uuid[], p_include_sem_filial => true);
  v_report := v_report || '|kpis_sem_filial=' || v_n;
  SELECT total_count INTO v_n FROM public.get_equipment_park_paginated(p_limit => 1);
  v_report := v_report || '|park_legado_total=' || v_n;
  SELECT COUNT(*) INTO v_n FROM public.get_equipment_validators();
  SELECT total_validated INTO v_n2 FROM public.get_equipment_validation_summary();
  v_report := v_report || format('|validadores=%s resumo_validadas=%s', v_n, v_n2);
  v_j := public.equipment_regularization_pending_kpis();
  v_report := v_report || '|reg_pendentes=' || (v_j->>'total_pending');
  v_j := public.equipment_regularization_pending_clients(p_page => 1, p_page_size => 1);
  v_report := v_report || '|reg_clientes=' || (v_j->>'total_groups');
  v_j := public.equipment_regularization_pending_machines(v_j->'clients'->0->>'client_key');
  v_report := v_report || '|reg_maquinas_cliente1=' || jsonb_array_length(v_j);
  -- filial não autorizada: supervisor com apenas C&F - Ananindeua pedindo Querência
  PERFORM set_config('request.jwt.claims', v_sup, true);
  BEGIN
    PERFORM public.get_equipment_park_kpis(p_filial_ids => ARRAY['f131ae2a-ba13-4abf-ab64-dfb7cea5c7e4']::uuid[]);
    RAISE EXCEPTION 'FALHA: filial nao autorizada nao foi recusada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHA:%' THEN RAISE; END IF;
    v_report := v_report || '|recusa_filial_nao_autorizada=' || SQLSTATE;
  END;
  RAISE EXCEPTION 'SIMULACAO_OK_ROLLBACK %', v_report;
END $sim$;