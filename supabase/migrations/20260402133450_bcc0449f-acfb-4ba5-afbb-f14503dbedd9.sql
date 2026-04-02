
-- Drop the overloaded versions with timestamp/uuid signatures
DROP FUNCTION IF EXISTS public.get_management_seller_summary(
  timestamp with time zone, timestamp with time zone, text, text, uuid, text[]
);

DROP FUNCTION IF EXISTS public.get_management_client_details(
  timestamp with time zone, timestamp with time zone, text, text, uuid, text[]
);
