DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.filiais WHERE lower(translate(trim(nome),'âÂ','aA')) = 'tailandia' ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.filiais (nome) VALUES ('Tailândia') RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.projection_filial_divisional (filial_id, divisional, incluida)
  VALUES (v_id, 'PA', true)
  ON CONFLICT (filial_id) DO UPDATE SET divisional = 'PA', incluida = true, updated_at = now();
END $$;