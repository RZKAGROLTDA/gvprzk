-- =============================================================================
-- Regularização de Máquinas — seleção de várias filiais autorizadas
-- Exceção aprovada (19/10/2026): só Validação e Regularização de Máquinas
-- consolidam filiais autorizadas. CRM, POPS e demais módulos não mudam.
--
-- O que muda:
--  1. Consultas (contadores, pendentes por cliente, máquinas do cliente, lotes)
--     aceitam p_filial_ids uuid[] e p_include_sem_filial boolean, conferidos por
--     equipment_park_scope (mesma regra da Validação). Sem esses parâmetros o
--     resultado é idêntico ao atual (modo legado).
--  2. Lista de lotes: visualização "erro_envio" (lotes cujo último envio falhou),
--     só leitura — não é etapa nova; o lote continua na mesma etapa.
--  3. Criação de lote com p_filial_ids: aceita máquinas de várias filiais
--     selecionadas e autorizadas. Duplicidade, lote aberto, já regularizada,
--     situação e "Sem filial" só na visão global continuam valendo. Modo legado
--     inalterado (uma filial por lote).
--  4. Ações sobre lote (detalhe/PDF, envio/reenvio, erro de envio, validação,
--     conclusão, cancelamento, retirada): independem da Filial Ativa. Admin/
--     Gerente: qualquer lote. Demais: TODAS as filiais do lote precisam estar
--     autorizadas ao usuário; lote com máquina sem filial só na visão global.
--     Uma filial ativa enviada continua sendo validada (inexistente/não
--     autorizada -> 42501).
-- Não muda: filial das máquinas e dos itens (cada item guarda a original),
-- lotes existentes, status, histórico, triggers, RLS, cargos e permissões
-- (EXECUTE idêntico ao atual).
-- =============================================================================

-- 4. Conferência de filiais do lote (mesma assinatura; permissões preservadas)
CREATE OR REPLACE FUNCTION public.equipment_regularization_assert_batch_filial(p_batch_id uuid, p_filial_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_eff uuid[];
  v_allowed uuid[];
  v_items integer; v_nulls integer; v_outside integer;
BEGIN
  -- Valida a filial ativa enviada (se houver) e exige login.
  v_eff := public.effective_filial_ids(p_filial_id);
  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager') THEN
    RETURN;
  END IF;
  v_allowed := public.get_user_filial_ids_internal(v_uid);
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE i.filial_id IS NULL),
         COUNT(*) FILTER (WHERE i.filial_id IS NOT NULL AND NOT (i.filial_id = ANY (COALESCE(v_allowed, '{}'::uuid[]))))
    INTO v_items, v_nulls, v_outside
  FROM public.equipment_regularization_items i
  WHERE i.batch_id = p_batch_id;
  IF v_items = 0 THEN
    RAISE EXCEPTION 'Lote sem itens: operacao permitida apenas na visao global' USING ERRCODE = '42501';
  END IF;
  IF v_nulls > 0 THEN
    RAISE EXCEPTION 'Lote sem filial definida: operacao permitida apenas na visao global' USING ERRCODE = '42501';
  END IF;
  IF v_outside > 0 THEN
    RAISE EXCEPTION 'Lote contem maquinas de filial nao autorizada' USING ERRCODE = '42501';
  END IF;
END $$;

-- 1. Contadores
DROP FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text);
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
      SELECT ce.id, ce.filial_id, ce.client_code, ce.client_name, ce.machine_status
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
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

-- 1. Pendentes agrupados por cliente
DROP FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer);
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
      SELECT ce.filial_id, ce.client_code, ce.client_name, ce.machine_status, ce.last_validation_at
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
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

