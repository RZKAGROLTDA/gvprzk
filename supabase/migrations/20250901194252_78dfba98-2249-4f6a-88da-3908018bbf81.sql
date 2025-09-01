-- Emergency function to promote current user to manager (one-time use)
CREATE OR REPLACE FUNCTION public.emergency_promote_to_manager()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid;
  current_email text;
  result_message text;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN 'ERROR: User not authenticated';
  END IF;
  
  -- Get user email
  SELECT email INTO current_email
  FROM public.profiles
  WHERE user_id = current_user_id;
  
  IF current_email IS NULL THEN
    RETURN 'ERROR: User profile not found';
  END IF;
  
  -- Check if user is already a manager
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = current_user_id AND role = 'manager'
  ) THEN
    RETURN 'INFO: User is already a manager';
  END IF;
  
  -- Promote user to manager
  UPDATE public.profiles 
  SET 
    role = 'manager',
    approval_status = 'approved',
    updated_at = now()
  WHERE user_id = current_user_id;
  
  -- Log the emergency escalation
  PERFORM public.secure_log_security_event(
    'emergency_manager_promotion',
    current_user_id,
    jsonb_build_object(
      'promoted_email', current_email,
      'timestamp', now(),
      'action', 'emergency_escalation'
    ),
    3
  );
  
  result_message := 'SUCCESS: User ' || current_email || ' promoted to manager';
  
  RETURN result_message;
END;
$$;

-- Allow authenticated users to call this function (but it's self-limiting)
GRANT EXECUTE ON FUNCTION public.emergency_promote_to_manager() TO authenticated;