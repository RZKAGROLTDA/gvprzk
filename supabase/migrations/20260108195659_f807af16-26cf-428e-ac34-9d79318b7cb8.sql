-- Atualizar função create_secure_profile para exigir filial obrigatória
CREATE OR REPLACE FUNCTION public.create_secure_profile(
  user_id_param uuid,
  name_param text,
  email_param text,
  role_param text DEFAULT 'consultant',
  filial_id_param uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid;
BEGIN
  -- Validate required parameters
  IF user_id_param IS NULL OR name_param IS NULL OR email_param IS NULL THEN
    RAISE EXCEPTION 'User ID, name, and email are required';
  END IF;
  
  -- Filial é agora obrigatória
  IF filial_id_param IS NULL THEN
    RAISE EXCEPTION 'Filial é obrigatória para cadastro de usuário';
  END IF;
  
  -- Verificar se a filial existe
  IF NOT EXISTS (SELECT 1 FROM filiais WHERE id = filial_id_param) THEN
    RAISE EXCEPTION 'Filial inválida ou não encontrada';
  END IF;
  
  -- Insert profile with pending approval
  INSERT INTO profiles (
    user_id,
    name,
    email,
    role,
    filial_id,
    approval_status,
    registration_date
  ) VALUES (
    user_id_param,
    name_param,
    email_param,
    role_param,
    filial_id_param,
    'pending', -- Always pending for security
    now()
  ) RETURNING id INTO profile_id;
  
  -- Log profile creation for security monitoring
  PERFORM public.secure_log_security_event(
    'profile_created',
    user_id_param,
    jsonb_build_object(
      'profile_id', profile_id,
      'email', email_param,
      'role', role_param,
      'filial_id', filial_id_param,
      'approval_status', 'pending'
    ),
    2
  );
  
  RETURN profile_id;
END;
$$;