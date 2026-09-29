REVOKE EXECUTE ON FUNCTION public.equipment_regularization_register_send(uuid, text[], text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.equipment_regularization_start_validation(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.equipment_regularization_conclude(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.equipment_regularization_remove_item(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.equipment_regularization_list_batches(text, uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.equipment_regularization_is_locked(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.equipment_regularization_is_regularized(uuid) FROM PUBLIC, anon;