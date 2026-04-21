-- 1) Unicidade por task_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_followups_task_id
  ON public.task_followups (task_id)
  WHERE task_id IS NOT NULL;

-- 2) Mapeamento task_type -> activity_type
CREATE OR REPLACE FUNCTION public.map_task_type_to_followup_activity(p_task_type text)
RETURNS public.followup_activity_type
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(p_task_type, ''))
    WHEN 'prospection' THEN 'visita'::public.followup_activity_type
    WHEN 'ligacao'     THEN 'ligacao'::public.followup_activity_type
    WHEN 'checklist'   THEN 'checklist'::public.followup_activity_type
    ELSE NULL
  END
$$;

-- 3) Mapeamento status -> followup_status
CREATE OR REPLACE FUNCTION public.map_task_status_to_followup_status(p_status text)
RETURNS public.followup_status
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(p_status, ''))
    WHEN 'completed' THEN 'concluido'::public.followup_status
    WHEN 'closed'    THEN 'concluido'::public.followup_status
    ELSE 'pendente'::public.followup_status
  END
$$;

-- 4) Trigger function: INSERT
CREATE OR REPLACE FUNCTION public.sync_task_to_followup_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_activity public.followup_activity_type;
  v_filial_id uuid;
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

  INSERT INTO public.task_followups (
    task_id, client_name, client_code, activity_type, activity_date,
    responsible_user_id, created_by, filial_id, notes, followup_status, priority
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
    public.map_task_status_to_followup_status(NEW.status),
    'media'::public.followup_priority
  )
  ON CONFLICT (task_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_task_to_followup_insert failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 5) Trigger function: UPDATE (sem backfill)
CREATE OR REPLACE FUNCTION public.sync_task_to_followup_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_activity public.followup_activity_type;
  v_filial_id uuid;
  v_activity_date timestamptz;
BEGIN
  v_activity := public.map_task_type_to_followup_activity(NEW.task_type);
  IF v_activity IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.client            IS NOT DISTINCT FROM OLD.client
     AND NEW.clientcode    IS NOT DISTINCT FROM OLD.clientcode
     AND NEW.task_type     IS NOT DISTINCT FROM OLD.task_type
     AND NEW.status        IS NOT DISTINCT FROM OLD.status
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

  UPDATE public.task_followups
     SET client_name          = NEW.client,
         client_code          = NEW.clientcode,
         activity_type        = v_activity,
         activity_date        = COALESCE(v_activity_date, activity_date),
         responsible_user_id  = NEW.created_by,
         filial_id            = COALESCE(v_filial_id, filial_id),
         notes                = NEW.observations,
         followup_status      = public.map_task_status_to_followup_status(NEW.status),
         updated_at           = now()
   WHERE task_id = NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_task_to_followup_update failed for task %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 6) Triggers
DROP TRIGGER IF EXISTS trg_sync_task_to_followup_insert ON public.tasks;
CREATE TRIGGER trg_sync_task_to_followup_insert
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_to_followup_insert();

DROP TRIGGER IF EXISTS trg_sync_task_to_followup_update ON public.tasks;
CREATE TRIGGER trg_sync_task_to_followup_update
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_to_followup_update();