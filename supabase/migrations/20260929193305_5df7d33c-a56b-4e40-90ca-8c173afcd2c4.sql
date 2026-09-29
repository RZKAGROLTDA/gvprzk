ALTER TABLE public.equipment_regularization_batches DROP CONSTRAINT equipment_regularization_batches_status_chk;
ALTER TABLE public.equipment_regularization_batches ADD CONSTRAINT equipment_regularization_batches_status_chk CHECK (status = ANY (ARRAY['gerado','aguardando_envio','erro_envio','aguardando_retorno','em_validacao','enviado','concluido','cancelado']));
ALTER TABLE public.equipment_regularization_batches ADD COLUMN IF NOT EXISTS validation_started_at timestamptz, ADD COLUMN IF NOT EXISTS validation_started_by uuid, ADD COLUMN IF NOT EXISTS cancel_reason text, ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.equipment_regularization_items ADD COLUMN IF NOT EXISTS removed_at timestamptz, ADD COLUMN IF NOT EXISTS removed_by uuid, ADD COLUMN IF NOT EXISTS removed_reason text;
CREATE INDEX IF NOT EXISTS idx_eri_equipment_active ON public.equipment_regularization_items (equipment_id) WHERE removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.equipment_regularization_open_statuses() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$ SELECT ARRAY['gerado','aguardando_envio','erro_envio','aguardando_retorno','em_validacao']::text[] $$;
CREATE OR REPLACE FUNCTION public.equipment_regularization_is_locked(p_equipment_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT EXISTS (SELECT 1 FROM public.equipment_regularization_items i JOIN public.equipment_regularization_batches b ON b.id = i.batch_id WHERE i.equipment_id = p_equipment_id AND i.removed_at IS NULL AND (b.status = ANY(public.equipment_regularization_open_statuses()) OR b.status IN ('enviado','concluido'))) $$;
CREATE OR REPLACE FUNCTION public.equipment_regularization_is_regularized(p_equipment_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT EXISTS (SELECT 1 FROM public.equipment_regularization_items i JOIN public.equipment_regularization_batches b ON b.id = i.batch_id WHERE i.equipment_id = p_equipment_id AND i.removed_at IS NULL AND b.status IN ('enviado','concluido')) $$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'created_by e imutavel apos a criacao do lote'; END IF;
    IF OLD.status IN ('enviado', 'concluido', 'cancelado') THEN RAISE EXCEPTION 'Lote % nao pode ser alterado', OLD.status; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status IN ('aguardando_envio','erro_envio') AND NEW.status = 'aguardando_retorno' THEN
        IF current_setting('app.reg_send', true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Registro de envio somente via equipment_regularization_register_send()'; END IF;
        IF NEW.sent_by IS NULL OR NEW.sent_at IS NULL THEN RAISE EXCEPTION 'Envio exige sent_by e sent_at'; END IF;
      ELSIF OLD.status = 'aguardando_retorno' AND NEW.status = 'em_validacao' THEN
        IF current_setting('app.reg_validate', true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Inicio da validacao somente via equipment_regularization_start_validation()'; END IF;
      ELSIF OLD.status = 'em_validacao' AND NEW.status = 'concluido' THEN
        IF current_setting('app.reg_finalize', true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Conclusao somente via equipment_regularization_conclude()'; END IF;
      ELSIF OLD.status = 'aguardando_envio' AND NEW.status = 'erro_envio' THEN NULL;
      ELSIF OLD.status = 'erro_envio' AND NEW.status = 'aguardando_envio' THEN NULL;
      ELSIF OLD.status = ANY(public.equipment_regularization_open_statuses()) AND NEW.status = 'cancelado' THEN
        IF NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR NULLIF(TRIM(NEW.cancel_reason), '') IS NULL THEN RAISE EXCEPTION 'Cancelamento exige motivo, usuario e data'; END IF;
      ELSE RAISE EXCEPTION 'Transicao de status invalida: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Lotes de regularizacao nao podem ser excluidos (use o cancelamento)'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_items_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_status text; v_batch uuid;
BEGIN
  v_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  SELECT status INTO v_status FROM public.equipment_regularization_batches WHERE id = v_batch;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Lote inexistente'; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Itens do lote nao podem ser excluidos (use a retirada da maquina)'; END IF;
  IF NOT (v_status = ANY(public.equipment_regularization_open_statuses())) AND current_setting('app.reg_finalize', true) IS DISTINCT FROM v_batch::text THEN
    RAISE EXCEPTION 'Itens so podem ser alterados enquanto o lote esta aberto (status atual: %)', v_status; END IF;
  IF TG_OP = 'UPDATE' AND OLD.removed_at IS NOT NULL AND NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN RAISE EXCEPTION 'Maquina ja retirada do lote'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL AND (NEW.removed_by IS NULL OR NULLIF(TRIM(NEW.removed_reason), '') IS NULL) THEN RAISE EXCEPTION 'Retirada exige motivo, usuario e data'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_lock_batch(p_batch_id uuid, p_filial_id uuid, p_action text) RETURNS public.equipment_regularization_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_batch public.equipment_regularization_batches;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM public.equipment_regularization_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote nao encontrado'; END IF;
  IF NOT (public.can_manage_equipment_regularization() OR v_batch.created_by = auth.uid()) THEN RAISE EXCEPTION 'Somente o autor do lote ou um gestor pode %', p_action USING ERRCODE = '42501'; END IF;
  PERFORM public.equipment_regularization_assert_batch_filial(p_batch_id, p_filial_id);
  RETURN v_batch;
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_history_entry(p_event text, p_details jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT jsonb_build_array(jsonb_build_object('event', p_event, 'at', now(), 'by', auth.uid()) || COALESCE(p_details, '{}'::jsonb)) $$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_register_send(p_batch_id uuid, p_recipients text[], p_email_subject text DEFAULT NULL, p_email_message text DEFAULT NULL, p_filial_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_batch public.equipment_regularization_batches; v_recipients text[]; v_active integer; v_resend boolean;
BEGIN
  v_batch := public.equipment_regularization_lock_batch(p_batch_id, p_filial_id, 'registrar o envio');
  IF v_batch.status NOT IN ('aguardando_envio','erro_envio','aguardando_retorno') THEN RAISE EXCEPTION 'Envio so pode ser registrado em lote aguardando envio ou aguardando retorno (status atual: %)', v_batch.status; END IF;
  SELECT array_agg(DISTINCT lower(trim(r))) INTO v_recipients FROM unnest(COALESCE(p_recipients, ARRAY[]::text[])) r WHERE NULLIF(trim(r), '') IS NOT NULL;
  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN RAISE EXCEPTION 'Informe ao menos um destinatario do envio'; END IF;
  SELECT count(*) INTO v_active FROM public.equipment_regularization_items WHERE batch_id = p_batch_id AND removed_at IS NULL;
  IF v_active = 0 THEN RAISE EXCEPTION 'Lote sem maquinas ativas nao pode ser enviado; cancele o lote'; END IF;
  v_resend := v_batch.status = 'aguardando_retorno';
  PERFORM set_config('app.reg_send', p_batch_id::text, true);
  UPDATE public.equipment_regularization_batches SET status = 'aguardando_retorno', send_status = 'enviado', send_error = NULL, send_attempts = send_attempts + 1, recipients = v_recipients,
    email_subject = COALESCE(NULLIF(TRIM(p_email_subject), ''), email_subject), email_message = COALESCE(NULLIF(TRIM(p_email_message), ''), email_message),
    sent_at = now(), sent_by = auth.uid(),
    history = history || public.equipment_regularization_history_entry(CASE WHEN v_resend THEN 'reenvio' ELSE 'envio' END, jsonb_build_object('recipients', to_jsonb(v_recipients), 'machines', v_active))
   WHERE id = p_batch_id RETURNING * INTO v_batch;
  PERFORM set_config('app.reg_send', '', true);
  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', v_batch.status, 'resend', v_resend);
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_start_validation(p_batch_id uuid, p_notes text DEFAULT NULL, p_filial_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_batch public.equipment_regularization_batches;
BEGIN
  v_batch := public.equipment_regularization_lock_batch(p_batch_id, p_filial_id, 'iniciar a validacao');
  IF v_batch.status <> 'aguardando_retorno' THEN RAISE EXCEPTION 'Validacao so pode ser iniciada em lote aguardando retorno (status atual: %)', v_batch.status; END IF;
  PERFORM set_config('app.reg_validate', p_batch_id::text, true);
  UPDATE public.equipment_regularization_batches SET status = 'em_validacao', validation_started_at = now(), validation_started_by = auth.uid(),
    history = history || public.equipment_regularization_history_entry('inicio_validacao', jsonb_build_object('notes', NULLIF(TRIM(p_notes), '')))
   WHERE id = p_batch_id RETURNING * INTO v_batch;
  PERFORM set_config('app.reg_validate', '', true);
  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', v_batch.status);
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_conclude(p_batch_id uuid, p_notes text DEFAULT NULL, p_filial_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_batch public.equipment_regularization_batches; v_active integer;
BEGIN
  v_batch := public.equipment_regularization_lock_batch(p_batch_id, p_filial_id, 'concluir o lote');
  IF v_batch.status <> 'em_validacao' THEN RAISE EXCEPTION 'Somente lotes em validacao podem ser concluidos (status atual: %)', v_batch.status; END IF;
  SELECT count(*) INTO v_active FROM public.equipment_regularization_items WHERE batch_id = p_batch_id AND removed_at IS NULL;
  IF v_active = 0 THEN RAISE EXCEPTION 'Todas as maquinas foram retiradas: o lote nao pode ser concluido e deve ser cancelado'; END IF;
  PERFORM set_config('app.reg_finalize', p_batch_id::text, true);
  UPDATE public.equipment_regularization_items SET regularized_by = v_uid, regularized_at = now() WHERE batch_id = p_batch_id AND removed_at IS NULL;
  UPDATE public.equipment_regularization_batches SET status = 'concluido', applied_at = now(), applied_by = v_uid,
    history = history || public.equipment_regularization_history_entry('conclusao', jsonb_build_object('machines', v_active, 'notes', NULLIF(TRIM(p_notes), '')))
   WHERE id = p_batch_id RETURNING * INTO v_batch;
  PERFORM set_config('app.reg_finalize', '', true);
  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'concluido', 'total', v_active);
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_finalize(p_batch_id uuid, p_recipients text[], p_provider_message_id text DEFAULT NULL::text, p_email_subject text DEFAULT NULL::text, p_email_message text DEFAULT NULL::text, p_filial_id uuid DEFAULT NULL::uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RAISE EXCEPTION 'Fluxo antigo desativado: use registrar envio, iniciar validacao e concluir'; END; $$;
CREATE OR REPLACE FUNCTION public.equipment_regularization_confirm_send(p_batch_id uuid, p_filial_id uuid DEFAULT NULL::uuid) RETURNS equipment_regularization_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RAISE EXCEPTION 'Fluxo antigo desativado: use equipment_regularization_register_send()'; END; $$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_cancel(p_batch_id uuid, p_reason text DEFAULT NULL::text, p_filial_id uuid DEFAULT NULL::uuid) RETURNS equipment_regularization_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_batch public.equipment_regularization_batches;
BEGIN
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
  v_batch := public.equipment_regularization_lock_batch(p_batch_id, p_filial_id, 'cancelar o lote');
  IF NOT (v_batch.status = ANY(public.equipment_regularization_open_statuses())) THEN RAISE EXCEPTION 'Somente lotes abertos podem ser cancelados (status atual: %)', v_batch.status; END IF;
  UPDATE public.equipment_regularization_batches SET status = 'cancelado', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = TRIM(p_reason),
    history = history || public.equipment_regularization_history_entry('cancelamento', jsonb_build_object('reason', TRIM(p_reason), 'from_status', v_batch.status))
   WHERE id = p_batch_id RETURNING * INTO v_batch;
  RETURN v_batch;
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_remove_item(p_item_id uuid, p_reason text, p_filial_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_item public.equipment_regularization_items; v_batch public.equipment_regularization_batches; v_remaining integer;
BEGIN
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da retirada'; END IF;
  SELECT * INTO v_item FROM public.equipment_regularization_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item nao encontrado'; END IF;
  v_batch := public.equipment_regularization_lock_batch(v_item.batch_id, p_filial_id, 'retirar maquinas do lote');
  IF NOT (v_batch.status = ANY(public.equipment_regularization_open_statuses())) THEN RAISE EXCEPTION 'Maquinas so podem ser retiradas de lote aberto (status atual: %)', v_batch.status; END IF;
  IF v_item.removed_at IS NOT NULL THEN RAISE EXCEPTION 'Maquina ja retirada deste lote'; END IF;
  UPDATE public.equipment_regularization_items SET removed_at = now(), removed_by = auth.uid(), removed_reason = TRIM(p_reason) WHERE id = p_item_id;
  SELECT count(*) INTO v_remaining FROM public.equipment_regularization_items WHERE batch_id = v_item.batch_id AND removed_at IS NULL;
  UPDATE public.equipment_regularization_batches SET history = history || public.equipment_regularization_history_entry('retirada_maquina', jsonb_build_object('item_id', p_item_id, 'equipment_id', v_item.equipment_id, 'serial_chassis', v_item.serial_chassis, 'reason', TRIM(p_reason))) WHERE id = v_item.batch_id;
  RETURN jsonb_build_object('batch_id', v_item.batch_id, 'remaining', v_remaining);
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_mark_pdf_generated(p_batch_id uuid, p_filial_id uuid DEFAULT NULL::uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque'; END IF;
  IF EXISTS (SELECT 1 FROM public.equipment_regularization_batches WHERE id = p_batch_id) THEN
    PERFORM public.equipment_regularization_assert_batch_filial(p_batch_id, p_filial_id);
  END IF;
  UPDATE public.equipment_regularization_batches SET pdf_generated_at = now(), pdf_generated_by = auth.uid()
   WHERE id = p_batch_id AND status = ANY(public.equipment_regularization_open_statuses());
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_create_batch(p_equipment_ids uuid[], p_header_city text DEFAULT NULL::text, p_header_state text DEFAULT NULL::text, p_document_date date DEFAULT NULL::date, p_signer_name text DEFAULT NULL::text, p_signer_role text DEFAULT NULL::text, p_recipient_name text DEFAULT NULL::text, p_recipient_email text DEFAULT NULL::text, p_pmp_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_filial_id uuid DEFAULT NULL::uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_batch_id uuid; v_eq public.client_equipment; v_id uuid; v_situation text;
  v_count integer := 0; v_filiais uuid[]; v_first_filial uuid; v_first_set boolean := false;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque'; END IF;
  IF p_equipment_ids IS NULL OR array_length(p_equipment_ids, 1) IS NULL THEN RAISE EXCEPTION 'Nenhuma maquina informada para regularizacao'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);
  PERFORM 1 FROM public.client_equipment WHERE id = ANY(p_equipment_ids) ORDER BY id FOR UPDATE;
  FOREACH v_id IN ARRAY p_equipment_ids LOOP
    SELECT * INTO v_eq FROM public.client_equipment WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Maquina % nao encontrada', v_id; END IF;
    v_situation := public.equipment_regularization_situation_norm(v_eq.machine_status);
    IF v_situation IS NULL THEN RAISE EXCEPTION 'Maquina % nao esta pendente de regularizacao (situacao: %)', v_id, v_eq.machine_status; END IF;
    IF cardinality(v_filiais) > 0 THEN
      IF v_eq.filial_id IS NULL THEN RAISE EXCEPTION 'Maquina % sem filial cadastrada nao pode entrar em lote na filial ativa', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
      IF NOT (v_eq.filial_id = ANY(v_filiais)) THEN RAISE EXCEPTION 'Maquina % pertence a outra filial e nao pode entrar neste lote', COALESCE(v_eq.serial_chassis, v_id::text) USING ERRCODE = '42501'; END IF;
    END IF;
    IF NOT v_first_set THEN v_first_filial := v_eq.filial_id; v_first_set := true;
    ELSIF v_eq.filial_id IS DISTINCT FROM v_first_filial THEN RAISE EXCEPTION 'Lote nao pode conter maquinas de filiais diferentes' USING ERRCODE = '42501';
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
    v_situation := public.equipment_regularization_situation_norm(v_eq.machine_status);
    INSERT INTO public.equipment_regularization_items (batch_id, equipment_id, filial_id, dealer_location, serial_chassis, client_code, client_name, machine_situation, model, year, pmp_number)
    VALUES (v_batch_id, v_eq.id, v_eq.filial_id, v_eq.product_raw, v_eq.serial_chassis, v_eq.client_code, v_eq.client_name, v_situation, v_eq.model, v_eq.year, NULLIF(TRIM(p_pmp_number), ''));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('batch_id', v_batch_id, 'total', v_count, 'status', 'aguardando_envio');
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_get_batch(p_batch_id uuid, p_filial_id uuid DEFAULT NULL::uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.equipment_regularization_batches WHERE id = p_batch_id) THEN RAISE EXCEPTION 'Lote nao encontrado'; END IF;
  PERFORM public.equipment_regularization_assert_batch_filial(p_batch_id, p_filial_id);
  SELECT jsonb_build_object(
    'id', b.id, 'status', b.status, 'send_status', b.send_status, 'send_error', b.send_error, 'send_attempts', b.send_attempts,
    'recipients', COALESCE(to_jsonb(b.recipients), '[]'::jsonb), 'email_subject', b.email_subject, 'email_message', b.email_message,
    'provider_message_id', b.provider_message_id, 'header_city', b.header_city, 'header_state', b.header_state, 'document_date', b.document_date,
    'pmp_number', b.pmp_number, 'signer_name', b.signer_name, 'signer_role', b.signer_role, 'recipient_name', b.recipient_name,
    'recipient_email', b.recipient_email, 'notes', b.notes, 'generated_at', b.generated_at, 'created_at', b.created_at,
    'pdf_generated_at', b.pdf_generated_at, 'sent_at', b.sent_at,
    'sent_by_name', (SELECT p.name FROM public.profiles p WHERE p.user_id = b.sent_by LIMIT 1),
    'validation_started_at', b.validation_started_at, 'applied_at', b.applied_at, 'cancelled_at', b.cancelled_at, 'cancel_reason', b.cancel_reason,
    'created_by', b.created_by, 'created_by_name', (SELECT p.name FROM public.profiles p WHERE p.user_id = b.created_by LIMIT 1),
    'history', COALESCE((SELECT jsonb_agg(h || jsonb_build_object('by_name', (SELECT p.name FROM public.profiles p WHERE p.user_id::text = h->>'by' LIMIT 1)) ORDER BY ord)
      FROM jsonb_array_elements(b.history) WITH ORDINALITY AS x(h, ord)), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'equipment_id', i.equipment_id, 'serial_chassis', i.serial_chassis,
        'model', i.model, 'year', i.year, 'machine_situation', i.machine_situation, 'client_code', i.client_code, 'client_name', i.client_name,
        'filial_id', i.filial_id, 'filial_nome', f.nome, 'dealer_location', i.dealer_location, 'regularized_at', i.regularized_at
      ) ORDER BY i.client_name, i.serial_chassis)
      FROM public.equipment_regularization_items i LEFT JOIN public.filiais f ON f.id = i.filial_id
      WHERE i.batch_id = b.id AND i.removed_at IS NULL), '[]'::jsonb),
    'removed_items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'equipment_id', i.equipment_id, 'serial_chassis', i.serial_chassis,
        'model', i.model, 'year', i.year, 'machine_situation', i.machine_situation, 'client_code', i.client_code, 'client_name', i.client_name,
        'removed_at', i.removed_at, 'removed_reason', i.removed_reason,
        'removed_by_name', (SELECT p.name FROM public.profiles p WHERE p.user_id = i.removed_by LIMIT 1)
      ) ORDER BY i.removed_at)
      FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND i.removed_at IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.equipment_regularization_batches b WHERE b.id = p_batch_id;
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_list_batches(p_stage text, p_filial_id uuid DEFAULT NULL, p_client text DEFAULT NULL, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_filiais uuid[]; v_client text := NULLIF(TRIM(p_client), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);
  RETURN (
    WITH scoped AS (
      SELECT b.id, b.status, b.created_at, b.pdf_generated_at, b.sent_at, b.recipients, b.send_attempts, b.validation_started_at,
        b.applied_at, b.cancelled_at, b.cancel_reason, b.created_by,
        CASE WHEN b.status IN ('aguardando_envio','erro_envio','gerado') THEN 'aguardando_envio'
             WHEN b.status IN ('concluido','enviado') THEN 'regularizados' ELSE b.status END AS stage,
        (SELECT min(i.filial_id::text)::uuid FROM public.equipment_regularization_items i WHERE i.batch_id = b.id) AS filial_id,
        (SELECT count(*) FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND i.removed_at IS NULL) AS active_items,
        (SELECT count(*) FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND i.removed_at IS NOT NULL) AS removed_items,
        (SELECT string_agg(DISTINCT COALESCE(i.client_name, '—'), ' · ') FROM public.equipment_regularization_items i WHERE i.batch_id = b.id) AS clients,
        (SELECT string_agg(DISTINCT COALESCE(i.client_code, '—'), ' · ') FROM public.equipment_regularization_items i WHERE i.batch_id = b.id) AS client_codes
      FROM public.equipment_regularization_batches b
      WHERE (cardinality(v_filiais) = 0 OR (
          EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id)
          AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND (i.filial_id IS NULL OR NOT (i.filial_id = ANY(v_filiais))))))
        AND (p_filial_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id AND i.filial_id IS DISTINCT FROM p_filial_id))
        AND (v_client IS NULL OR EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.batch_id = b.id
          AND (unaccent(i.client_name) ILIKE '%' || unaccent(v_client) || '%' OR LTRIM(i.client_code, '0') = LTRIM(v_client, '0') OR i.serial_chassis ILIKE '%' || v_client || '%')))
    ),
    filtered AS (SELECT * FROM scoped WHERE stage = p_stage)
    SELECT jsonb_build_object(
      'counts', (SELECT COALESCE(jsonb_object_agg(stage, n), '{}'::jsonb) FROM (SELECT stage, count(*) n FROM scoped GROUP BY stage) c),
      'total', (SELECT count(*) FROM filtered),
      'batches', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'status', s.status, 'stage', s.stage, 'created_at', s.created_at, 'pdf_generated_at', s.pdf_generated_at,
          'sent_at', s.sent_at, 'recipients', COALESCE(to_jsonb(s.recipients), '[]'::jsonb), 'send_attempts', s.send_attempts,
          'validation_started_at', s.validation_started_at, 'applied_at', s.applied_at, 'cancelled_at', s.cancelled_at, 'cancel_reason', s.cancel_reason,
          'filial_id', s.filial_id, 'filial_nome', f.nome, 'active_items', s.active_items, 'removed_items', s.removed_items,
          'clients', s.clients, 'client_codes', s.client_codes,
          'created_by_name', (SELECT p.name FROM public.profiles p WHERE p.user_id = s.created_by LIMIT 1)
        ) ORDER BY COALESCE(s.applied_at, s.cancelled_at, s.validation_started_at, s.sent_at, s.created_at) DESC)
        FROM (SELECT * FROM filtered ORDER BY COALESCE(applied_at, cancelled_at, validation_started_at, sent_at, created_at) DESC
              LIMIT p_page_size OFFSET (GREATEST(p_page,1) - 1) * p_page_size) s
        LEFT JOIN public.filiais f ON f.id = s.filial_id), '[]'::jsonb)
    )
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_clients(p_filial_id uuid DEFAULT NULL::uuid, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL::text, p_situation text DEFAULT NULL::text, p_chassis text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_situation text := public.equipment_regularization_situation_norm(p_situation); v_client text := NULLIF(TRIM(p_client), ''); v_chassis text := NULLIF(TRIM(p_chassis), ''); v_filiais uuid[];
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);
  RETURN (
    WITH pending AS (
      SELECT ce.filial_id, ce.client_code, ce.client_name, ce.machine_status, ce.last_validation_at
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (cardinality(v_filiais) = 0 OR ce.filial_id = ANY(v_filiais))
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
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
          'by_situation', jsonb_build_object('vendida', g.vendida, 'inativa', g.inativa, 'sucata', g.sucata)) ORDER BY g.total_pending DESC, g.client_name)
        FROM (SELECT * FROM grouped ORDER BY total_pending DESC, client_name LIMIT p_page_size OFFSET (p_page - 1) * p_page_size) g
        LEFT JOIN public.filiais f ON f.id = g.filial_id), '[]'::jsonb))
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_kpis(p_filial_id uuid DEFAULT NULL::uuid, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL::text, p_situation text DEFAULT NULL::text, p_chassis text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_situation text := public.equipment_regularization_situation_norm(p_situation); v_client text := NULLIF(TRIM(p_client), ''); v_chassis text := NULLIF(TRIM(p_chassis), ''); v_filiais uuid[];
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);
  RETURN (
    WITH base AS (
      SELECT ce.id, ce.filial_id, ce.client_code, ce.client_name, ce.machine_status
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND (cardinality(v_filiais) = 0 OR ce.filial_id = ANY(v_filiais))
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
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
END; $function$;

CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_machines(p_client_key text, p_filial_id uuid DEFAULT NULL::uuid, p_without_filial boolean DEFAULT false, p_client text DEFAULT NULL::text, p_situation text DEFAULT NULL::text, p_chassis text DEFAULT NULL::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_situation text := public.equipment_regularization_situation_norm(p_situation); v_client text := NULLIF(TRIM(p_client), ''); v_chassis text := NULLIF(TRIM(p_chassis), ''); v_filiais uuid[];
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);
  RETURN (
    WITH pending AS (
      SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id, ce.model, ce.serial_chassis, ce.year, ce.machine_status, ce.last_validation_at, ce.validation_source
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT public.equipment_regularization_is_locked(ce.id)
        AND (COALESCE(NULLIF(TRIM(ce.client_code), ''), UPPER(TRIM(ce.client_name))) || '|' || COALESCE(ce.filial_id::text, 'SEM_FILIAL')) = p_client_key
        AND (cardinality(v_filiais) = 0 OR ce.filial_id = ANY(v_filiais))
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%' OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('equipment_id', id, 'client_code', client_code, 'client_name', client_name, 'filial_id', filial_id,
      'model', model, 'serial_chassis', serial_chassis, 'year', year,
      'machine_situation', CASE WHEN machine_status = 'sucateada' THEN 'sucata' ELSE machine_status END,
      'last_validation_at', last_validation_at, 'validation_source', validation_source) ORDER BY client_name, serial_chassis), '[]'::jsonb)
    FROM pending
  );
END; $function$;

REVOKE ALL ON FUNCTION public.equipment_regularization_lock_batch(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_register_send(uuid, text[], text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_start_validation(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_conclude(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_remove_item(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_list_batches(text, uuid, text, integer, integer) TO authenticated;