ALTER TABLE public.equipment_regularization_items
  ADD COLUMN IF NOT EXISTS new_situation text,
  ADD COLUMN IF NOT EXISTS destination_client_code text,
  ADD COLUMN IF NOT EXISTS destination_client_name text,
  ADD COLUMN IF NOT EXISTS regularized_by uuid,
  ADD COLUMN IF NOT EXISTS regularized_at timestamptz;

ALTER TABLE public.equipment_regularization_items
  DROP CONSTRAINT IF EXISTS equipment_regularization_items_new_situation_chk;

ALTER TABLE public.equipment_regularization_items
  ADD CONSTRAINT equipment_regularization_items_new_situation_chk
  CHECK (new_situation IS NULL OR new_situation IN ('permanece', 'vendida', 'inativa', 'sucata'));

CREATE OR REPLACE FUNCTION public.equipment_regularization_apply(
  p_items jsonb,
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
  v_item jsonb;
  v_eq public.client_equipment;
  v_new text;
  v_prev text;
  v_dest_code text;
  v_dest_name text;
  v_status text;
  v_transfer boolean;
  v_count integer := 0;
BEGIN
  IF NOT public.can_operate_equipment_regularization() THEN
    RAISE EXCEPTION 'Sem permissao para operar a regularizacao do parque';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhuma maquina informada para regularizacao';
  END IF;

  INSERT INTO public.equipment_regularization_batches
    (header_city, header_state, document_date, signer_name, signer_role, status, notes, created_by)
  VALUES
    ('Regularizacao de Maquinas', 'NA', CURRENT_DATE, 'Regularizacao de Maquinas',
     'Gerente Corporativo de Serviços', 'gerado', p_notes, v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_eq
      FROM public.client_equipment
     WHERE id = (v_item->>'equipment_id')::uuid
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Maquina % nao encontrada', v_item->>'equipment_id';
    END IF;

    v_prev := public.equipment_regularization_situation_norm(v_eq.machine_status);
    IF v_prev IS NULL THEN
      RAISE EXCEPTION 'Maquina % nao esta pendente de regularizacao', v_eq.id;
    END IF;

    v_new := lower(NULLIF(TRIM(v_item->>'new_situation'), ''));
    IF v_new IS NULL OR v_new NOT IN ('permanece', 'vendida', 'inativa', 'sucata') THEN
      RAISE EXCEPTION 'Resultado invalido para a maquina %: %', v_eq.id, v_new;
    END IF;

    v_dest_code := NULLIF(TRIM(v_item->>'destination_client_code'), '');
    v_dest_name := NULLIF(TRIM(v_item->>'destination_client_name'), '');

    -- Cliente destino so e permitido quando o resultado e venda
    IF v_new <> 'vendida' AND (v_dest_code IS NOT NULL OR v_dest_name IS NOT NULL) THEN
      RAISE EXCEPTION 'Cliente destino so pode ser informado quando o resultado e vendida (maquina %)', v_eq.id;
    END IF;

    -- Transferencia exige codigo E nome juntos
    IF (v_dest_code IS NULL) <> (v_dest_name IS NULL) THEN
      RAISE EXCEPTION 'Para transferir a máquina, informe um cliente destino válido. (maquina %)', v_eq.id;
    END IF;

    v_transfer := (v_new = 'vendida') AND v_dest_code IS NOT NULL AND v_dest_name IS NOT NULL;

    -- Efeito no Parque
    v_status := CASE
      WHEN v_new = 'permanece' THEN 'ativa'
      WHEN v_new = 'sucata' THEN 'sucateada'
      WHEN v_new = 'inativa' THEN 'inativa'
      WHEN v_transfer THEN 'ativa'   -- vendida com destino: ativa no parque do novo proprietario
      ELSE 'vendida'                 -- vendida sem destino
    END;

    INSERT INTO public.equipment_regularization_items
      (batch_id, equipment_id, filial_id, serial_chassis, client_code, client_name,
       machine_situation, model, year, notes,
       new_situation, destination_client_code, destination_client_name,
       regularized_by, regularized_at)
    VALUES
      (v_batch_id, v_eq.id, v_eq.filial_id, v_eq.serial_chassis, v_eq.client_code, v_eq.client_name,
       v_prev, v_eq.model, v_eq.year, NULLIF(TRIM(v_item->>'notes'), ''),
       v_new, v_dest_code, v_dest_name, v_uid, now());

    UPDATE public.client_equipment ce
       SET machine_status = v_status,
           client_code = CASE WHEN v_transfer THEN v_dest_code ELSE ce.client_code END,
           client_name = CASE WHEN v_transfer THEN v_dest_name ELSE ce.client_name END,
           previous_client_code = CASE WHEN v_transfer THEN ce.client_code ELSE ce.previous_client_code END,
           previous_client_name = CASE WHEN v_transfer THEN ce.client_name ELSE ce.previous_client_name END,
           transferred_by = CASE WHEN v_transfer THEN v_uid ELSE ce.transferred_by END,
           transferred_at = CASE WHEN v_transfer THEN now() ELSE ce.transferred_at END,
           transfer_history = COALESCE(ce.transfer_history, '[]'::jsonb) || jsonb_build_object(
             'event', 'regularizacao',
             'batch_id', v_batch_id,
             'previous_status', ce.machine_status,
             'new_status', v_status,
             'new_situation', v_new,
             'previous_client_code', ce.client_code,
             'previous_client_name', ce.client_name,
             'destination_client_code', v_dest_code,
             'destination_client_name', v_dest_name,
             'transferred', v_transfer,
             'user_id', v_uid,
             'at', now()
           ),
           updated_at = now()
     WHERE ce.id = v_eq.id;

    v_count := v_count + 1;
  END LOOP;

  PERFORM public.equipment_regularization_confirm_send(v_batch_id);

  RETURN jsonb_build_object('batch_id', v_batch_id, 'total', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.equipment_regularization_apply(jsonb, text) TO authenticated;