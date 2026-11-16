CREATE OR REPLACE FUNCTION public.get_my_day_activity_detail(
  p_user_id uuid, p_block text, p_id uuid, p_filial_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v jsonb; v_eff uuid[]; v_act_filial uuid; v_act_filial_txt text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF p_block NOT IN ('visit_schedules','returns','trainings','open_tasks') OR p_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros inválidos' USING ERRCODE='22023';
  END IF;
  SELECT * INTO t FROM public.my_day_assert_target(p_user_id, p_filial_id);
  IF NOT t.is_self THEN
    v_eff := public.effective_filial_ids(p_filial_id);
    IF coalesce(array_length(v_eff,1),0) = 0 AND NOT (public.is_active_approved_user()
       AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))) THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_block = 'visit_schedules' THEN
    SELECT jsonb_build_object('id',vs.id,'planned_date',vs.planned_date,'client_code',vs.client_code,
      'client_name',vs.client_name,'client_property',vs.client_property,'client_phone',vs.client_phone,
      'client_email',vs.client_email,'filial',vs.filial,'seller_name',vs.seller_name,
      'observation',vs.observation,'status',vs.status,'realized_at',vs.realized_at,
      'created_at',vs.created_at,'updated_at',vs.updated_at), vs.filial_id
      INTO v, v_act_filial FROM public.visit_schedules vs WHERE vs.id=p_id AND vs.seller_id=t.user_id;
  ELSIF p_block = 'returns' THEN
    SELECT jsonb_build_object('id',f.id,'task_id',f.task_id,'client_code',f.client_code,
      'client_name',f.client_name,'activity_type',f.activity_type,'activity_date',f.activity_date,
      'next_return_date',f.next_return_date,'return_notes',f.return_notes,'notes',f.notes,
      'status',f.followup_status,'priority',f.priority,'client_temperature',f.client_temperature,
      'filial',(SELECT nome FROM public.filiais WHERE id=f.filial_id),
      'created_at',f.created_at,'updated_at',f.updated_at), f.filial_id
      INTO v, v_act_filial FROM public.task_followups f WHERE f.id=p_id AND f.responsible_user_id=t.user_id;
  ELSIF p_block = 'trainings' THEN
    SELECT jsonb_build_object('id',tr.id,'name',tr.name,'training_date',tr.training_date,
      'training_time',tr.training_time,'hours',tr.hours,'user_name',tr.user_name,'status',tr.status,
      'filial',(SELECT nome FROM public.filiais WHERE id=tr.filial_id),
      'created_at',tr.created_at,'updated_at',tr.updated_at), tr.filial_id
      INTO v, v_act_filial FROM public.trainings tr WHERE tr.id=p_id AND tr.user_id=t.user_id;
  ELSE
    SELECT jsonb_build_object('id',k.id,'task_type',k.task_type,'name',k.name,'responsible',k.responsible,
      'client',k.client,'clientcode',k.clientcode,'property',k.property,'filial',k.filial,
      'start_date',k.start_date,'end_date',k.end_date,'start_time',k.start_time,'end_time',k.end_time,
      'status',k.status,'priority',k.priority,'observations',k.observations,'is_prospect',k.is_prospect,
      'sales_type',k.sales_type,'sales_value',k.sales_value,'next_action',k.next_action,
      'next_action_date',k.next_action_date,'contact_name',k.contact_name,'phone',k.phone,'email',k.email,
      'created_at',k.created_at,'updated_at',k.updated_at), k.filial
      INTO v, v_act_filial_txt FROM public.tasks k WHERE k.id=p_id AND k.created_by=t.user_id;
  END IF;

  IF v IS NULL THEN RAISE EXCEPTION 'Atividade não encontrada' USING ERRCODE='P0002'; END IF;

  IF NOT t.is_self AND coalesce(array_length(v_eff,1),0) > 0 THEN
    IF p_block = 'open_tasks' THEN
      IF (SELECT count(*) FROM public.filiais fi
            WHERE LOWER(TRIM(fi.nome)) = LOWER(TRIM(v_act_filial_txt))) <> 1
         OR NOT EXISTS (SELECT 1 FROM public.filiais fi WHERE fi.id = ANY(v_eff)
                      AND LOWER(TRIM(fi.nome)) = LOWER(TRIM(v_act_filial_txt))) THEN
        RAISE EXCEPTION 'Atividade não encontrada' USING ERRCODE='P0002';
      END IF;
    ELSIF v_act_filial IS NULL OR NOT (v_act_filial = ANY(v_eff)) THEN
      RAISE EXCEPTION 'Atividade não encontrada' USING ERRCODE='P0002';
    END IF;
  END IF;
  RETURN v || jsonb_build_object('block', p_block);
END $$;
REVOKE ALL ON FUNCTION public.get_my_day_activity_detail(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_day_activity_detail(uuid,text,uuid,uuid) TO authenticated;