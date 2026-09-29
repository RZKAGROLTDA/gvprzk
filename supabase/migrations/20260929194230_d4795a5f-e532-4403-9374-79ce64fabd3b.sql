DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.equipment_regularization_create_batch'::regproc);
  IF position('v_situation := public.equipment_regularization_situation_norm(v_eq.machine_status);' in d) = 0 THEN
    RAISE EXCEPTION 'trecho esperado nao encontrado';
  END IF;
  d := replace(d, 'v_situation := public.equipment_regularization_situation_norm(v_eq.machine_status);',
    'v_situation := CASE WHEN v_eq.machine_status = ''sucateada'' THEN ''sucata'' WHEN v_eq.machine_status IN (''vendida'',''inativa'') THEN v_eq.machine_status ELSE NULL END;');
  EXECUTE d;
END
$mig$;