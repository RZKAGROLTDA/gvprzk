-- Create secure function to update user filial
CREATE OR REPLACE FUNCTION public.update_user_filial_secure(
  target_user_id uuid,
  new_filial_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
  target_user_exists boolean;
  result_data jsonb;
BEGIN
  -- Get current user's role to verify authorization
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid()
  AND approval_status = 'approved';
  
  -- Only managers can update user filials
  IF current_user_role != 'manager' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access denied: Manager role required'
    );
  END IF;
  
  -- Verify target user exists
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = target_user_id
  ) INTO target_user_exists;
  
  IF NOT target_user_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Target user not found'
    );
  END IF;
  
  -- Verify filial exists if not null
  IF new_filial_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.filiais WHERE id = new_filial_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Filial not found'
      );
    END IF;
  END IF;
  
  -- Update the user's filial
  UPDATE public.profiles 
  SET 
    filial_id = new_filial_id,
    updated_at = now()
  WHERE user_id = target_user_id;
  
  -- Log the operation for security audit
  PERFORM public.secure_log_security_event(
    'user_filial_updated',
    auth.uid(),
    jsonb_build_object(
      'target_user_id', target_user_id,
      'new_filial_id', new_filial_id,
      'updated_by_role', current_user_role
    ),
    2
  );
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Filial updated successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error for debugging
    PERFORM public.secure_log_security_event(
      'user_filial_update_error',
      auth.uid(),
      jsonb_build_object(
        'target_user_id', target_user_id,
        'error_message', SQLERRM,
        'error_state', SQLSTATE
      ),
      4
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Internal server error'
    );
END;
$$;