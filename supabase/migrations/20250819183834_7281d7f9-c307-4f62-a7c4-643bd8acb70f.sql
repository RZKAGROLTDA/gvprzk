-- Insert some sample filiais for testing
INSERT INTO public.filiais (nome) VALUES 
  ('São Paulo - Centro'),
  ('Rio de Janeiro - Zona Sul'),
  ('Belo Horizonte - Savassi'),
  ('Brasília - Asa Norte'),
  ('Porto Alegre - Centro Histórico'),
  ('Salvador - Pelourinho'),
  ('Recife - Boa Viagem'),
  ('Fortaleza - Aldeota'),
  ('Curitiba - Batel'),
  ('Goiânia - Setor Oeste')
ON CONFLICT DO NOTHING;