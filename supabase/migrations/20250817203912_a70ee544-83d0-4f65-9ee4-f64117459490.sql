-- Create secure RPC function for role updates
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if current user can modify the target user's role
  IF NOT can_modify_user_role(target_user_id, new_role) THEN
    RAISE EXCEPTION 'insufficient privilege';
  END IF;
  
  -- Update the role
  UPDATE public.profiles
  SET role = new_role
  WHERE user_id = target_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;