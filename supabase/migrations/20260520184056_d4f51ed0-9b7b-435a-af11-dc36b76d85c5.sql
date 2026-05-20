
CREATE OR REPLACE FUNCTION public.ensure_campaign_client_master(
  p_client_code text,
  p_client_name text
)
RETURNS public.campaign_clients_master
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.campaign_clients_master;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_client_code IS NULL OR length(trim(p_client_code)) = 0 THEN
    RAISE EXCEPTION 'client_code required';
  END IF;
  IF p_client_name IS NULL OR length(trim(p_client_name)) = 0 THEN
    RAISE EXCEPTION 'client_name required';
  END IF;

  INSERT INTO public.campaign_clients_master (client_code, client_name, source, created_by)
  VALUES (trim(p_client_code), trim(p_client_name), 'manual', auth.uid())
  ON CONFLICT (client_code) DO UPDATE
    SET client_name = EXCLUDED.client_name,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_campaign_client_master(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_campaign_client_master(text, text) TO authenticated;
