
DROP TABLE IF EXISTS public.diag_results;
CREATE TABLE public.diag_results (id serial primary key, label text, result text, created_at timestamptz default now());

INSERT INTO public.diag_results(label, result) VALUES
  ('prospection', public.diag_try_followup_insert('589cc3bd-e776-488e-b174-90d81c8c52a2')),
  ('ligacao',     public.diag_try_followup_insert('aea181c3-5893-41d0-ad2f-d174b09ca160')),
  ('checklist',   public.diag_try_followup_insert('85ddee4c-71c5-4fb2-9040-fd1289400f40'));
