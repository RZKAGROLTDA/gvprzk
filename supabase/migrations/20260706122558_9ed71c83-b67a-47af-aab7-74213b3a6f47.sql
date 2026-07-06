
CREATE OR REPLACE FUNCTION public.get_equipment_validators()
RETURNS TABLE(
  user_id uuid,
  name text,
  filial_id uuid,
  filial_nome text,
  validated_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.name,
    p.filial_id,
    f.nome AS filial_nome,
    COUNT(ce.id) AS validated_count
  FROM public.client_equipment ce
  JOIN public.profiles p ON p.user_id = ce.validated_by
  LEFT JOIN public.filiais f ON f.id = p.filial_id
  WHERE ce.validated_by IS NOT NULL
    AND auth.uid() IS NOT NULL
  GROUP BY p.user_id, p.name, p.filial_id, f.nome
  ORDER BY COUNT(ce.id) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_validators() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_equipment_validators() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_validators() TO authenticated;
