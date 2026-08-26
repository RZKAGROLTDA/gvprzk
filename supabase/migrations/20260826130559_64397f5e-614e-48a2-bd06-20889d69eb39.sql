REVOKE EXECUTE ON FUNCTION public.my_day_scope() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_day_role_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_day_assert_target(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_day_summary_build(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_day_details_build(uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_day_user_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_day_user_details(uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_day_team_summary(uuid, text, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.my_day_role_of(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.my_day_assert_target(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.my_day_summary_build(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.my_day_details_build(uuid, text, text, integer, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.my_day_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_user_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_user_details(uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_team_summary(uuid, text, uuid) TO authenticated;