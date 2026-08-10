ALTER TABLE public.team_vacations
  ADD CONSTRAINT team_vacations_date_range_sane
  CHECK (
    start_date BETWEEN '2020-01-01'::date AND '2100-12-31'::date
    AND end_date BETWEEN '2020-01-01'::date AND '2100-12-31'::date
    AND end_date >= start_date
  );