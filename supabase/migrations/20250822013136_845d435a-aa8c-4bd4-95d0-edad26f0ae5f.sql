-- Fix the clean_duplicate_tasks function to use correct table structure
CREATE OR REPLACE FUNCTION clean_duplicate_tasks()
RETURNS TABLE(
  action text,
  task_id uuid,
  client text,
  responsible text,
  created_at timestamp with time zone
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  duplicate_record record;
  tasks_to_keep uuid[];
  tasks_to_remove uuid[];
BEGIN
  -- Create a temporary table to store duplicates using public.tasks
  CREATE TEMP TABLE temp_duplicates AS
  SELECT 
    t1.id,
    t1.client,
    t1.responsible,
    t1.start_date,
    t1.sales_value,
    t1.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY t1.client, t1.responsible, t1.start_date, COALESCE(t1.sales_value, 0)
      ORDER BY t1.created_at ASC
    ) as rn
  FROM public.tasks t1
  WHERE EXISTS (
    SELECT 1 FROM public.tasks t2 
    WHERE t2.id != t1.id 
    AND t2.client = t1.client 
    AND t2.responsible = t1.responsible 
    AND t2.start_date = t1.start_date
    AND COALESCE(t2.sales_value, 0) = COALESCE(t1.sales_value, 0)
    AND ABS(EXTRACT(EPOCH FROM (t2.created_at - t1.created_at))) < 300 -- Within 5 minutes
  );

  -- Return information about duplicates found
  FOR duplicate_record IN 
    SELECT DISTINCT client, responsible, start_date, sales_value, COUNT(*) as duplicate_count
    FROM temp_duplicates
    GROUP BY client, responsible, start_date, sales_value
    HAVING COUNT(*) > 1
  LOOP
    RETURN QUERY SELECT 
      'DUPLICATE_GROUP'::text,
      NULL::uuid,
      duplicate_record.client,
      duplicate_record.responsible,
      NULL::timestamp with time zone;
  END LOOP;

  -- Get tasks to keep (first created in each group)
  SELECT array_agg(id) INTO tasks_to_keep
  FROM temp_duplicates 
  WHERE rn = 1;

  -- Get tasks to remove (all others)
  SELECT array_agg(id) INTO tasks_to_remove
  FROM temp_duplicates 
  WHERE rn > 1;

  -- Return tasks that will be kept
  FOR duplicate_record IN
    SELECT id, client, responsible, created_at
    FROM public.tasks
    WHERE id = ANY(tasks_to_keep)
  LOOP
    RETURN QUERY SELECT 
      'KEEPING'::text,
      duplicate_record.id,
      duplicate_record.client,
      duplicate_record.responsible,
      duplicate_record.created_at;
  END LOOP;

  -- Return tasks that will be removed
  FOR duplicate_record IN
    SELECT id, client, responsible, created_at
    FROM public.tasks
    WHERE id = ANY(tasks_to_remove)
  LOOP
    RETURN QUERY SELECT 
      'REMOVING'::text,
      duplicate_record.id,
      duplicate_record.client,
      duplicate_record.responsible,
      duplicate_record.created_at;
  END LOOP;

  -- Actually remove the duplicate tasks and their related data
  IF tasks_to_remove IS NOT NULL AND array_length(tasks_to_remove, 1) > 0 THEN
    -- Delete related products first
    DELETE FROM public.products WHERE task_id = ANY(tasks_to_remove);
    
    -- Delete related reminders
    DELETE FROM public.reminders WHERE task_id = ANY(tasks_to_remove);
    
    -- Delete the duplicate tasks
    DELETE FROM public.tasks WHERE id = ANY(tasks_to_remove);
  END IF;

  -- Clean up
  DROP TABLE temp_duplicates;
  
  RETURN QUERY SELECT 
    'CLEANUP_COMPLETE'::text,
    NULL::uuid,
    ''::text,
    ''::text,
    now()::timestamp with time zone;
END;
$$;