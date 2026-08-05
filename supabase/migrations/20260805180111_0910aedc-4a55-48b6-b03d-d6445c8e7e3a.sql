CREATE OR REPLACE FUNCTION public.get_media_migration_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  v_tasks jsonb;
  v_products jsonb;
  v_buckets jsonb;
  v_tasks_toast_bytes bigint := 0;
  v_products_toast_bytes bigint := 0;
  c_est_note text :=
    'Estimativa por REGISTRO (nao por foto): conta linhas cujo campo photos nao e NULL. '
    || 'Nao distingue array vazio de array preenchido, pois isso exigiria detoast integral da coluna.';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente administradores';
  END IF;

  -- Tamanho do TOAST lido do catalogo (custo zero de I/O nas tabelas).
  SELECT COALESCE(pg_total_relation_size(c.reltoastrelid), 0)
    INTO v_tasks_toast_bytes
  FROM pg_class c
  WHERE c.relname = 'tasks' AND c.relnamespace = 'public'::regnamespace;

  SELECT COALESCE(pg_total_relation_size(c.reltoastrelid), 0)
    INTO v_products_toast_bytes
  FROM pg_class c
  WHERE c.relname = 'products' AND c.relnamespace = 'public'::regnamespace;

  -- TASKS: somente null bitmap (photos IS NOT NULL) + anti-join com storage.objects.
  WITH storage_folders AS (
    SELECT DISTINCT NULLIF(split_part(o.name, '/', 1), '')::uuid AS owner_id
    FROM storage.objects o
    WHERE o.bucket_id = 'task-photos'
      AND split_part(o.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
  ),
  rec AS (
    SELECT t.id, (sf.owner_id IS NOT NULL) AS has_storage
    FROM public.tasks t
    LEFT JOIN storage_folders sf ON sf.owner_id = t.id
    WHERE t.photos IS NOT NULL
  )
  SELECT jsonb_build_object(
    -- compatibilidade de frontend: mesmo nome, semantica documentada abaixo
    'base64_count', COUNT(*) FILTER (WHERE NOT has_storage),
    'records_with_database_photos', COUNT(*) FILTER (WHERE NOT has_storage),
    'base64_count_is_record_estimate', true,
    'base64_count_note', c_est_note,
    'storage_count', (SELECT COUNT(*) FROM storage.objects o WHERE o.bucket_id = 'task-photos'),
    'storage_count_unit', 'files_in_bucket',
    'records_with_storage_photos', COUNT(*) FILTER (WHERE has_storage),
    'base64_bytes', v_tasks_toast_bytes,
    'toast_estimated_bytes', v_tasks_toast_bytes,
    'bytes_estimated', true,
    'bytes_source', 'table_toast_total',
    'bytes_note', 'Estimativa do TOAST total da tabela tasks (todas as colunas grandes), nao o tamanho exato das fotos Base64.',
    'mixed_records', 0,
    'mixed_records_available', false,
    'mixed_records_note', 'Indisponivel: identificar registros com Base64 e Storage simultaneamente exigiria ler o conteudo da coluna photos.',
    'records_with_photos', COUNT(*),
    'records_with_photos_estimated', true,
    'records_with_photos_note', c_est_note
  )
  INTO v_tasks
  FROM rec;

  -- PRODUCTS: o bucket product-photos usa path por task_id, portanto nao ha como
  -- associar arquivos a um product_id especifico. Nao fabricamos contagem por produto.
  SELECT jsonb_build_object(
    'base64_count', COUNT(*),
    'records_with_database_photos', COUNT(*),
    'base64_count_is_record_estimate', true,
    'base64_count_note', c_est_note
      || ' Nao e possivel excluir produtos ja migrados: o path do bucket product-photos e baseado em task_id, sem product_id.',
    'storage_count', (SELECT COUNT(*) FROM storage.objects o WHERE o.bucket_id = 'product-photos'),
    'storage_count_unit', 'files_in_bucket',
    'records_with_storage_photos', NULL,
    'base64_bytes', v_products_toast_bytes,
    'toast_estimated_bytes', v_products_toast_bytes,
    'bytes_estimated', true,
    'bytes_source', 'table_toast_total',
    'bytes_note', 'Estimativa do TOAST total da tabela products (todas as colunas grandes), nao o tamanho exato das fotos Base64.',
    'mixed_records', 0,
    'mixed_records_available', false,
    'mixed_records_note', 'Indisponivel: o path do bucket product-photos nao contem product_id, logo nao ha como determinar por produto a coexistencia de Base64 e Storage.',
    'records_with_photos', COUNT(*),
    'records_with_photos_estimated', true,
    'records_with_photos_note', c_est_note
  )
  INTO v_products
  FROM public.products pr
  WHERE pr.photos IS NOT NULL;

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
    'generated_at', now(),
    'metrics_disclaimer', 'Relatorio de baixo custo: contagens por registro sao estimativas e os bytes referem-se ao TOAST total das tabelas. Nenhuma coluna photos e lida.'
  );
END;
$function$;