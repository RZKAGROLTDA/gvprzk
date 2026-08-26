CREATE OR REPLACE FUNCTION public.pops_confirm_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_program uuid; v_ins integer := 0;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT program_id INTO v_program FROM public.pops_import_batches WHERE id = p_batch_id;
  IF v_program IS NULL THEN RAISE EXCEPTION 'Lote inexistente'; END IF;

  WITH elegiveis AS (
    SELECT r.id AS row_id, r.matched_equipment_id, r.pops_client_code_norm
      FROM public.pops_import_rows r
     WHERE r.batch_id = p_batch_id
       AND r.matched_equipment_id IS NOT NULL
       AND r.resolution IN ('confirmado','vinculado_manual')
       AND r.confirmed_machine_id IS NULL
       AND r.match_status <> 'JA_NO_POPS'
  ), ins AS (
    INSERT INTO public.pops_machines (program_id, equipment_id, responsible_user_id,
                                      source, import_batch_id, created_by)
    SELECT v_program, e.matched_equipment_id, ca.rac_user_id,
           'import', p_batch_id, (SELECT auth.uid())
      FROM elegiveis e
      LEFT JOIN public.pops_client_assignments ca
             ON ca.program_id = v_program
            AND ca.pops_client_code_norm = e.pops_client_code_norm
    ON CONFLICT (program_id, equipment_id) DO NOTHING
    RETURNING id, equipment_id
  )
  UPDATE public.pops_import_rows r
     SET confirmed_machine_id = ins.id
    FROM ins
   WHERE r.batch_id = p_batch_id AND r.matched_equipment_id = ins.equipment_id;

  SELECT count(*) INTO v_ins FROM public.pops_import_rows
   WHERE batch_id = p_batch_id AND confirmed_machine_id IS NOT NULL;

  UPDATE public.pops_import_batches
     SET status='confirmado', confirmed_by=(SELECT auth.uid()), confirmed_at=now()
   WHERE id = p_batch_id;

  RETURN jsonb_build_object('maquinas_no_pops', v_ins);
END;
$$;

REVOKE ALL ON FUNCTION public.pops_confirm_import_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pops_confirm_import_batch(uuid) TO authenticated;