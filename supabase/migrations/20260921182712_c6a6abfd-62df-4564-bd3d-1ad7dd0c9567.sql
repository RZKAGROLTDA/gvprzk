
DROP FUNCTION IF EXISTS public.pops_complete_machine(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.pops_can_write_machine(uuid);

CREATE OR REPLACE FUNCTION public.pops_complete_machine(
  p_machine_id uuid, p_service_id uuid, p_os_number text, p_filial_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_global boolean := public.pops_is_manager();
  v_allowed uuid[];
  v_can    boolean := false;
  v_os     text;
  m        record;
  v_name   text;
  v_svc    text;
BEGIN
  IF v_uid IS NULL OR v_kind = 'none' THEN
    RAISE EXCEPTION 'Acesso negado ao POPS' USING ERRCODE = '42501';
  END IF;

  v_os := btrim(coalesce(p_os_number, ''));
  IF v_os = '' THEN RAISE EXCEPTION 'Informe o numero da OS'; END IF;
  IF char_length(v_os) > 40 THEN RAISE EXCEPTION 'Numero da OS excede 40 caracteres'; END IF;
  IF v_os !~ '^[A-Za-z0-9/._-]+$' THEN
    RAISE EXCEPTION 'Numero da OS invalido: use letras, numeros, barra, ponto ou hifen';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pops_services s WHERE s.id = p_service_id AND s.active) THEN
    RAISE EXCEPTION 'Servico invalido ou inativo';
  END IF;

  SELECT m2.* INTO m FROM public.pops_machines m2 WHERE m2.id = p_machine_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Maquina POPS nao encontrada'; END IF;
  IF NOT m.active THEN RAISE EXCEPTION 'Maquina inativa no POPS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pops_programs pr WHERE pr.id = m.program_id AND pr.active) THEN
    RAISE EXCEPTION 'Programa POPS inativo';
  END IF;

  -- Autorizacao unica: Filial Ativa + filiais autorizadas (sem logica paralela de multi-filial)
  v_allowed := public.effective_filial_ids(p_filial_id);

  IF v_global THEN
    v_can := (p_filial_id IS NULL)
             OR (m.pops_filial_id IS NOT NULL AND m.pops_filial_id = ANY(v_allowed));
  ELSIF public.has_role(v_uid,'rac') OR public.has_role(v_uid,'cpa')
     OR public.has_role(v_uid,'csa') OR public.has_role(v_uid,'supervisor') THEN
    v_can := m.pops_filial_id IS NOT NULL AND m.pops_filial_id = ANY(v_allowed);
  END IF;

  IF NOT v_can THEN
    RAISE EXCEPTION 'Sem permissao para concluir esta maquina' USING ERRCODE = '42501';
  END IF;

  IF m.status = 'servicada' THEN
    SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = m.executed_by;
    RAISE EXCEPTION 'Maquina ja concluida (OS %, por %, em %)',
      m.os_number, coalesce(v_name, 'outro usuario'),
      to_char(m.executed_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pops_machines o
     WHERE o.program_id = m.program_id AND o.id <> m.id AND o.os_number IS NOT NULL
       AND upper(btrim(o.os_number)) = upper(v_os)
  ) THEN
    RAISE EXCEPTION 'A OS % ja esta registrada em outra maquina deste programa', v_os;
  END IF;

  BEGIN
    UPDATE public.pops_machines
       SET final_service_id = p_service_id, os_number = v_os, executed_by = v_uid,
           executed_at = now(), status = 'servicada', last_activity_at = now()
     WHERE id = m.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A OS % ja esta registrada em outra maquina deste programa', v_os;
  END;

  SELECT s.name INTO v_svc FROM public.pops_services s WHERE s.id = p_service_id;
  SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = v_uid;

  RETURN jsonb_build_object('pops_machine_id', m.id, 'status', 'servicada',
    'final_service_id', p_service_id, 'final_service_name', v_svc, 'os_number', v_os,
    'executed_by', v_uid, 'executed_by_name', v_name, 'executed_at', now());
END $function$;

REVOKE ALL ON FUNCTION public.pops_complete_machine(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pops_complete_machine(uuid, uuid, text, uuid) TO authenticated;
