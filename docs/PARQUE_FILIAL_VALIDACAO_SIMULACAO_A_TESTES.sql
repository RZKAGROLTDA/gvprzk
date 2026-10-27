-- SIMULACAO A - usuarios reais (somente testes). NAO e migracao definitiva.
-- O bloco inteiro roda numa unica transacao e termina SEMPRE com RAISE EXCEPTION,
-- portanto tudo e desfeito (rollback integral). Nao ha COMMIT.
-- __FILE__ e substituido pelo conteudo exato de docs/PARQUE_FILIAL_VALIDACAO_ETAPA1.sql
-- (SHA-256 5d3b63a0b64c2bf0f648d6a0c476ae1104cb78c212d877549e6217ee06ce85f0, conferido abaixo).
DO $simA$
DECLARE
  v_file text := $file$__FILE__$file$;
  v_sha text;
  v_users jsonb := '[
    {"perfil":"Admin","uid":"b6543a7f-3b83-42dc-aa69-930dcb56b21d","cargo":"admin","n":"global"},
    {"perfil":"Gerente","uid":"adaf99ba-128e-493c-8e03-a4e64748f494","cargo":"manager","n":"global"},
    {"perfil":"Supervisor 1 filial","uid":"6a374349-d37c-4b28-922a-5d9e60848fc4","cargo":"supervisor","n":"1"},
    {"perfil":"Supervisor varias filiais","uid":"5f76bc71-5e7a-49f3-b567-b79de6e280fc","cargo":"supervisor","n":"varias"},
    {"perfil":"RAC","uid":"d6a4f143-4444-46ee-99c8-08d01f1ef66b","cargo":"rac","n":"1"},
    {"perfil":"CSA","uid":"5fe47adb-aa02-4f0c-847a-d7070b9486f7","cargo":"csa","n":"1"}
  ]'::jsonb;
  u jsonb;
  v_uid uuid; v_perfil text; v_global boolean; v_allowed uuid[]; v_f uuid; v_e uuid; v_x uuid; v_bad uuid;
  v_used uuid[] := '{}'; v_m uuid;
  v_pre jsonb := '{}'; v_val jsonb;
  v_fp_before text; v_fp_after text;
  v_lotes_b bigint; v_itens_b bigint; v_hist_b bigint; v_lotes_a bigint; v_itens_a bigint;
  v_state text; v_ok boolean; v_rows int;
  v_vf uuid; v_src text; v_fil uuid; v_lva_before timestamptz; v_lva timestamptz;
  v_h record; v_rep text := ''; v_line text; v_nt int := 0; v_cargos text; v_fnomes text;
