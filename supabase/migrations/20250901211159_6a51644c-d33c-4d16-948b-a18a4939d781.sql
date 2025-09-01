-- Função para obter contagem de usuários por filial
CREATE OR REPLACE FUNCTION public.get_filial_user_counts()
RETURNS TABLE(
  id uuid,
  nome text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  user_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id,
    f.nome,
    f.created_at,
    f.updated_at,
    COALESCE(COUNT(p.id), 0) as user_count
  FROM public.filiais f
  LEFT JOIN public.profiles p ON p.filial_id = f.id AND p.approval_status = 'approved'
  GROUP BY f.id, f.nome, f.created_at, f.updated_at
  ORDER BY f.nome ASC;
END;
$$;