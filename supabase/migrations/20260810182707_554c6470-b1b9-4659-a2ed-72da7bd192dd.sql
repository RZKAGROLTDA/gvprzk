REVOKE EXECUTE ON FUNCTION public.can_view_equipment_park() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean) FROM anon;