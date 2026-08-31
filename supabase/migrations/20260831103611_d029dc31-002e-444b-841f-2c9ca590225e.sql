-- 1. Estados e colunas de auditoria de envio
ALTER TABLE public.equipment_regularization_batches
  DROP CONSTRAINT IF EXISTS equipment_regularization_batches_status_chk;

ALTER TABLE public.equipment_regularization_batches
  ADD CONSTRAINT equipment_regularization_batches_status_chk
  CHECK (status = ANY (ARRAY['gerado','aguardando_envio','erro_envio','enviado','concluido','cancelado']));

ALTER TABLE public.equipment_regularization_batches
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_generated_by uuid,
  ADD COLUMN IF NOT EXISTS recipients text[],
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_message text,
  ADD COLUMN IF NOT EXISTS send_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS send_error text,
  ADD COLUMN IF NOT EXISTS send_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_by uuid;

ALTER TABLE public.equipment_regularization_batches
  DROP CONSTRAINT IF EXISTS equipment_regularization_batches_send_status_chk;
ALTER TABLE public.equipment_regularization_batches
  ADD CONSTRAINT equipment_regularization_batches_send_status_chk
  CHECK (send_status = ANY (ARRAY['pendente','enviado','erro']));

-- 2. Guard do lote: transicoes do novo fluxo
CREATE OR REPLACE FUNCTION public.equipment_regularization_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'created_by e imutavel apos a criacao do lote';
    END IF;

    IF OLD.status IN ('enviado', 'concluido', 'cancelado') THEN
      RAISE EXCEPTION 'Lote % nao pode ser alterado', OLD.status;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status IN ('aguardando_envio', 'erro_envio') AND NEW.status = 'concluido' THEN
        IF current_setting('app.reg_finalize', true) IS DISTINCT FROM OLD.id::text THEN
          RAISE EXCEPTION 'Conclusao somente via equipment_regularization_finalize()';
        END IF;
        IF NEW.sent_by IS NULL OR NEW.sent_at IS NULL THEN
          RAISE EXCEPTION 'Conclusao exige sent_by e sent_at';
        END IF;
      ELSIF OLD.status = 'aguardando_envio' AND NEW.status = 'erro_envio' THEN
        NULL;
      ELSIF OLD.status = 'erro_envio' AND NEW.status = 'aguardando_envio' THEN
        NULL;
      ELSIF OLD.status = 'gerado' AND NEW.status = 'enviado' THEN
        IF current_setting('app.reg_confirm_send', true) IS DISTINCT FROM OLD.id::text THEN
          RAISE EXCEPTION 'Confirmacao de envio somente via equipment_regularization_confirm_send()';
        END IF;
        IF NEW.sent_by IS NULL OR NEW.sent_at IS NULL THEN
          RAISE EXCEPTION 'Envio exige sent_by e sent_at';
        END IF;
      ELSIF OLD.status IN ('gerado', 'aguardando_envio', 'erro_envio') AND NEW.status = 'cancelado' THEN
        IF NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL THEN
          RAISE EXCEPTION 'Cancelamento exige cancelled_by e cancelled_at';
        END IF;
      ELSE
        RAISE EXCEPTION 'Transicao de status invalida: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('enviado', 'concluido', 'cancelado') THEN
      RAISE EXCEPTION 'Lote % nao pode ser excluido', OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- 3. Guard dos itens
CREATE OR REPLACE FUNCTION public.equipment_regularization_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_batch uuid;
BEGIN
  v_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  SELECT status INTO v_status FROM public.equipment_regularization_batches WHERE id = v_batch;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lote inexistente';
  END IF;

  IF v_status NOT IN ('gerado', 'aguardando_envio', 'erro_envio')
     AND current_setting('app.reg_finalize', true) IS DISTINCT FROM v_batch::text THEN
    RAISE EXCEPTION 'Itens so podem ser alterados enquanto o lote aguarda envio (status atual: %)', v_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- 4. Remove o fluxo antigo que regularizava imediatamente
DROP FUNCTION IF EXISTS public.equipment_regularization_apply(jsonb, text);

