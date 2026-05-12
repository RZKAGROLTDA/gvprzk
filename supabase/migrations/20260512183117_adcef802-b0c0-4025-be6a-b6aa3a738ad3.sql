
CREATE OR REPLACE FUNCTION public.map_task_type_to_followup_activity(p_task_type text)
RETURNS followup_activity_type
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(coalesce(p_task_type, ''))
    WHEN 'prospection' THEN 'visita'::public.followup_activity_type
    WHEN 'visita'      THEN 'visita'::public.followup_activity_type
    WHEN 'ligacao'     THEN 'ligacao'::public.followup_activity_type
    WHEN 'checklist'   THEN 'checklist'::public.followup_activity_type
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.sync_task_to_followup_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_activity public.followup_activity_type;
  v_filial_id uuid;
  v_status public.followup_status;
  v_next_date date;
  v_sales_type text;
  v_activity_date timestamptz;
BEGIN
  IF NEW.task_type NOT IN ('prospection','ligacao','checklist','visita') THEN
    RETURN NEW;
  END IF;

  v_activity := public.map_task_type_to_followup_activity(NEW.task_type);
  IF v_activity IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_filial_id
  FROM public.filiais WHERE lower(nome) = lower(NEW.filial) LIMIT 1;

  v_sales_type := lower(coalesce(NEW.sales_type,''));
  v_activity_date := COALESCE(NEW.start_date::timestamptz, NEW.created_at, now());

  IF v_sales_type = 'ganho' THEN
    v_status := 'concluido'; v_next_date := NULL;
  ELSIF v_sales_type = 'perdido' THEN
    v_status := 'cancelado'; v_next_date := NULL;
  ELSIF v_sales_type = 'parcial' THEN
    v_status := 'concluido'; v_next_date := NULL;
  ELSIF v_sales_type = 'prospect' THEN
    v_status := 'pendente';
    v_next_date := v_activity_date::date
                   + CASE lower(NEW.task_type)
                       WHEN 'ligacao'     THEN 5
                       WHEN 'checklist'   THEN 5
                       WHEN 'prospection' THEN 7
                       WHEN 'visita'      THEN 7
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
    NEW.id, NEW.client, NEW.clientcode, v_activity, v_activity_date,
    NEW.created_by, NEW.created_by, v_filial_id, NEW.observations,
    v_status, 'media'::public.followup_priority, v_next_date
  )
  ON CONFLICT (task_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_task_to_followup_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_activity public.followup_activity_type;
  v_status public.followup_status;
  v_next_date date;
  v_sales_type text;
  v_should_recalc_date boolean;
  v_filial_id uuid;
  v_activity_date timestamptz;
  v_exists boolean;
BEGIN
  IF NEW.task_type NOT IN ('prospection','ligacao','checklist','visita') THEN
    RETURN NEW;
  END IF;

  v_activity := public.map_task_type_to_followup_activity(NEW.task_type);
  v_sales_type := lower(coalesce(NEW.sales_type,''));
  v_activity_date := COALESCE(NEW.start_date::timestamptz, NEW.created_at, now());

  SELECT id INTO v_filial_id
  FROM public.filiais WHERE lower(nome) = lower(NEW.filial) LIMIT 1;

  v_should_recalc_date :=
    (coalesce(lower(OLD.sales_type),'') IS DISTINCT FROM v_sales_type)
    OR (OLD.task_type IS DISTINCT FROM NEW.task_type)
    OR (OLD.start_date IS DISTINCT FROM NEW.start_date);

  IF v_sales_type = 'ganho' THEN
    v_status := 'concluido'; v_next_date := NULL;
  ELSIF v_sales_type = 'perdido' THEN
    v_status := 'cancelado'; v_next_date := NULL;
  ELSIF v_sales_type = 'parcial' THEN
    v_status := 'concluido'; v_next_date := NULL;
  ELSIF v_sales_type = 'prospect' THEN
    v_status := 'pendente';
    v_next_date := v_activity_date::date
                   + CASE lower(NEW.task_type)
                       WHEN 'ligacao'     THEN 5
                       WHEN 'checklist'   THEN 5
                       WHEN 'prospection' THEN 7
                       WHEN 'visita'      THEN 7
                       ELSE 7
                     END;
  ELSE
    v_status := public.map_task_status_to_followup_status(NEW.status);
    v_next_date := NULL;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.task_followups WHERE task_id = NEW.id) INTO v_exists;

  IF v_exists THEN
    UPDATE public.task_followups f
    SET
      activity_type       = COALESCE(v_activity, f.activity_type),
      client_name         = NEW.client,
      client_code         = NEW.clientcode,
      notes               = NEW.observations,
      followup_status     = v_status,
      responsible_user_id = NEW.created_by,
      filial_id           = v_filial_id,
      activity_date       = v_activity_date,
      next_return_date    = CASE
                              WHEN v_sales_type IN ('ganho','perdido','parcial') THEN NULL
                              WHEN v_sales_type = 'prospect' AND v_should_recalc_date THEN v_next_date
                              ELSE f.next_return_date
                            END,
      updated_at          = now()
    WHERE f.task_id = NEW.id;
  ELSE
    INSERT INTO public.task_followups (
      task_id, client_name, client_code, activity_type, activity_date,
      responsible_user_id, created_by, filial_id, notes,
      followup_status, priority, next_return_date
    ) VALUES (
      NEW.id, NEW.client, NEW.clientcode, v_activity, v_activity_date,
      NEW.created_by, NEW.created_by, v_filial_id, NEW.observations,
      v_status, 'media'::public.followup_priority, v_next_date
    )
    ON CONFLICT (task_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.task_followups (
  task_id, client_name, client_code, activity_type, activity_date,
  responsible_user_id, created_by, filial_id, notes,
  followup_status, priority, next_return_date
)
SELECT
  t.id, t.client, t.clientcode,
  public.map_task_type_to_followup_activity(t.task_type),
  COALESCE(t.start_date::timestamptz, t.created_at, now()),
  t.created_by, t.created_by,
  (SELECT id FROM public.filiais WHERE lower(nome) = lower(t.filial) LIMIT 1),
  t.observations,
  CASE lower(coalesce(t.sales_type,''))
    WHEN 'ganho'    THEN 'concluido'::public.followup_status
    WHEN 'perdido'  THEN 'cancelado'::public.followup_status
    WHEN 'parcial'  THEN 'concluido'::public.followup_status
    WHEN 'prospect' THEN 'pendente'::public.followup_status
    ELSE public.map_task_status_to_followup_status(t.status)
  END,
  'media'::public.followup_priority,
  CASE
    WHEN lower(coalesce(t.sales_type,'')) = 'prospect'
      THEN COALESCE(t.start_date::timestamptz, t.created_at, now())::date
           + CASE lower(t.task_type)
               WHEN 'ligacao'   THEN 5
               WHEN 'checklist' THEN 5
               ELSE 7
             END
    ELSE NULL
  END
FROM public.tasks t
WHERE t.task_type IN ('prospection','ligacao','checklist','visita')
  AND public.map_task_type_to_followup_activity(t.task_type) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.task_followups f WHERE f.task_id = t.id)
ON CONFLICT (task_id) DO NOTHING;
