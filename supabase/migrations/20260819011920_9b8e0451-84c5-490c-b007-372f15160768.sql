CREATE OR REPLACE FUNCTION public.seed_clients_master_legacy(p_batch_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
  v_block text[] := ARRAY[
    'AMEX CREDITO','AMEX CREDITO PARCELADO 03 PARC','AMEX CREDITO PARCELADO 04 PARC',
    'AMEX CREDITO PARCELADO 05 PARC','AMEX CREDITO PARCELADO 06 PARC','AMEX DEBITO',
    'BANCO DO BRASIL CARTAO VISA','CLIENTE PADRAO','CREDITO PARCELADO 05 PARC',
    'ELO CREDITO A VISTA','ELO CREDITO PARCELADO 03 PARC','ELO CREDITO PARCELADO 06 PARC',
    'ELO CREDITO PARCELADO 2 PARC','ELO CREDITO PARCELADO 4 PARC','MASTER CARD',
    'MASTER CREDITO 02 PARCELAS','VISA CREDITO 02 PARCELAS','VISA CREDITO 03 PARCELAS',
    'VISA CREDITO 04 PARCELAS','VISA CREDITO 05 PARCELAS','VISA CREDITO 06 PARCELAS',
    'VISA CREDITO A VISTA'];
BEGIN
  WITH raw AS (
    SELECT client_code AS code, client_name AS name, updated_at AS ts FROM public.client_equipment
    UNION ALL SELECT clientcode, client, updated_at FROM public.tasks
    UNION ALL SELECT client_code, client_name, updated_at FROM public.task_followups
    UNION ALL SELECT client_code, client_name, updated_at FROM public.visit_schedules
    UNION ALL SELECT client_code, client_name, updated_at FROM public.campaign_clients
    UNION ALL SELECT client_code, client_name, updated_at FROM public.campaign_clients_master
    UNION ALL SELECT client_code, client_name, updated_at FROM public.special_conditions
  ), cleaned AS (
    SELECT btrim(code) AS client_code,
           COALESCE(NULLIF(regexp_replace(btrim(code),'^0+',''),''),'0') AS client_code_norm,
           btrim(name) AS client_name,
           btrim(regexp_replace(
             regexp_replace(
               upper(translate(btrim(name),
                 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
                 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
               '[^A-Z0-9 ]',' ','g'),
             '\s+',' ','g')) AS client_name_norm,
           ts
    FROM raw
    WHERE code IS NOT NULL AND btrim(code) ~ '^[0-9]+$'
      AND name IS NOT NULL AND btrim(name) <> ''
  ), ranked AS (
    SELECT DISTINCT ON (client_code_norm) client_code, client_code_norm, client_name, client_name_norm
    FROM cleaned
    ORDER BY client_code_norm, ts DESC NULLS LAST, length(client_name) DESC
  )
  INSERT INTO public.clients_master (
    client_code, client_code_norm, client_name, client_name_norm,
    client_code_root, establishment_code, name_variants, source, import_batch_id
  )
  SELECT r.client_code, r.client_code_norm, r.client_name, r.client_name_norm,
         NULL, NULL,
         to_jsonb(ARRAY[r.client_name]), 'legacy_system', p_batch_id
  FROM ranked r
  WHERE r.client_name_norm <> ALL (v_block)
  ON CONFLICT (client_code_norm) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_clients_master_legacy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_clients_master_legacy(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_clients_master_legacy(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_clients_master_legacy(uuid) TO service_role;