CREATE OR REPLACE FUNCTION public.pops_match_import_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_program uuid; v_counts jsonb;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT program_id INTO v_program FROM public.pops_import_batches WHERE id = p_batch_id;
  IF v_program IS NULL THEN RAISE EXCEPTION 'Lote inexistente'; END IF;

  UPDATE public.pops_import_rows
     SET match_status='PENDENTE', match_score=NULL, match_reason=NULL,
         matched_equipment_id=NULL, candidates='[]'::jsonb,
         park_client_code=NULL, park_client_name=NULL, park_filial_id=NULL,
         park_model=NULL, park_serial=NULL, client_code_divergence=false
   WHERE batch_id = p_batch_id
     AND resolution IN ('pendente','confirmado');

  UPDATE public.pops_import_rows
     SET match_status='NAO_ENCONTRADA', match_score=0,
         match_reason='Serial ausente ou muito curto na base POPS'
   WHERE batch_id = p_batch_id AND resolution IN ('pendente','confirmado')
     AND (serial_norm IS NULL OR length(serial_norm) < 6);

  WITH dup AS (
    SELECT id, row_number() OVER (PARTITION BY serial_norm ORDER BY row_number) AS rn
      FROM public.pops_import_rows
     WHERE batch_id = p_batch_id AND serial_norm IS NOT NULL
       AND length(serial_norm) >= 6 AND resolution IN ('pendente','confirmado')
  )
  UPDATE public.pops_import_rows r
     SET match_status='DUPLICADA_NA_BASE', match_score=0,
         match_reason='Serial repetido no arquivo importado'
    FROM dup WHERE dup.id = r.id AND dup.rn > 1;

  -- Parque normalizado uma unica vez (evita recomputar normalizacao por linha)
  DROP TABLE IF EXISTS pops_tmp_park;
  CREATE TEMP TABLE pops_tmp_park AS
    SELECT e.id AS equipment_id,
           e.client_code,
           e.client_name,
           e.filial_id,
           e.model,
           e.serial_chassis,
           public.pops_norm_serial(e.serial_chassis) AS park_serial_norm,
           public.pops_norm_code(e.client_code)      AS park_code_norm
      FROM public.client_equipment e
     WHERE e.serial_chassis IS NOT NULL;

  CREATE INDEX pops_tmp_park_serial_idx ON pops_tmp_park (park_serial_norm);
  CREATE INDEX pops_tmp_park_serial13_idx ON pops_tmp_park (right(park_serial_norm,13));
  ANALYZE pops_tmp_park;

  WITH alvo AS (
    SELECT r.id AS row_id,
           r.serial_norm          AS import_serial_norm,
           r.pops_client_code_norm AS import_code_norm
      FROM public.pops_import_rows r
     WHERE r.batch_id = p_batch_id
       AND r.match_status = 'PENDENTE'
       AND r.resolution IN ('pendente','confirmado')
  ),
  pares AS (
    SELECT a.row_id, a.import_serial_norm, a.import_code_norm, p.equipment_id
      FROM alvo a
      JOIN pops_tmp_park p ON p.park_serial_norm = a.import_serial_norm
    UNION
    SELECT a.row_id, a.import_serial_norm, a.import_code_norm, p.equipment_id
      FROM alvo a
      JOIN pops_tmp_park p ON p.park_serial_norm = right(a.import_serial_norm,13)
     WHERE length(a.import_serial_norm) = 17
    UNION
    SELECT a.row_id, a.import_serial_norm, a.import_code_norm, p.equipment_id
      FROM alvo a
      JOIN pops_tmp_park p ON right(p.park_serial_norm,13) = a.import_serial_norm
     WHERE length(a.import_serial_norm) = 13
  ),
  cand AS (
    SELECT pa.row_id,
           pa.equipment_id,
           p.client_code, p.client_name, p.filial_id, p.model, p.serial_chassis,
           (p.park_code_norm IS NOT NULL
            AND pa.import_code_norm IS NOT NULL
            AND p.park_code_norm = pa.import_code_norm) AS code_ok,
           (p.park_serial_norm = pa.import_serial_norm) AS serial_exato
      FROM pares pa
      JOIN pops_tmp_park p ON p.equipment_id = pa.equipment_id
  ),
  agg AS (
    SELECT row_id,
           count(*) AS n_total,
           count(*) FILTER (WHERE code_ok) AS n_code,
           jsonb_agg(jsonb_build_object(
             'equipment_id', equipment_id, 'client_code', client_code,
             'client_name', client_name, 'filial_id', filial_id,
             'model', model, 'serial_chassis', serial_chassis,
             'code_ok', code_ok, 'serial_exato', serial_exato
           ) ORDER BY code_ok DESC, serial_exato DESC) AS cands
      FROM cand GROUP BY row_id
  ),
  escolha AS (
    SELECT g.row_id, g.n_total, g.n_code, g.cands,
           CASE
             WHEN g.n_code = 1 THEN (SELECT c.equipment_id FROM cand c WHERE c.row_id=g.row_id AND c.code_ok LIMIT 1)
             WHEN g.n_total = 1 THEN (SELECT c.equipment_id FROM cand c WHERE c.row_id=g.row_id LIMIT 1)
             ELSE NULL
           END AS equipment_id
      FROM agg g
  )
  UPDATE public.pops_import_rows r
     SET matched_equipment_id = e.equipment_id,
         candidates = CASE WHEN e.equipment_id IS NULL THEN e.cands ELSE '[]'::jsonb END,
         match_score = CASE
                         WHEN e.n_code = 1 THEN CASE WHEN e.n_total = 1 THEN 100 ELSE 95 END
                         WHEN e.n_total = 1 AND r.pops_client_code_norm IS NULL THEN 90
                         WHEN e.n_total = 1 THEN 70
                         ELSE 50
                       END,
         match_status = CASE
                          WHEN e.n_code = 1 THEN 'MATCH_EXATO'::public.pops_match_status
                          WHEN e.n_total = 1 AND r.pops_client_code_norm IS NULL THEN 'MATCH_EXATO'::public.pops_match_status
                          ELSE 'REVISAR'::public.pops_match_status
                        END,
         match_reason = CASE
                          WHEN e.n_code = 1 THEN 'Serial localizado e Dealer Account Number confere'
                          WHEN e.n_total = 1 AND r.pops_client_code_norm IS NULL THEN 'Serial unico no Parque; base POPS sem codigo de cliente'
                          WHEN e.n_total = 1 THEN 'Serial unico no Parque, porem codigo de cliente divergente'
                          ELSE 'Multiplos candidatos no Parque para o mesmo serial'
                        END
    FROM escolha e
   WHERE e.row_id = r.id;

  UPDATE public.pops_import_rows
     SET match_status='NAO_ENCONTRADA', match_score=0,
         match_reason='Nenhuma maquina correspondente no Parque'
   WHERE batch_id = p_batch_id AND match_status='PENDENTE'
     AND resolution IN ('pendente','confirmado');

  UPDATE public.pops_import_rows r
     SET park_client_code = p.client_code,
         park_client_name = p.client_name,
         park_filial_id   = p.filial_id,
         park_model       = p.model,
         park_serial      = p.serial_chassis,
         client_code_divergence = (
           r.pops_client_code_norm IS NOT NULL
           AND p.park_code_norm IS NOT NULL
           AND p.park_code_norm <> r.pops_client_code_norm
         )
    FROM pops_tmp_park p
   WHERE r.batch_id = p_batch_id AND r.matched_equipment_id = p.equipment_id;

  UPDATE public.pops_import_rows r
     SET match_status='JA_NO_POPS',
         match_reason='Maquina ja vinculada ao programa POPS'
   WHERE r.batch_id = p_batch_id
     AND r.matched_equipment_id IS NOT NULL
     AND r.resolution <> 'ignorado'
     AND EXISTS (
       SELECT 1 FROM public.pops_machines m
        WHERE m.program_id = v_program AND m.equipment_id = r.matched_equipment_id
          AND (r.confirmed_machine_id IS NULL OR m.id <> r.confirmed_machine_id)
     );

  DROP TABLE IF EXISTS pops_tmp_park;

  SELECT jsonb_object_agg(match_status, qtd) INTO v_counts
    FROM (SELECT match_status, count(*) qtd FROM public.pops_import_rows
           WHERE batch_id = p_batch_id GROUP BY 1) s;

  UPDATE public.pops_import_batches
     SET status='processado', counts=COALESCE(v_counts,'{}'::jsonb)
   WHERE id = p_batch_id;

  RETURN COALESCE(v_counts,'{}'::jsonb);
END;
$function$;