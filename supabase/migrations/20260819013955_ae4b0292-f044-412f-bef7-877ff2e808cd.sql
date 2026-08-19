CREATE OR REPLACE FUNCTION public.resolve_client_name_conflict(
  p_id uuid,
  p_new_name text,
  p_resolution_type text DEFAULT 'choose'
)
RETURNS public.clients_master
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.clients_master;
  v_normalized text;
  v_variants jsonb;
  v_has_access boolean;
BEGIN
  -- Apenas admin ou manager podem resolver conflitos
  v_has_access := COALESCE(public.has_role(auth.uid(), 'admin'), false)
               OR COALESCE(public.has_role(auth.uid(), 'manager'), false);

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores ou gerentes podem resolver conflitos de nome.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Busca o registro atual
  SELECT * INTO v_record
  FROM public.clients_master
  WHERE id = p_id;

  IF v_record IS NULL THEN
    RAISE EXCEPTION 'Registro não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_record.name_conflict THEN
    RAISE EXCEPTION 'O registro não está marcado como conflito.' USING ERRCODE = 'check_violation';
  END IF;

  -- Valida tipo de resolução
  IF p_resolution_type NOT IN ('choose', 'manual') THEN
    RAISE EXCEPTION 'Tipo de resolução inválido.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Normaliza o novo nome
  v_normalized := btrim(regexp_replace(
    regexp_replace(
      upper(translate(btrim(p_new_name),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
      '[^A-Z0-9 ]',' ','g'),
    '\s+',' ','g'));

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'O nome não pode ficar vazio após a normalização.' USING ERRCODE = 'check_violation';
  END IF;

  -- Atualiza variantes: preserva as existentes e adiciona o nome manual se ainda não estiver lá
  v_variants := COALESCE(v_record.name_variants, '[]'::jsonb);
  IF p_resolution_type = 'manual' AND NOT (v_variants @> to_jsonb(ARRAY[btrim(p_new_name)])) THEN
    v_variants := v_variants || to_jsonb(btrim(p_new_name));
  END IF;

  -- Atualiza o registro
  UPDATE public.clients_master
  SET
    client_name = btrim(p_new_name),
    client_name_norm = v_normalized,
    name_conflict = false,
    name_variants = v_variants,
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_client_name_conflict(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_client_name_conflict(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_client_name_conflict(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_client_name_conflict(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.resolve_client_name_conflict(uuid, text, text) IS
  'Resolve um conflito de nome em clients_master. Requer papel admin ou manager.';