BEGIN
  v_sha := encode(sha256(convert_to(v_file, 'UTF8')), 'hex');
  IF v_sha <> '5d3b63a0b64c2bf0f648d6a0c476ae1104cb78c212d877549e6217ee06ce85f0' THEN
    RAISE EXCEPTION 'FALHA: SHA divergente %', v_sha;
  END IF;

  -- Fotografia antes: filial cadastral de cada maquina, lotes, itens
  SELECT md5(string_agg(id::text || ':' || COALESCE(filial_id::text, '-'), ',' ORDER BY id)) INTO v_fp_before FROM public.client_equipment;
  SELECT count(*) INTO v_lotes_b FROM public.equipment_regularization_batches;
  SELECT count(*) INTO v_itens_b FROM public.equipment_regularization_items;

  -- Referencia das telas por usuario ANTES da migracao
  FOR u IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_uid := (u->>'uid')::uuid;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SELECT p.filial_id INTO v_f FROM public.profiles p WHERE p.user_id = v_uid;
    SELECT jsonb_build_object(
      'kpi', (SELECT to_jsonb(k) FROM public.get_equipment_park_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false) k),
      'val', (SELECT count(*) || '/' || COALESCE(sum(validated_count), 0) FROM public.get_equipment_validators(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)),
      'reg', public.equipment_regularization_pending_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)
    ) INTO v_val;
    v_pre := v_pre || jsonb_build_object(u->>'uid', v_val);
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Migracao exata (dentro da mesma transacao)
  EXECUTE v_file;
  SELECT count(*) INTO v_hist_b FROM public.client_equipment_validation_filial_history;

  FOR u IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_uid := (u->>'uid')::uuid; v_perfil := u->>'perfil';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_global := public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager');
    v_allowed := public.get_user_filial_ids_internal(v_uid);
    SELECT p.filial_id INTO v_f FROM public.profiles p WHERE p.user_id = v_uid;
    v_e := NULL; v_x := NULL;
    SELECT x INTO v_e FROM unnest(v_allowed) x WHERE x <> v_f ORDER BY x LIMIT 1;
    SELECT f.id INTO v_x FROM public.filiais f WHERE NOT (f.id = ANY(v_allowed)) ORDER BY f.id LIMIT 1;
    SELECT string_agg(role::text, ',' ORDER BY role) INTO v_cargos FROM public.user_roles WHERE user_id = v_uid;
    SELECT string_agg(f.nome, ', ' ORDER BY f.nome) INTO v_fnomes FROM public.filiais f WHERE f.id = ANY(v_allowed);

    -- Confirmacao do cargo e das filiais autorizadas no banco
    IF NOT public.has_role(v_uid, (u->>'cargo')::public.app_role)
       OR (u->>'n' = 'global' AND NOT v_global)
       OR (u->>'n' = '1' AND (v_global OR cardinality(v_allowed) <> 1))
       OR (u->>'n' = 'varias' AND (v_global OR cardinality(v_allowed) < 2)) THEN
      RAISE EXCEPTION 'FALHA [%] perfil divergente: cargos=% filiais=%', v_perfil, v_cargos, v_fnomes;
    END IF;

    -- Filial invalida do teste B: global -> inexistente; restrito -> existente nao autorizada
    IF v_global THEN
      v_bad := gen_random_uuid();
      IF EXISTS (SELECT 1 FROM public.filiais WHERE id = v_bad) THEN RAISE EXCEPTION 'FALHA: uuid de teste existe'; END IF;
    ELSE
      v_bad := v_x;
    END IF;

    v_line := format(E'\n[%s] %s | cargos=%s | global=%s | filiais autorizadas (%s)=%s',
                     v_perfil, v_uid, v_cargos, v_global, cardinality(v_allowed), v_fnomes);

    -- R0: telas atuais iguais apos a migracao
    SELECT jsonb_build_object(
      'kpi', (SELECT to_jsonb(k) FROM public.get_equipment_park_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false) k),
      'val', (SELECT count(*) || '/' || COALESCE(sum(validated_count), 0) FROM public.get_equipment_validators(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)),
      'reg', public.equipment_regularization_pending_kpis(p_filial_ids => ARRAY[v_f], p_include_sem_filial => false)
    ) INTO v_val;
    IF v_val IS DISTINCT FROM v_pre->(u->>'uid') THEN
      RAISE EXCEPTION 'FALHA [%] R0 telas mudaram: antes % depois %', v_perfil, v_pre->(u->>'uid'), v_val;
    END IF;
    v_line := v_line || format(E'\n  R0 OK telas iguais: total=%s validadas=%s validadores=%s',
                               v_val->'kpi'->>'total', v_val->'kpi'->>'total_validadas', v_val->>'val');

    -- A: validacao com a Filial Ativa autorizada
    <<t_a>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  A NAO TESTADO: maquina nao encontrada'; EXIT t_a; END IF;
      v_used := v_used || v_m;
      PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_f, p_mark_validated => true);
      SELECT validation_filial_id, validation_filial_source, filial_id INTO v_vf, v_src, v_fil FROM public.client_equipment WHERE id = v_m;
      SELECT * INTO v_h FROM public.client_equipment_validation_filial_history WHERE equipment_id = v_m ORDER BY created_at DESC LIMIT 1;
      IF v_vf IS DISTINCT FROM v_f OR v_fil IS DISTINCT FROM v_f OR v_h.new_validation_filial_id IS DISTINCT FROM v_f
         OR v_h.actor_user_id IS DISTINCT FROM v_uid OR v_h.pending OR NOT v_h.validation_marked THEN
        RAISE EXCEPTION 'FALHA [%] A: vf=% cadastral=% hist=%', v_perfil, v_vf, v_fil, to_jsonb(v_h);
      END IF;
      v_line := v_line || format(E'\n  A OK Filial Ativa registrada (origem=%s); cadastral inalterada; historico evento=%s origem=%s pendente=%s',
                                 v_src, v_h.event_type, v_h.origin, v_h.pending);
    END t_a;

    -- B: filial invalida bloqueada (global: inexistente; restrito: existente nao autorizada)
    <<t_b>> BEGIN
      v_m := NULL;
      IF v_bad IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  B NAO TESTADO: nenhuma filial nao autorizada disponivel'; EXIT t_b; END IF;
      SELECT ce.id, ce.last_validation_at INTO v_m, v_lva_before FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  B NAO TESTADO: maquina nao encontrada'; EXIT t_b; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO';
      BEGIN
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_bad, p_mark_validated => true);
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      SELECT validation_filial_id, last_validation_at INTO v_vf, v_lva FROM public.client_equipment WHERE id = v_m;
      IF v_state <> '42501' OR v_vf IS NOT NULL OR v_lva IS DISTINCT FROM v_lva_before THEN
        RAISE EXCEPTION 'FALHA [%] B: estado=% vf=%', v_perfil, v_state, v_vf;
      END IF;
      v_line := v_line || CASE WHEN v_global
        THEN E'\n  B OK filial inexistente bloqueada (42501), maquina intacta'
        ELSE E'\n  B OK filial existente nao autorizada bloqueada (42501), maquina intacta' END;
    END t_b;

    -- C: validacao sem filial informada
    <<t_c>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  C NAO TESTADO: maquina nao encontrada'; EXIT t_c; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO';
      BEGIN
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => NULL, p_mark_validated => true);
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      SELECT validation_filial_id, validation_filial_source INTO v_vf, v_src FROM public.client_equipment WHERE id = v_m;
      IF NOT v_global AND cardinality(v_allowed) = 1 THEN
        IF v_state <> 'ACEITO' OR v_vf IS DISTINCT FROM v_f OR v_src IS DISTINCT FROM 'filial_unica_usuario' THEN
          RAISE EXCEPTION 'FALHA [%] C(unica): estado=% vf=% src=%', v_perfil, v_state, v_vf, v_src;
        END IF;
        v_line := v_line || E'\n  C OK sem Filial Ativa: usou a unica filial autorizada';
      ELSE
        IF v_state <> '22023' OR v_vf IS NOT NULL THEN
          RAISE EXCEPTION 'FALHA [%] C(obrigatoria): estado=% vf=%', v_perfil, v_state, v_vf;
        END IF;
        v_line := v_line || E'\n  C OK sem Filial Ativa: bloqueado (FILIAL_VALIDACAO_OBRIGATORIA)';
      END IF;
    END t_c;

    -- D: mudanca de situacao para vendida
    <<t_d>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  D NAO TESTADO: maquina nao encontrada'; EXIT t_d; END IF;
      v_used := v_used || v_m;
      PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_f, p_mark_validated => false, p_machine_status => 'vendida');
      SELECT validation_filial_id, filial_id INTO v_vf, v_fil FROM public.client_equipment WHERE id = v_m;
      SELECT * INTO v_h FROM public.client_equipment_validation_filial_history WHERE equipment_id = v_m ORDER BY created_at DESC LIMIT 1;
      IF v_vf IS DISTINCT FROM v_f OR v_fil IS DISTINCT FROM v_f OR v_h.new_machine_status IS DISTINCT FROM 'vendida'
         OR v_h.new_validation_filial_id IS DISTINCT FROM v_f THEN
        RAISE EXCEPTION 'FALHA [%] D: vf=% hist=%', v_perfil, v_vf, to_jsonb(v_h);
      END IF;
      v_line := v_line || E'\n  D OK situacao vendida registrou a filial responsavel; cadastral inalterada';
    END t_d;

    -- E: gravacao direta tentando trocar a filial cadastral junto com validacao
    <<t_e>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL OR v_x IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  E NAO TESTADO: maquina ou filial alvo nao encontrada'; EXIT t_e; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO'; v_rows := 0;
      BEGIN
        SET LOCAL ROLE authenticated;
        UPDATE public.client_equipment SET filial_id = v_x, last_validation_at = clock_timestamp() WHERE id = v_m;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        RESET ROLE;
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET ROLE;
      SELECT filial_id INTO v_fil FROM public.client_equipment WHERE id = v_m;
      IF (v_state = 'ACEITO' AND v_rows > 0) OR v_fil IS DISTINCT FROM v_f THEN
        RAISE EXCEPTION 'FALHA [%] E: troca de cadastral aceita (estado=% linhas=%)', v_perfil, v_state, v_rows;
      END IF;
      v_line := v_line || format(E'\n  E OK gravacao direta trocando cadastral bloqueada (%s)',
                                 CASE WHEN v_state = 'ACEITO' THEN 'permissao: 0 linhas' ELSE v_state END);
    END t_e;

    -- F: gravacao direta declarando origem "importacao" sem filial
    <<t_f>> BEGIN
      v_m := NULL;
      SELECT ce.id INTO v_m FROM public.client_equipment ce
       WHERE ce.filial_id = v_f AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
         AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
       ORDER BY ce.id LIMIT 1;
      IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  F NAO TESTADO: maquina nao encontrada'; EXIT t_f; END IF;
      v_used := v_used || v_m; v_state := 'ACEITO'; v_rows := 0;
      BEGIN
        PERFORM set_config('app.validation_filial_origin', 'importacao', true);
        SET LOCAL ROLE authenticated;
        UPDATE public.client_equipment SET last_validation_at = clock_timestamp() WHERE id = v_m;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        RESET ROLE;
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET ROLE;
      PERFORM set_config('app.validation_filial_origin', '', true);
      SELECT validation_filial_id, validation_filial_pending INTO v_vf, v_ok FROM public.client_equipment WHERE id = v_m;
      IF v_state = 'ACEITO' AND v_rows > 0 AND (v_vf IS NULL OR v_ok OR NOT (v_vf = ANY(v_allowed))) THEN
        RAISE EXCEPTION 'FALHA [%] F: contorno por origem aceito sem filial autorizada', v_perfil;
      END IF;
      v_line := v_line || format(E'\n  F OK origem "importacao" nao dispensa a filial (%s)',
        CASE WHEN v_state <> 'ACEITO' THEN 'bloqueado ' || v_state
             WHEN v_rows = 0 THEN 'permissao: 0 linhas'
             ELSE 'aceito somente com a unica filial autorizada' END);
    END t_f;

    -- G: supervisor com varias filiais valida pela filial adicional autorizada
    IF v_e IS NOT NULL THEN
      <<t_g>> BEGIN
        v_m := NULL;
        SELECT ce.id INTO v_m FROM public.client_equipment ce
         WHERE ce.filial_id = v_e AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
           AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
         ORDER BY ce.id LIMIT 1;
        IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  G NAO TESTADO: maquina nao encontrada'; EXIT t_g; END IF;
        v_used := v_used || v_m;
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_e, p_mark_validated => true);
        SELECT validation_filial_id, filial_id INTO v_vf, v_fil FROM public.client_equipment WHERE id = v_m;
        IF v_vf IS DISTINCT FROM v_e OR v_fil IS DISTINCT FROM v_e THEN
          RAISE EXCEPTION 'FALHA [%] G: vf=%', v_perfil, v_vf;
        END IF;
        v_line := v_line || E'\n  G OK Filial Ativa adicional autorizada registrada; cadastral inalterada';
      END t_g;
    END IF;

    -- H: global valida maquina sem filial cadastral escolhendo uma filial
    IF v_global THEN
      <<t_h>> BEGIN
        v_m := NULL;
        SELECT ce.id INTO v_m FROM public.client_equipment ce
         WHERE ce.filial_id IS NULL AND ce.machine_status = 'ativa' AND NOT (ce.id = ANY(v_used))
           AND NOT EXISTS (SELECT 1 FROM public.equipment_regularization_items i WHERE i.equipment_id = ce.id)
         ORDER BY ce.id LIMIT 1;
        IF v_m IS NULL THEN v_nt := v_nt + 1; v_line := v_line || E'\n  H NAO TESTADO: maquina nao encontrada'; EXIT t_h; END IF;
        v_used := v_used || v_m;
        PERFORM public.validate_client_equipment(p_equipment_id => v_m, p_filial_id => v_f, p_mark_validated => true);
        SELECT validation_filial_id, filial_id INTO v_vf, v_fil FROM public.client_equipment WHERE id = v_m;
        IF v_vf IS DISTINCT FROM v_f OR v_fil IS NOT NULL THEN
          RAISE EXCEPTION 'FALHA [%] H: vf=% cadastral=%', v_perfil, v_vf, v_fil;
        END IF;
        v_line := v_line || E'\n  H OK maquina sem filial: responsavel registrada, cadastral continua vazia';
      END t_h;
    END IF;

    -- I: historico nao pode ser apagado
    v_state := 'ACEITO';
    BEGIN
      DELETE FROM public.client_equipment_validation_filial_history WHERE actor_user_id = v_uid;
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    IF v_state <> '42501' THEN RAISE EXCEPTION 'FALHA [%] I: historico apagavel (%)', v_perfil, v_state; END IF;
    v_line := v_line || E'\n  I OK historico imutavel';

    v_rep := v_rep || v_line;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT md5(string_agg(id::text || ':' || COALESCE(filial_id::text, '-'), ',' ORDER BY id)) INTO v_fp_after FROM public.client_equipment;
  SELECT count(*) INTO v_lotes_a FROM public.equipment_regularization_batches;
  SELECT count(*) INTO v_itens_a FROM public.equipment_regularization_items;
  IF v_fp_after <> v_fp_before THEN RAISE EXCEPTION 'FALHA: filial cadastral de alguma maquina mudou'; END IF;
  IF v_lotes_a <> v_lotes_b OR v_itens_a <> v_itens_b THEN RAISE EXCEPTION 'FALHA: lotes/itens mudaram'; END IF;

  -- Sempre termina com erro -> rollback integral. Resultado PARCIAL se algum caso nao foi testado.
  RAISE EXCEPTION E'% SHA=% maquinas_testadas=% nao_testados=% filial_cadastral_identica=sim lotes=% itens=% historico_novo=% %',
    CASE WHEN v_nt = 0 THEN 'SIMULACAO_OK_ROLLBACK' ELSE 'SIMULACAO_PARCIAL_ROLLBACK' END,
    v_sha, cardinality(v_used), v_nt, v_lotes_a, v_itens_a,
    (SELECT count(*) FROM public.client_equipment_validation_filial_history) - v_hist_b, v_rep;
END
$simA$;
