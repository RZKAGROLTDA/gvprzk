DROP FUNCTION IF EXISTS public.get_incomplete_duplicate_task_ids();

CREATE FUNCTION public.get_incomplete_duplicate_task_ids()
RETURNS TABLE(task_id uuid, duplicate_of uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.id,
      t.created_by,
      lower(btrim(t.client)) AS client_key,
      t.task_type,
      t.created_at,
      (
        COALESCE(array_length(t.photos, 1), 0) = 0
        AND COALESCE(NULLIF(btrim(t.observations), ''), '') = ''
        AND COALESCE(t.sales_value, 0) = 0
        AND (
          t.checklist_machine IS NULL
          OR t.checklist_machine = 'null'::jsonb
          OR t.checklist_machine = '{}'::jsonb
          OR t.checklist_machine = '[]'::jsonb
          OR (
            jsonb_typeof(t.checklist_machine) = 'object'
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_each_text(t.checklist_machine) kv
              WHERE COALESCE(btrim(kv.value), '') <> ''
            )
          )
        )
        AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.task_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM public.reminders r WHERE r.task_id = t.id)
        AND NOT EXISTS (SELECT 1 FROM public.task_equipment te WHERE te.task_id = t.id)
      ) AS is_empty
    FROM public.tasks t
  ),
  empties AS (
    SELECT * FROM base WHERE is_empty
  )
  SELECT
    e.id AS task_id,
    (
      SELECT b.id
      FROM base b
      WHERE b.id <> e.id
        AND b.created_by IS NOT DISTINCT FROM e.created_by
        AND b.client_key = e.client_key
        AND b.task_type = e.task_type
        AND b.created_at > e.created_at - interval '10 minutes'
        AND b.created_at < e.created_at + interval '10 minutes'
      ORDER BY
        b.is_empty ASC,
        (b.created_at < e.created_at) DESC,
        abs(extract(epoch FROM (b.created_at - e.created_at))) ASC
      LIMIT 1
    ) AS duplicate_of
  FROM empties e
  WHERE EXISTS (
    SELECT 1
    FROM base b2
    WHERE b2.id <> e.id
      AND b2.created_by IS NOT DISTINCT FROM e.created_by
      AND b2.client_key = e.client_key
      AND b2.task_type = e.task_type
      AND b2.created_at > e.created_at - interval '10 minutes'
      AND b2.created_at < e.created_at + interval '10 minutes'
  );
$$;

REVOKE ALL ON FUNCTION public.get_incomplete_duplicate_task_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_incomplete_duplicate_task_ids() TO authenticated;