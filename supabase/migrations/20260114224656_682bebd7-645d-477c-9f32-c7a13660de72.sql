-- Corrigir a função get_secure_tasks_with_customer_protection para ter ordem de colunas compatível com get_secure_tasks_paginated
DROP FUNCTION IF EXISTS get_secure_tasks_with_customer_protection();

CREATE OR REPLACE FUNCTION get_secure_tasks_with_customer_protection()
RETURNS TABLE (
  id uuid,
  name text,
  client text,
  clientcode text,
  property text,
  propertyhectares double precision,
  responsible text,
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  priority text,
  status text,
  task_type text,
  observations text,
  photos text[],
  documents text[],
  initial_km double precision,
  final_km double precision,
  equipment_quantity integer,
  equipment_list jsonb,
  family_product text,
  email text,
  phone text,
  filial text,
  is_prospect boolean,
  prospect_notes text,
  sales_confirmed boolean,
  sales_type text,
  sales_value double precision,
  partial_sales_value double precision,
  check_in_location jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  access_level text,
  is_customer_data_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Wrapper que chama a função paginada com limite de 500
  RETURN QUERY SELECT * FROM get_secure_tasks_paginated(500, 0);
END;
$$;