CREATE OR REPLACE FUNCTION public.get_media_migration_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_tasks jsonb;
  v_products jsonb;
  v_buckets jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores';
  END IF;

  SELECT jsonb_build_object(
    'base64_count', COALESCE(SUM(s.b64_count), 0),
    'storage_count', COALESCE(SUM(s.path_count), 0),
    'base64_bytes', COALESCE(SUM(s.b64_bytes), 0),
    'mixed_records', COALESCE(SUM(CASE WHEN s.b64_count > 0 AND s.path_count > 0 THEN 1 ELSE 0 END), 0),
    'records_with_photos', COALESCE(COUNT(*), 0)
  )
  INTO v_tasks
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE p LIKE 'data:%') AS b64_count,
      COUNT(*) FILTER (
        WHERE p NOT LIKE 'data:%'
          AND btrim(p) <> ''
          AND btrim(p) ~ '^[^/]+/[^/].*$'
      ) AS path_count,
      COALESCE(SUM(octet_length(p)) FILTER (WHERE p LIKE 'data:%'), 0) AS b64_bytes
    FROM public.tasks t
    CROSS JOIN LATERAL unnest(t.photos) AS p
    WHERE t.photos IS NOT NULL
      AND array_length(t.photos, 1) > 0
      AND p IS NOT NULL
      AND btrim(p) <> ''
    GROUP BY t.id
  ) s;

  SELECT jsonb_build_object(
    'base64_count', COALESCE(SUM(s.b64_count), 0),
    'storage_count', COALESCE(SUM(s.path_count), 0),
    'base64_bytes', COALESCE(SUM(s.b64_bytes), 0),
    'mixed_records', COALESCE(SUM(CASE WHEN s.b64_count > 0 AND s.path_count > 0 THEN 1 ELSE 0 END), 0),
    'records_with_photos', COALESCE(COUNT(*), 0)
  )
  INTO v_products
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE p LIKE 'data:%') AS b64_count,
      COUNT(*) FILTER (
        WHERE p NOT LIKE 'data:%'
          AND btrim(p) <> ''
          AND btrim(p) ~ '^[^/]+/[^/].*$'
      ) AS path_count,
      COALESCE(SUM(octet_length(p)) FILTER (WHERE p LIKE 'data:%'), 0) AS b64_bytes
    FROM public.products pr
    CROSS JOIN LATERAL unnest(pr.photos) AS p
    WHERE pr.photos IS NOT NULL
      AND array_length(pr.photos, 1) > 0
      AND p IS NOT NULL
      AND btrim(p) <> ''
    GROUP BY pr.id
  ) s;

  SELECT COALESCE(jsonb_agg(x.b ORDER BY x.bucket_id), '[]'::jsonb)
  INTO v_buckets
  FROM (
    SELECT
      b.bucket_id,
      jsonb_build_object(
        'bucket', b.bucket_id,
        'files', COALESCE(agg.files, 0),
        'bytes', COALESCE(agg.bytes, 0)
      ) AS b
    FROM (VALUES ('product-photos'), ('task-photos')) AS b(bucket_id)
    LEFT JOIN (
      SELECT
        o.bucket_id,
        COUNT(*) AS files,
        COALESCE(SUM(
          CASE
            WHEN o.metadata IS NOT NULL
             AND jsonb_typeof(o.metadata) = 'object'
             AND COALESCE(o.metadata->>'size', '') ~ '^[0-9]+$'
            THEN (o.metadata->>'size')::bigint
            ELSE 0
          END
        ), 0) AS bytes
      FROM storage.objects o
      WHERE o.bucket_id IN ('task-photos', 'product-photos')
      GROUP BY o.bucket_id
    ) agg ON agg.bucket_id = b.bucket_id
  ) x;

  RETURN jsonb_build_object(
    'tasks', v_tasks,
    'products', v_products,
    'buckets', v_buckets,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_media_migration_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_media_migration_report() TO authenticated;