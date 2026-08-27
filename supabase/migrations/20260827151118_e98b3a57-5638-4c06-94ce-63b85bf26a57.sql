CREATE OR REPLACE FUNCTION public.pops_portfolio_clients(
  p_program_id uuid,
  p_filial_id  uuid DEFAULT NULL,
  p_search     text DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope  jsonb := public.pops_scope();
  v_kind   text  := v_scope ->> 'scope';
  v_filial uuid  := (v_scope ->> 'filial_id')::uuid;
  v_eff    uuid;
  v_search text  := nullif(btrim(coalesce(p_search,'')),'');
  v_limit  integer;
  v_total  integer;
  v_rows   jsonb;
BEGIN
  IF v_kind = 'none' THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit,50),1),200);
  v_eff := CASE WHEN v_kind = 'global' THEN p_filial_id ELSE v_filial END;
  IF v_kind <> 'global' AND v_eff IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  END IF;

  SELECT count(*) INTO v_total FROM (
    SELECT m.client_key
      FROM public.pops_machines m
     WHERE m.program_id = p_program_id AND m.active
       AND (v_eff IS NULL OR m.pops_filial_id = v_eff)
       AND (v_search IS NULL OR m.pops_client_name_norm LIKE '%'||public.pops_norm_place(v_search)||'%')
     GROUP BY m.client_key
  ) c;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pops_client_name), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT a.* FROM (
        SELECT m.client_key,
               min(m.pops_client_name)      AS pops_client_name,
               min(m.pops_dealer_location)   AS pops_dealer_location,
               min(m.pops_filial_id::text)::uuid AS pops_filial_id,
               min(f.nome)                  AS filial_nome,
               count(*)                                                            AS total_maquinas,
               count(*) FILTER (WHERE m.status NOT IN ('servicada','em_andamento')) AS pendentes,
               count(*) FILTER (WHERE m.status = 'em_andamento')                    AS em_andamento,
               count(*) FILTER (WHERE m.status = 'servicada')                       AS servicadas
          FROM public.pops_machines m
          LEFT JOIN public.filiais f ON f.id = m.pops_filial_id
         WHERE m.program_id = p_program_id AND m.active
           AND (v_eff IS NULL OR m.pops_filial_id = v_eff)
           AND (v_search IS NULL OR m.pops_client_name_norm LIKE '%'||public.pops_norm_place(v_search)||'%')
         GROUP BY m.client_key
      ) a
      ORDER BY a.pops_client_name
      LIMIT v_limit OFFSET greatest(coalesce(p_offset,0),0)
    ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $$;