-- 1. Máquinas pendentes de um cliente
DROP FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text);
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
      SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id, ce.model, ce.serial_chassis, ce.year, ce.machine_status, ce.last_validation_at, ce.validation_source
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (COALESCE(NULLIF(TRIM(ce.client_code), ''), UPPER(TRIM(ce.client_name))) || '|' || COALESCE(ce.filial_id::text, 'SEM_FILIAL')) = p_client_key
        AND (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
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

-- 1 e 2. Lotes por etapa (+ visualização erro_envio, só leitura)
DROP FUNCTION public.equipment_regularization_list_batches(text, uuid, text, integer, integer);
CREATE FUNCTION public.equipment_regularization_list_batches(
  p_stage text, p_filial_id uuid DEFAULT NULL, p_client text DEFAULT NULL, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_client text := NULLIF(TRIM(p_client), '');
  v_legacy boolean := p_filial_ids IS NULL AND NOT COALESCE(p_include_sem_filial, false);
  v_filiais uuid[] := '{}'; v_global boolean := false; v_allowed uuid[]; v_ids uuid[] := '{}'; v_null boolean := false;
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF v_legacy THEN
    v_filiais := public.effective_filial_ids(p_filial_id);
  ELSE
    SELECT sc.ids, sc.include_null INTO v_ids, v_null FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial) sc;
    v_global := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager');
    IF NOT v_global THEN v_allowed := public.get_user_filial_ids_internal(auth.uid()); END IF;
  END IF;
  RETURN (
    WITH scoped AS (
      SELECT b.id, b.status, b.send_status, b.created_at, b.pdf_generated_at, b.sent_at, b.recipients, b.send_attempts, b.validation_started_at,
        b.applied_at, b.cancelled_at, b.cancel_reason, b.created_by,
        CASE WHEN b.status IN ('aguardando_envio','erro_envio','gerado') THEN 'aguardando_envio'
             WHEN b.status IN ('concluido','enviado') THEN 'regularizados' ELSE b.status END AS stage,
        (SELECT min(i.filial_id::text)::uuid FROM public.equipment_regularization_items i WHERE i.batch_id = b.id) AS filial_id,
        (SELECT string_agg(DISTINCT COALESCE(fx.nome, 'Sem filial'), ' · ') FROM public.equipment_regularization_items i LEFT JOIN public.filiais fx ON fx.id = i.filial_id WHERE i.batch_id = b.id) AS filiais_nomes,
        (SELECT count(*) FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND i.removed_at IS NULL) AS active_items,
        (SELECT count(*) FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND i.removed_at IS NOT NULL) AS removed_items,
        (SELECT string_agg(DISTINCT COALESCE(i.client_name, '—'), ' · ') FROM public.equipment_regularization_items i WHERE i.batch_id = b.id) AS clients,
        (SELECT string_agg(DISTINCT COALESCE(i.client_code, '—'), ' · ') FROM public.equipment_regularization_items i WHERE i.batch_id = b.id) AS client_codes
      FROM public.equipment_regularization_batches b
      WHERE (
          (v_legacy
            AND (cardinality(v_filiais) = 0 OR (
                EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id)
                AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND (i.filial_id IS NULL OR NOT (i.filial_id = ANY(v_filiais))))))
            AND (p_filial_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND i.filial_id IS DISTINCT FROM p_filial_id)))
          OR
          (NOT v_legacy
            -- aparece se tiver ao menos uma máquina nas filiais selecionadas
            AND EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id
                        AND (i.filial_id = ANY (v_ids) OR (v_null AND i.filial_id IS NULL)))
            -- e, fora da visão global, todas as filiais do lote precisam ser autorizadas
            AND (v_global OR NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id
                        AND (i.filial_id IS NULL OR NOT (i.filial_id = ANY (COALESCE(v_allowed, '{}'::uuid[])))))))
        )
        AND (v_client IS NULL OR EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id
          AND (unaccent(i.client_name) ILIKE '%' || unaccent(v_client) || '%' OR LTRIM(i.client_code, '0') = LTRIM(v_client, '0') OR i.serial_chassis ILIKE '%' || v_client || '%')))
    ),
    filtered AS (
      SELECT * FROM scoped
      WHERE (p_stage <> 'erro_envio' AND stage = p_stage)
         OR (p_stage = 'erro_envio' AND (status = 'erro_envio' OR send_status = 'erro'))
    )
    SELECT jsonb_build_object(
      'counts', (SELECT COALESCE(jsonb_object_agg(stage, n), '{}'::jsonb) FROM (SELECT stage, count(*) n FROM scoped GROUP BY stage) c)
                || jsonb_build_object('erro_envio', (SELECT count(*) FROM scoped WHERE status = 'erro_envio' OR send_status = 'erro')),
      'total', (SELECT count(*) FROM filtered),
      'batches', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s2.id, 'status', s2.status, 'stage', s2.stage, 'send_status', s2.send_status, 'created_at', s2.created_at, 'pdf_generated_at', s2.pdf_generated_at,
          'sent_at', s2.sent_at, 'recipients', COALESCE(to_jsonb(s2.recipients), '[]'::jsonb), 'send_attempts', s2.send_attempts,
          'validation_started_at', s2.validation_started_at, 'applied_at', s2.applied_at, 'cancelled_at', s2.cancelled_at, 'cancel_reason', s2.cancel_reason,
          'filial_id', s2.filial_id, 'filial_nome', f.nome, 'filiais_nomes', s2.filiais_nomes, 'active_items', s2.active_items, 'removed_items', s2.removed_items,
          'clients', s2.clients, 'client_codes', s2.client_codes,
          'created_by_name', (SELECT p.name FROM public.profiles p WHERE p.user_id = s2.created_by LIMIT 1)
        ) ORDER BY COALESCE(s2.applied_at, s2.cancelled_at, s2.validation_started_at, s2.sent_at, s2.created_at) DESC, s2.id)
        FROM (SELECT * FROM filtered ORDER BY COALESCE(applied_at, cancelled_at, validation_started_at, sent_at, created_at) DESC, id
              LIMIT p_page_size OFFSET (GREATEST(p_page,1) - 1) * p_page_size) s2
        LEFT JOIN public.filiais f ON f.id = s2.filial_id), '[]'::jsonb)
    )
  );