-- 5. Criacao do lote: apenas snapshot, sem tocar no Parque
CREATE OR REPLACE FUNCTION public.equipment_regularization_create_batch(
  p_equipment_ids uuid[],
  p_header_city text DEFAULT NULL,
  p_header_state text DEFAULT NULL,
  p_document_date date DEFAULT NULL,
  p_signer_name text DEFAULT NULL,
  p_signer_role text DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_recipient_email text DEFAULT NULL,
  p_pmp_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_eq public.client_equipment;
  v_id uuid;
  v_situation text;
  v_count integer := 0;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN
    RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque';
  END IF;

  IF p_equipment_ids IS NULL OR array_length(p_equipment_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhuma maquina informada para regularizacao';
  END IF;

  INSERT INTO public.equipment_regularization_batches
    (header_city, header_state, document_date, signer_name, signer_role,
     recipient_name, recipient_email, pmp_number, status, notes, created_by)
  VALUES
    (COALESCE(NULLIF(TRIM(p_header_city), ''), 'Regularizacao de Maquinas'),
     COALESCE(NULLIF(TRIM(p_header_state), ''), 'NA'),
     COALESCE(p_document_date, CURRENT_DATE),
     COALESCE(NULLIF(TRIM(p_signer_name), ''), 'Regularizacao de Maquinas'),
     COALESCE(NULLIF(TRIM(p_signer_role), ''), 'Gerente Corporativo de Serviços'),
     NULLIF(TRIM(p_recipient_name), ''),
     NULLIF(TRIM(p_recipient_email), ''),
     NULLIF(TRIM(p_pmp_number), ''),
     'aguardando_envio', NULLIF(TRIM(p_notes), ''), v_uid)
  RETURNING id INTO v_batch_id;

  FOREACH v_id IN ARRAY p_equipment_ids
  LOOP
    SELECT * INTO v_eq FROM public.client_equipment WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Maquina % nao encontrada', v_id;
    END IF;

    v_situation := public.equipment_regularization_situation_norm(v_eq.machine_status);
    IF v_situation IS NULL THEN
      RAISE EXCEPTION 'Maquina % nao esta pendente de regularizacao (situacao: %)', v_id, v_eq.machine_status;
    END IF;

    -- Ja regularizada em lote enviado/concluido
    IF EXISTS (
      SELECT 1 FROM public.equipment_regularization_items i
      JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
      WHERE i.equipment_id = v_id AND b.status IN ('enviado', 'concluido')
    ) THEN
      RAISE EXCEPTION 'A maquina % ja foi regularizada em outro lote', COALESCE(v_eq.serial_chassis, v_id::text);
    END IF;

    -- Ja vinculada a um lote ativo (aguardando envio / erro de envio)
    IF EXISTS (
      SELECT 1 FROM public.equipment_regularization_items i
      JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
      WHERE i.equipment_id = v_id AND b.status IN ('aguardando_envio', 'erro_envio')
    ) THEN
      RAISE EXCEPTION 'A maquina % ja possui uma regularizacao aguardando envio. Utilize o reenvio do lote existente.', COALESCE(v_eq.serial_chassis, v_id::text);
    END IF;

    INSERT INTO public.equipment_regularization_items
      (batch_id, equipment_id, filial_id, dealer_location, serial_chassis,
       client_code, client_name, machine_situation, model, year, pmp_number)
    VALUES
      (v_batch_id, v_eq.id, v_eq.filial_id, v_eq.product_raw, v_eq.serial_chassis,
       v_eq.client_code, v_eq.client_name, v_situation, v_eq.model, v_eq.year,
       NULLIF(TRIM(p_pmp_number), ''));

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('batch_id', v_batch_id, 'total', v_count, 'status', 'aguardando_envio');
END;
$function$;

-- 6. Detalhe do lote (para PDF e tela de envio)
CREATE OR REPLACE FUNCTION public.equipment_regularization_get_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT jsonb_build_object(
    'id', b.id,
    'status', b.status,
    'send_status', b.send_status,
    'send_error', b.send_error,
    'send_attempts', b.send_attempts,
    'recipients', COALESCE(to_jsonb(b.recipients), '[]'::jsonb),
    'email_subject', b.email_subject,
    'email_message', b.email_message,
    'provider_message_id', b.provider_message_id,
    'header_city', b.header_city,
    'header_state', b.header_state,
    'document_date', b.document_date,
    'pmp_number', b.pmp_number,
    'signer_name', b.signer_name,
    'signer_role', b.signer_role,
    'recipient_name', b.recipient_name,
    'recipient_email', b.recipient_email,
    'notes', b.notes,
    'generated_at', b.generated_at,
    'pdf_generated_at', b.pdf_generated_at,
    'sent_at', b.sent_at,
    'created_by', b.created_by,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'equipment_id', i.equipment_id,
        'serial_chassis', i.serial_chassis,
        'model', i.model,
        'year', i.year,
        'machine_situation', i.machine_situation,
        'client_code', i.client_code,
        'client_name', i.client_name,
        'filial_id', i.filial_id,
        'filial_nome', f.nome,
        'dealer_location', i.dealer_location
      ) ORDER BY i.client_name, i.serial_chassis)
      FROM public.equipment_regularization_items i
      LEFT JOIN public.filiais f ON f.id = i.filial_id
      WHERE i.batch_id = b.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.equipment_regularization_batches b
  WHERE b.id = p_batch_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;

  RETURN v_result;
END;
$function$;

-- 7. Marca PDF gerado (nao regulariza)
CREATE OR REPLACE FUNCTION public.equipment_regularization_mark_pdf_generated(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN
    RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque';
  END IF;

  UPDATE public.equipment_regularization_batches
     SET pdf_generated_at = now(),
         pdf_generated_by = auth.uid()
   WHERE id = p_batch_id
     AND status IN ('aguardando_envio', 'erro_envio');
END;
$function$;

-- 8. Erro de envio: mantem tudo pendente
CREATE OR REPLACE FUNCTION public.equipment_regularization_mark_send_error(
  p_batch_id uuid,
  p_error text,
  p_recipients text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch public.equipment_regularization_batches;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN
    RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque';
  END IF;

  SELECT * INTO v_batch FROM public.equipment_regularization_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;

  IF v_batch.status NOT IN ('aguardando_envio', 'erro_envio') THEN
    RAISE EXCEPTION 'Lote nao esta aguardando envio (status atual: %)', v_batch.status;
  END IF;

  UPDATE public.equipment_regularization_batches
     SET status = 'erro_envio',
         send_status = 'erro',
         send_error = LEFT(COALESCE(p_error, 'Falha desconhecida no envio'), 2000),
         send_attempts = send_attempts + 1,
         recipients = COALESCE(p_recipients, recipients)
   WHERE id = p_batch_id;
END;
$function$;

-- 9. Finalizacao: somente auditoria, sem alterar o Parque
CREATE OR REPLACE FUNCTION public.equipment_regularization_finalize(
  p_batch_id uuid,
  p_recipients text[],
  p_provider_message_id text DEFAULT NULL,
  p_email_subject text DEFAULT NULL,
  p_email_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_batch public.equipment_regularization_batches;
  v_items integer;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN
    RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque';
  END IF;

  SELECT * INTO v_batch FROM public.equipment_regularization_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;

  IF NOT (public.can_manage_equipment_regularization() OR v_batch.created_by = v_uid) THEN
    RAISE EXCEPTION 'Somente o autor do lote ou um gestor pode concluir o envio';
  END IF;

  IF v_batch.status NOT IN ('aguardando_envio', 'erro_envio') THEN
    RAISE EXCEPTION 'Lote nao esta aguardando envio (status atual: %)', v_batch.status;
  END IF;

  IF p_recipients IS NULL OR array_length(p_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe os destinatarios confirmados pelo servico de e-mail';
  END IF;

  SELECT count(*) INTO v_items FROM public.equipment_regularization_items WHERE batch_id = p_batch_id;
  IF v_items = 0 THEN
    RAISE EXCEPTION 'Lote sem itens nao pode ser concluido';
  END IF;

  PERFORM set_config('app.reg_finalize', p_batch_id::text, true);

  UPDATE public.equipment_regularization_batches
     SET status = 'concluido',
         send_status = 'enviado',
         send_error = NULL,
         send_attempts = send_attempts + 1,
         recipients = p_recipients,
         provider_message_id = NULLIF(TRIM(p_provider_message_id), ''),
         email_subject = COALESCE(NULLIF(TRIM(p_email_subject), ''), email_subject),
         email_message = COALESCE(NULLIF(TRIM(p_email_message), ''), email_message),
         sent_at = now(),
         sent_by = v_uid,
         applied_at = now(),
         applied_by = v_uid
   WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  UPDATE public.equipment_regularization_items
     SET regularized_by = v_uid,
         regularized_at = now()
   WHERE batch_id = p_batch_id;

  PERFORM set_config('app.reg_finalize', '', true);

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'concluido', 'total', v_items);
END;
$function$;

-- 10. Pendencias: saem apenas com lote enviado/concluido
CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_kpis(p_filial_id uuid DEFAULT NULL::uuid, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL::text, p_situation text DEFAULT NULL::text, p_chassis text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_situation text := public.equipment_regularization_situation_norm(p_situation);
  v_client text := NULLIF(TRIM(p_client), '');
  v_chassis text := NULLIF(TRIM(p_chassis), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;

  RETURN (
    WITH pending AS (
      SELECT ce.filial_id, ce.client_code, ce.client_name, ce.machine_status
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT EXISTS (
          SELECT 1
          FROM public.equipment_regularization_items i
          JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
          WHERE i.equipment_id = ce.id AND b.status IN ('enviado', 'concluido')
        )
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    ),
    regularized AS (
      SELECT DISTINCT ce.id
      FROM public.client_equipment ce
      JOIN public.equipment_regularization_items i ON i.equipment_id = ce.id
      JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
      WHERE b.status IN ('enviado', 'concluido')
        AND ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    )
    SELECT jsonb_build_object(
      'total_pending', (SELECT COUNT(*) FROM pending),
      'total_clients', (SELECT COUNT(DISTINCT (
        COALESCE(NULLIF(TRIM(client_code), ''), UPPER(TRIM(client_name)))
        || '|' || COALESCE(filial_id::text, 'SEM_FILIAL'))) FROM pending),
      'total_regularized', (SELECT COUNT(*) FROM regularized),
      'by_situation', jsonb_build_object(
        'vendida', (SELECT COUNT(*) FROM pending WHERE machine_status = 'vendida'),
        'inativa', (SELECT COUNT(*) FROM pending WHERE machine_status = 'inativa'),
        'sucata',  (SELECT COUNT(*) FROM pending WHERE machine_status = 'sucateada')
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_clients(p_filial_id uuid DEFAULT NULL::uuid, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL::text, p_situation text DEFAULT NULL::text, p_chassis text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_situation text := public.equipment_regularization_situation_norm(p_situation);
  v_client text := NULLIF(TRIM(p_client), '');
  v_chassis text := NULLIF(TRIM(p_chassis), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;

  RETURN (
    WITH pending AS (
      SELECT ce.filial_id, ce.client_code, ce.client_name, ce.machine_status, ce.last_validation_at
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT EXISTS (
          SELECT 1
          FROM public.equipment_regularization_items i
          JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
          WHERE i.equipment_id = ce.id AND b.status IN ('enviado', 'concluido')
        )
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    ),
    grouped AS (
      SELECT
        COALESCE(NULLIF(TRIM(client_code), ''), UPPER(TRIM(client_name)))
          || '|' || COALESCE(filial_id::text, 'SEM_FILIAL') AS client_key,
        MAX(client_code) AS client_code,
        MAX(client_name) AS client_name,
        filial_id,
        MAX(last_validation_at) AS last_validation_at,
        COUNT(*) AS total_pending,
        COUNT(*) FILTER (WHERE machine_status = 'vendida') AS vendida,
        COUNT(*) FILTER (WHERE machine_status = 'inativa') AS inativa,
        COUNT(*) FILTER (WHERE machine_status = 'sucateada') AS sucata
      FROM pending
      GROUP BY 1, filial_id
    ),
    total AS (SELECT COUNT(*) AS total_groups FROM grouped)
    SELECT jsonb_build_object(
      'total_groups', (SELECT total_groups FROM total),
      'page', p_page,
      'page_size', p_page_size,
      'clients', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'client_key', g.client_key,
          'client_code', g.client_code,
          'client_name', g.client_name,
          'filial_id', g.filial_id,
          'filial_nome', f.nome,
          'total_pending', g.total_pending,
          'last_validation_at', g.last_validation_at,
          'by_situation', jsonb_build_object(
            'vendida', g.vendida, 'inativa', g.inativa, 'sucata', g.sucata)
        ) ORDER BY g.total_pending DESC, g.client_name)
        FROM (
          SELECT * FROM grouped
          ORDER BY total_pending DESC, client_name
          LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
        ) g
        LEFT JOIN public.filiais f ON f.id = g.filial_id
      ), '[]'::jsonb)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_machines(p_client_key text, p_filial_id uuid DEFAULT NULL::uuid, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL::text, p_situation text DEFAULT NULL::text, p_chassis text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_situation text := public.equipment_regularization_situation_norm(p_situation);
  v_client text := NULLIF(TRIM(p_client), '');
  v_chassis text := NULLIF(TRIM(p_chassis), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;

  RETURN (
    WITH pending AS (
      SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id,
             ce.model, ce.serial_chassis, ce.year, ce.machine_status,
             ce.last_validation_at, ce.validation_source
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT EXISTS (
          SELECT 1
          FROM public.equipment_regularization_items i
          JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
          WHERE i.equipment_id = ce.id AND b.status IN ('enviado', 'concluido')
        )
        AND (
          COALESCE(NULLIF(TRIM(ce.client_code), ''), UPPER(TRIM(ce.client_name)))
            || '|' || COALESCE(ce.filial_id::text, 'SEM_FILIAL')
        ) = p_client_key
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'equipment_id', id,
      'client_code', client_code,
      'client_name', client_name,
      'filial_id', filial_id,
      'model', model,
      'serial_chassis', serial_chassis,
      'year', year,
      'machine_situation', CASE WHEN machine_status = 'sucateada' THEN 'sucata' ELSE machine_status END,
      'last_validation_at', last_validation_at,
      'validation_source', validation_source
    ) ORDER BY client_name, serial_chassis), '[]'::jsonb)
    FROM pending
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.equipment_regularization_create_batch(uuid[], text, text, date, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_get_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_mark_pdf_generated(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_mark_send_error(uuid, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_finalize(uuid, text[], text, text, text) TO authenticated;