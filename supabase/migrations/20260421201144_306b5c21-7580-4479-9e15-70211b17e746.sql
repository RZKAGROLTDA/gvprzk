-- Ajusta sincronização tasks -> task_followups com base em sales_type
-- prospect  -> pendente   + next_return_date (lig +2 / chk +3 / visita +5)
-- parcial   -> pendente   + next_return_date (+3)
-- ganho     -> concluido  + next_return_date NULL
-- perdido   -> cancelado  + next_return_date NULL
-- NULL/outro-> mantém regra antiga baseada em tasks.status, sem retorno

CREATE OR REPLACE FUNCTION public.compute_followup_from_task(
  p_sales_type text,
  p_task_type  text,
  p_base_date  timestamptz,
  p_status     text
)
RETURNS TABLE(followup_status public.followup_status, next_return_date date)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_status public.followup_status;
  v_return date;
  v_base   date := COALESCE(p_base_date::date, now()::date);
BEGIN
  CASE lower(COALESCE(p_sales_type, ''))
    WHEN 'prospect' THEN
      v_status := 'pendente'::public.followup_status;
      v_return := v_base + CASE lower(COALESCE(p_task_type, ''))
                             WHEN 'ligacao'     THEN 2
                             WHEN 'checklist'   THEN 3
                             WHEN 'prospection' THEN 5
                             ELSE 5
                           END;
    WHEN 'parcial' THEN
      v_status := 'pendente'::public.followup_status;
      v_return := v_base + 3;
    WHEN 'ganho' THEN
      v_status := 'concluido'::public.followup_status;
      v_return := NULL;
    WHEN 'perdido' THEN
      v_status := 'cancelado'::public.followup_status;
      v_return := NULL;
    ELSE
      v_status := public.map_task_status_to_followup_status(p_status);
      v_return := NULL;
  END CASE;

  RETURN QUERY SELECT v_status, v_return;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_task_to_followup_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_activity   public.followup_activity_type;
  v_filial_id  uuid;
  v_status     public.followup_status;
  v_return     date;
BEGIN
  v_activity := public.map_task_type_to_followup_activity(NEW.task_type);
  IF v_activity IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.filial IS NOT NULL THEN
    SELECT id INTO v_filial_id
      FROM public.filiais
     WHERE lower(nome) = lower(NEW.filial)
     LIMIT 1;
  END IF;

  SELECT c.followup_status, c.next_return_date
    INTO v_status, v_return
    FROM public.compute_followup_from_task(
           NEW.sales_type, NEW.task_type, COALESCE(NEW.created_at, now()), NEW.status
         ) c;

  INSERT INTO public.task_followups (
    task_id, client_name, client_code, activity_type, activity_date,
    responsible_user_id, created_by, filial_id, notes,
    followup_status, priority, next_return_date
  ) VALUES (
    NEW.id,
    NEW.client,
    NEW.clientcode,
    v_activity,
    COALESCE(NEW.created_at, now()),
    NEW.created_by,
    NEW.created_by,
    v_filial_id,
    NEW.observations,
    v_status,
    'media'::public.followup_priority,
    v_return
  )
  ON CONFLICT (task_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_task_to_followup_insert failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_task_to_followup_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_activity      public.followup_activity_type;
  v_filial_id     uuid;
  v_activity_date timestamptz;
  v_status        public.followup_status;
  v_return        date;
  v_sales_changed boolean;
  v_type_changed  boolean;
BEGIN
  v_activity := public.map_task_type_to_followup_activity(NEW.task_type);
  IF v_activity IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.client            IS NOT DISTINCT FROM OLD.client
     AND NEW.clientcode    IS NOT DISTINCT FROM OLD.clientcode
     AND NEW.task_type     IS NOT DISTINCT FROM OLD.task_type
     AND NEW.status        IS NOT DISTINCT FROM OLD.status
     AND NEW.sales_type    IS NOT DISTINCT FROM OLD.sales_type
     AND NEW.observations  IS NOT DISTINCT FROM OLD.observations
     AND NEW.responsible   IS NOT DISTINCT FROM OLD.responsible
     AND NEW.created_by    IS NOT DISTINCT FROM OLD.created_by
     AND NEW.filial        IS NOT DISTINCT FROM OLD.filial
     AND NEW.start_date    IS NOT DISTINCT FROM OLD.start_date
     AND NEW.start_time    IS NOT DISTINCT FROM OLD.start_time
  THEN
    RETURN NEW;
  END IF;

  IF NEW.filial IS NOT NULL THEN
    SELECT id INTO v_filial_id
      FROM public.filiais
     WHERE lower(nome) = lower(NEW.filial)
     LIMIT 1;
  END IF;

  BEGIN
    v_activity_date := (NEW.start_date::text || ' ' || COALESCE(NEW.start_time, '00:00'))::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_activity_date := NULL;
  END;

  SELECT c.followup_status, c.next_return_date
    INTO v_status, v_return
    FROM public.compute_followup_from_task(
           NEW.sales_type, NEW.task_type,
           COALESCE(v_activity_date, NEW.created_at, now()),
           NEW.status
         ) c;

  v_sales_changed := NEW.sales_type IS DISTINCT FROM OLD.sales_type;
  v_type_changed  := NEW.task_type  IS DISTINCT FROM OLD.task_type;

  UPDATE public.task_followups f
     SET client_name         = NEW.client,
         client_code         = NEW.clientcode,
         activity_type       = v_activity,
         activity_date       = COALESCE(v_activity_date, f.activity_date),
         responsible_user_id = NEW.created_by,
         filial_id           = COALESCE(v_filial_id, f.filial_id),
         notes               = NEW.observations,
         followup_status     = v_status,
         next_return_date    = CASE
           WHEN lower(COALESCE(NEW.sales_type,'')) IN ('ganho','perdido') THEN NULL
           WHEN v_sales_changed OR v_type_changed THEN v_return
           WHEN f.next_return_date IS NULL THEN v_return
           ELSE f.next_return_date
         END,
         updated_at          = now()
   WHERE f.task_id = NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_task_to_followup_update failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;