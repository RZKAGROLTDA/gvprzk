-- 1) Fonte histórica mínima (não é profile, não toca auth)
CREATE TABLE public.historical_users (
  user_id     uuid PRIMARY KEY,
  name        text NOT NULL,
  filial_id   uuid REFERENCES public.filiais(id),
  role        text,
  email       text,
  deleted_at  timestamptz,
  deleted_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.historical_users TO authenticated;
GRANT ALL    ON public.historical_users TO service_role;

ALTER TABLE public.historical_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados leem historico de usuarios removidos"
ON public.historical_users FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_historical_users_updated_at
BEFORE UPDATE ON public.historical_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Semente: apenas os dois removidos com histórico comprovado
INSERT INTO public.historical_users (user_id, name, filial_id, role, deleted_at, deleted_by)
VALUES
  ('ca723119-dca6-4b9c-bdd3-cb63aa9badb2','LUIS FERNANDO RODRIGUES DA SILVA',
   '15e25916-279d-4674-a283-7d8f589940f7','rac',
   '2026-07-17 21:08:57.170941+00','b6543a7f-3b83-42dc-aa69-930dcb56b21d'),
  ('4a31fa2e-b81b-427e-b07f-583dd6e2590e','Erminio Vieira lima',
   '9244b8f2-50cc-4939-9b29-980c926a04da', NULL,
   '2026-07-17 11:43:30.706318+00','b6543a7f-3b83-42dc-aa69-930dcb56b21d')
ON CONFLICT (user_id) DO NOTHING;

-- 3) Validadores: LEFT JOIN + cascata profiles → historical_users → equipamento
CREATE OR REPLACE FUNCTION public.get_equipment_validators()
 RETURNS TABLE(user_id uuid, name text, filial_id uuid, filial_nome text, validated_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT ce.validated_by AS uid, ce.id AS eq_id, ce.filial_id AS eq_filial_id
    FROM public.client_equipment ce
    WHERE ce.validated_by IS NOT NULL AND auth.uid() IS NOT NULL
  ), agg AS (
    SELECT b.uid,
           count(b.eq_id) AS validated_count,
           mode() WITHIN GROUP (ORDER BY b.eq_filial_id) AS eq_filial_id
    FROM base b GROUP BY b.uid
  )
  SELECT
    a.uid,
    COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(h.name), ''), 'Usuário inativo/removido'),
    COALESCE(p.filial_id, h.filial_id, a.eq_filial_id),
    COALESCE(f.nome, '—'),
    a.validated_count
  FROM agg a
  LEFT JOIN public.profiles p         ON p.user_id = a.uid
  LEFT JOIN public.historical_users h ON h.user_id = a.uid
  LEFT JOIN public.filiais f          ON f.id = COALESCE(p.filial_id, h.filial_id, a.eq_filial_id)
  ORDER BY a.validated_count DESC;
$function$;

-- 4) Resumo: mesma cascata de filial, sem eliminar linhas órfãs
CREATE OR REPLACE FUNCTION public.get_equipment_validation_summary()
 RETURNS TABLE(total_validated bigint, priority_validated bigint, non_priority_validated bigint,
               distinct_validated_clients bigint, by_filial jsonb)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH visible_validated AS (
    SELECT ce.validation_priority, ce.validated_by, ce.filial_id,
      CASE
        WHEN nullif(trim(ce.client_code), '') IS NOT NULL THEN 'c:' || lower(trim(ce.client_code))
        WHEN nullif(trim(ce.client_name), '') IS NOT NULL THEN 'n:' || lower(trim(ce.client_name))
        ELSE NULL
      END AS client_key
    FROM public.client_equipment ce
    WHERE ce.last_validation_at IS NOT NULL
  ), resolved AS (
    SELECT vv.validation_priority, vv.client_key,
           COALESCE(fp.nome, fh.nome, fe.nome, '—') AS filial_nome
    FROM visible_validated vv
    LEFT JOIN public.profiles p          ON p.user_id = vv.validated_by
    LEFT JOIN public.historical_users h  ON h.user_id = vv.validated_by
    LEFT JOIN public.filiais fp ON fp.id = p.filial_id
    LEFT JOIN public.filiais fh ON fh.id = h.filial_id
    LEFT JOIN public.filiais fe ON fe.id = vv.filial_id
  ), filial_counts AS (
    SELECT filial_nome,
      count(*) AS validated_count,
      count(*) FILTER (WHERE validation_priority IS TRUE) AS priority_count,
      count(*) FILTER (WHERE validation_priority IS DISTINCT FROM TRUE) AS non_priority_count,
      count(DISTINCT client_key) FILTER (WHERE client_key IS NOT NULL) AS client_count
    FROM resolved GROUP BY filial_nome
  )
  SELECT
    (SELECT count(*) FROM resolved),
    (SELECT count(*) FROM resolved WHERE validation_priority IS TRUE),
    (SELECT count(*) FROM resolved WHERE validation_priority IS DISTINCT FROM TRUE),
    (SELECT count(DISTINCT client_key) FROM resolved WHERE client_key IS NOT NULL),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'filial_nome', filial_nome, 'validated_count', validated_count,
      'priority_count', priority_count, 'non_priority_count', non_priority_count,
      'client_count', client_count) ORDER BY validated_count DESC) FROM filial_counts), '[]'::jsonb);
$function$;