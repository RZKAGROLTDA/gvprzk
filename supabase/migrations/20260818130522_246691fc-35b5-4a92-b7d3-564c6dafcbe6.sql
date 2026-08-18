ALTER TABLE public.campaign_rules
  ADD COLUMN IF NOT EXISTS discount_periods jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.campaign_rules
SET discount_periods = (
  SELECT COALESCE(jsonb_agg(p ORDER BY ord), '[]'::jsonb)
  FROM (
    VALUES ('Abril', gained_april, 1), ('Maio', gained_may, 2), ('Junho', gained_june, 3)
  ) AS t(label, pct, ord),
  LATERAL (SELECT jsonb_build_object('label', label, 'percent', pct) AS p) x
  WHERE COALESCE(pct, 0) > 0
)
WHERE discount_periods = '[]'::jsonb;