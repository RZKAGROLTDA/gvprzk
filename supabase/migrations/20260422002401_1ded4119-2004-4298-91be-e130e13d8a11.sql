-- 1) Atualizar a função compute_followup_from_task para preencher next_return_date corretamente
CREATE OR REPLACE FUNCTION public.compute_followup_from_task(
  p_base_date date,
  p_sales_type text,
  p_status text,
  p_task_type text
)
RETURNS TABLE(
  followup_status public.followup_status,
  next_return_date date
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_status public.followup_status;
  v_next_date date;
  v_days int;
BEGIN
  -- Define o status do followup baseado em sales_type e status da task
  IF p_sales_type IN ('ganho', 'perdido', 'parcial') THEN
    v_status := 'concluido'::public.followup_status;
  ELSIF p_status = 'cancelled' THEN
    v_status := 'cancelado'::public.followup_status;
  ELSE
    v_status := 'pendente'::public.followup_status;
  END IF;

  -- Define dias para o próximo retorno baseado no tipo de atividade
  -- Apenas para prospects pendentes
  IF v_status = 'pendente'::public.followup_status AND p_sales_type = 'prospect' THEN
    IF p_task_type IN ('ligacao', 'call') THEN
      v_days := 5;
    ELSIF p_task_type IN ('checklist', 'workshop_checklist') THEN
      v_days := 5;
    ELSE
      -- prospection / visita / field_visit / outros
      v_days := 7;
    END IF;
    v_next_date := p_base_date + v_days;
  ELSE
    v_next_date := NULL;
  END IF;

  RETURN QUERY SELECT v_status, v_next_date;
END;
$$;

-- 2) Backfill: preencher next_return_date para prospects pendentes sem data
UPDATE public.task_followups tf
SET next_return_date = (tf.activity_date::date) + CASE
    WHEN t.task_type IN ('ligacao', 'call') THEN 5
    WHEN t.task_type IN ('checklist', 'workshop_checklist') THEN 5
    ELSE 7
  END,
  updated_at = now()
FROM public.tasks t
WHERE tf.task_id = t.id
  AND tf.followup_status = 'pendente'::public.followup_status
  AND tf.next_return_date IS NULL
  AND t.sales_type = 'prospect';