END $$;

-- 3. Criação de lote
DROP FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid);
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
    IF v_legacy THEN
      IF cardinality(v_filiais) > 0 THEN
        IF v_eq.filial_id IS NULL THEN RAISE EXCEPTION 'Maquina % sem filial cadastrada nao pode entrar em lote na filial ativa', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
        IF NOT (v_eq.filial_id = ANY(v_filiais)) THEN RAISE EXCEPTION 'Maquina % pertence a outra filial e nao pode entrar neste lote', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
      END IF;
      IF NOT v_first_set THEN v_first_filial := v_eq.filial_id; v_first_set := true;
      ELSIF v_eq.filial_id IS DISTINCT FROM v_first_filial THEN RAISE EXCEPTION 'Lote nao pode conter maquinas de filiais diferentes' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF v_eq.filial_id IS NULL AND NOT s.include_null THEN
        RAISE EXCEPTION 'Maquina % sem filial cadastrada: permitido apenas na visao global com "Sem filial" selecionado', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501';
      END IF;
      IF v_eq.filial_id IS NOT NULL AND NOT (v_eq.filial_id = ANY (s.ids)) THEN
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
    -- filial_id do item = filial original da máquina (nenhuma transferência)
    INSERT INTO public.equipment_regularization_items (batch_id, equipment_id, filial_id, dealer_location, serial_chassis, client_code, client_name, machine_situation, model, year, pmp_number)
    VALUES (v_batch_id, v_eq.id, v_eq.filial_id, v_eq.product_raw, v_eq.serial_chassis, v_eq.client_code, v_eq.client_name, v_situation, v_eq.model, v_eq.year, NULLIF(TRIM(p_pmp_number), ''));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('batch_id', v_batch_id, 'total', v_count, 'status', 'aguardando_envio');
END $$;

-- Permissões idênticas às atuais
REVOKE ALL ON FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_regularization_list_batches(text, uuid, text, integer, integer, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text, uuid[], boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer, uuid[], boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text, uuid[], boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_list_batches(text, uuid, text, integer, integer, uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text, uuid, uuid[], boolean) TO anon, authenticated, service_role;
