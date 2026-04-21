-- 1) SYNC INSERT
CREATE OR REPLACE FUNCTION public.sync_task_to_followup_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity public.followup_activity_type;
  v_filial_id uuid;
  v_status public.followup_status;
  v_next_date date;
  v_sales_type text;
BEGIN
  IF NEW.task_type NOT IN ('prospection','ligacao','checklist') THEN
    RETURN NEW;
  END IF;

  v_activity := public.map_task_type_to_followup_activity(NEW.task_type);
  IF v_activity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_filial_id
  FROM public.filiais
  WHERE lower(nome) = lower(NEW.filial)
  LIMIT 1;

  v_sales_type := lower(coalesce(NEW.sales_type,''));

  IF v_sales_type = 'ganho' THEN
    v_status := 'concluido';
    v_next_date := NULL;
  ELSIF v_sales_type = 'perdido' THEN
    v_status := 'cancelado';
    v_next_date := NULL;
  ELSIF v_sales_type = 'parcial' THEN
    v_status := 'concluido';
    v_next_date := NULL;
  ELSIF v_sales_type = 'prospect' THEN
    v_status := 'pendente';
    v_next_date := COALESCE(NEW.created_at, now())::date
                   + CASE lower(NEW.task_type)
                       WHEN 'ligacao'     THEN 5
                       WHEN 'checklist'   THEN 5
                       WHEN 'prospection' THEN 7
                       ELSE 7
                     END;
  ELSE
    v_status := public.map_task_status_to_followup_status(NEW.status);
    v_next_date := NULL;
  END IF;

  INSERT INTO public.task_followups (
    task_id, client_name, client_code, activity_type, activity_date,
    responsible_user_id, created_by, filial_id, notes,
    followup_status, priority, next_return_date
  ) VALUES (
    NEW.id, NEW.client, NEW.clientcode, v_activity,
    COALESCE(NEW.created_at, now()),
    NEW.created_by, NEW.created_by, v_filial_id, NEW.observations,
    v_status, 'media'::public.followup_priority, v_next_date
  )
  ON CONFLICT (task_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2) SYNC UPDATE
CREATE OR REPLACE FUNCTION public.sync_task_to_followup_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity public.followup_activity_type;
  v_status public.followup_status;
  v_next_date date;
  v_sales_type text;
  v_should_recalc_date boolean;
BEGIN
  IF NEW.task_type NOT IN ('prospection','ligacao','checklist') THEN
    RETURN NEW;
  END IF;

  v_activity := public.map_task_type_to_followup_activity(NEW.task_type);
  v_sales_type := lower(coalesce(NEW.sales_type,''));

  v_should_recalc_date :=
    (coalesce(lower(OLD.sales_type),'') IS DISTINCT FROM v_sales_type)
    OR (OLD.task_type IS DISTINCT FROM NEW.task_type);

  IF v_sales_type = 'ganho' THEN
    v_status := 'concluido';
    v_next_date := NULL;
  ELSIF v_sales_type = 'perdido' THEN
    v_status := 'cancelado';
    v_next_date := NULL;
  ELSIF v_sales_type = 'parcial' THEN
    v_status := 'concluido';
    v_next_date := NULL;
  ELSIF v_sales_type = 'prospect' THEN
    v_status := 'pendente';
    v_next_date := COALESCE(NEW.updated_at, now())::date
                   + CASE lower(NEW.task_type)
                       WHEN 'ligacao'     THEN 5
                       WHEN 'checklist'   THEN 5
                       WHEN 'prospection' THEN 7
                       ELSE 7
                     END;
  ELSE
    v_status := public.map_task_status_to_followup_status(NEW.status);
    v_next_date := NULL;
  END IF;

  UPDATE public.task_followups f
  SET
    activity_type      = COALESCE(v_activity, f.activity_type),
    client_name        = NEW.client,
    client_code        = NEW.clientcode,
    notes              = NEW.observations,
    followup_status    = v_status,
    next_return_date   = CASE
                           WHEN v_sales_type IN ('ganho','perdido','parcial') THEN NULL
                           WHEN v_sales_type = 'prospect' AND v_should_recalc_date THEN v_next_date
                           ELSE f.next_return_date
                         END,
    updated_at         = now()
  WHERE f.task_id = NEW.id;

  RETURN NEW;
END;
$$;

-- 3) BACKFILL
UPDATE public.task_followups f
SET followup_status  = 'concluido',
    next_return_date = NULL,
    updated_at       = now()
FROM public.tasks t
WHERE f.task_id = t.id
  AND lower(coalesce(t.sales_type,'')) = 'parcial'
  AND (f.followup_status <> 'concluido' OR f.next_return_date IS NOT NULL);

UPDATE public.task_followups f
SET followup_status  = 'concluido',
    next_return_date = NULL,
    updated_at       = now()
FROM public.tasks t
WHERE f.task_id = t.id
  AND lower(coalesce(t.sales_type,'')) = 'ganho'
  AND (f.followup_status <> 'concluido' OR f.next_return_date IS NOT NULL);

UPDATE public.task_followups f
SET followup_status  = 'cancelado',
    next_return_date = NULL,
    updated_at       = now()
FROM public.tasks t
WHERE f.task_id = t.id
  AND lower(coalesce(t.sales_type,'')) = 'perdido'
  AND (f.followup_status <> 'cancelado' OR f.next_return_date IS NOT NULL);