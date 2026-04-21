
CREATE OR REPLACE FUNCTION public.diag_try_followup_insert(p_task_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tasks%ROWTYPE;
  v_act public.followup_activity_type;
  v_filial uuid;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RETURN 'task not found'; END IF;

  v_act := public.map_task_type_to_followup_activity(t.task_type);
  IF v_act IS NULL THEN RETURN 'activity null for task_type=' || t.task_type; END IF;

  IF t.filial IS NOT NULL THEN
    SELECT id INTO v_filial FROM public.filiais WHERE lower(nome)=lower(t.filial) LIMIT 1;
  END IF;

  BEGIN
    INSERT INTO public.task_followups (
      task_id, client_name, client_code, activity_type, activity_date,
      responsible_user_id, created_by, filial_id, notes, followup_status, priority
    ) VALUES (
      t.id, t.client, t.clientcode, v_act, COALESCE(t.created_at, now()),
      t.created_by, t.created_by, v_filial, t.observations,
      public.map_task_status_to_followup_status(t.status),
      'media'::public.followup_priority
    );
    RETURN 'INSERT OK';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'ERRO: ' || SQLERRM || ' | SQLSTATE: ' || SQLSTATE;
  END;
END;
$$;
