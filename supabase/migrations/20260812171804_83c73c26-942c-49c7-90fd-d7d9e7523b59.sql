CREATE TABLE public.training_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_hours numeric NOT NULL CHECK (default_hours > 0),
  active boolean NOT NULL DEFAULT true,
  counts_for_goal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_catalog IS 'Catálogo oficial de treinamentos. Exclusão física proibida: itens obsoletos são desativados para preservar histórico.';
COMMENT ON COLUMN public.training_catalog.active IS 'Controla APENAS a disponibilidade do treinamento para novos agendamentos.';
COMMENT ON COLUMN public.training_catalog.counts_for_goal IS 'Define se o treinamento compõe a meta corporativa de horas. Desativar (active = false) NAO altera a meta.';

GRANT SELECT, INSERT, UPDATE ON public.training_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_catalog TO service_role;

ALTER TABLE public.training_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_catalog_select_authenticated"
ON public.training_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "training_catalog_insert_admin_manager"
ON public.training_catalog FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "training_catalog_update_admin_manager"
ON public.training_catalog FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_training_catalog_updated_at
BEFORE UPDATE ON public.training_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.prevent_training_catalog_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Exclusão de treinamentos do catálogo não é permitida. Desative o treinamento (active = false).';
END;
$$;

CREATE TRIGGER trg_training_catalog_no_delete
BEFORE DELETE ON public.training_catalog
FOR EACH ROW EXECUTE FUNCTION public.prevent_training_catalog_delete();

CREATE TABLE public.training_goal_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  goal_deadline date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_goal_settings IS 'Configuração da meta corporativa de treinamentos (linha única). Prazo configurável sem alterar a RPC.';

GRANT SELECT, UPDATE ON public.training_goal_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_goal_settings TO service_role;

ALTER TABLE public.training_goal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_goal_settings_select_authenticated"
ON public.training_goal_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "training_goal_settings_update_admin_manager"
ON public.training_goal_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_training_goal_settings_updated_at
BEFORE UPDATE ON public.training_goal_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.training_goal_settings (id, goal_deadline)
VALUES (true, DATE '2026-10-31')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS training_catalog_id uuid NULL REFERENCES public.training_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trainings_catalog_id ON public.trainings(training_catalog_id);
CREATE INDEX IF NOT EXISTS idx_trainings_status ON public.trainings(status);

INSERT INTO public.training_catalog (name, default_hours) VALUES
('Administrativo - Desenvolvimento de Showroom de Varejo', 1.0),
('Administrativo - Experiência do Cliente Pilar Conhecimento', 0.5),
('Administrativo - Experiência do Cliente Pilar Cultura', 0.5),
('Administrativo - Experiência do Cliente Pilar Governança', 0.5),
('Administrativo - Experiência do Cliente Pilar Inovação', 1.0),
('Administrativo - Fundamentos da Marca', 1.0),
('Administrativo - Gestão de Pedidos de Peças', 8.0),
('Administrativo - Histórico da John Deere', 1.0),
('Administrativo - Prevenção à Lavagem de Dinheiro e Risco & Compliance', 1.0),
('Administrativo - Treinamento de Marca para Concessionários', 1.0),
('Administrativo - Treinamento de Marca para Concessionários Introdução', 0.6),
('Administrativo - Uso e Proteção da Marca', 1.5),
('Agrícola de Precisão - Visão Geral Técnica da Conectividade JDLink ™', 6.0),
('Agronomia - Introdução à Agronomia (Em breve - Comunicaremos assim que estiver disponível)', 14.0),
('Algodão – Introdução Técnica da Classe C770', 0.5),
('AP - AutoTrac™ Universal 300 Introduçao Técnica', 2.5),
('AP - Monitores Geração 4 Introdução Técnica', 1.0),
('Aplicação - ExactApply™ Introdução Técnica', 14.0),
('Aplicação - Pulverizadores Série M4000 - Introdução Técnica', 8.0),
('Aplicador - Introdução Técnica ao Distribuidor de Nutrientes', 7.5),
('C&CS - Conceito e Estratégia', 11.0),
('Caixa Picador - Unimil', 0.5),
('Caminho para o sucesso: Estratégias para calcular o potencial de vendas', 3.0),
('Cane Advisor - Monitor de Colheita com SmartClean™', 22.5),
('Colhedora de Cana CH950 e CH960 - Visão Geral de Vendas', 21.0),
('Colhedoras de Cana - Introducao Tecnica', 7.0),
('Colhedoras de Cana - Série CH570 e CH670 Introdução Técnica', 64.0),
('Colhedoras de Cana - Série CH950 Introdução Técnica', 2.0),
('Colhedoras de Cana CH570 e CH670 - Comparativo com Outras Marcas', 48.0),
('Colhedoras de Cana CH570 e CH670 - Operação e Ajustes', 46.0),
('Colhedoras de Cana CH570 e CH670 - Visão Geral de Vendas', 56.0),
('Colhedoras de Cana CH950 - Comparativo com Outras Marcas', 26.0),
('Colheitadeira - Avaliação da Introdução Técnica da Série S (S5 e S7)', 11.5),
('Colheitadeira – Introdução Técnica do Chassi / Trem de Acionamento das Séries S e T', 11.5),
('Colheitadeira – Introdução Técnica dos Sistemas Elétricos das Séries S e T', 10.0),
('Colheitadeira – Introdução Técnica dos Sistemas Hidráulicos das Séries S e T', 10.0),
('Colheitadeiras – Introdução Técnica das Séries S5 e S7', 7.0),
('Colheitadeiras de Grãos - Guia de Venda de Valor Série S700 Avaliação', 3.0),
('Colheitadeiras de Grãos - Plataforma Série 730FD Arrozeira Introdução Técnica', 8.0),
('Colheitadeiras de Grãos - Série S700 Introdução Técnica', 12.0),
('Colheitadeiras S5 e S7 - Operação e Ajustes', 2.0),
('Colheitadeiras S7 - Visão Geral de Vendas', 1.5),
('Colheitadeiras Série S700 e S550 - Operação e Ajustes', 12.0),
('Combine – T-Series Harvesting Systems Technical Introduction', 0.5),
('Como Financiar pelo Banco John Deere - Agrícola', 5.0),
('Conceito e Aplicação - Funcionalidades do Operations Center', 4.0),
('Conceito e Aplicação - Funcionalidades dos Monitores John Deere', 12.0),
('Condições de Financiamento - Peças e Serviços', 1.0),
('Conectividade, Gerenciamento de Dados e Operações - Visão Geral', 1.0),
('Distribuidor de Nutrientes Série M4040DN - Comparativo com Outras Marcas', 3.0),
('Distribuidor de Nutrientes Série M4040DN - Operação e Ajustes', 1.0),
('Distribuidor de Nutrientes Série M4040DN - Visão Geral de Vendas', 2.0),
('DSH - Pontas de Pulverização TeeJet Technologies', 17.0),
('DSH - Soluções para Aplicação Forquímica', 14.0),
('DSH - Tecnologias Titan aplicadas a Pneus Agrícolas', 12.0),
('Estratégias Eficazes do Balcão', 9.0),
('ExpertConnect™ Domine seu Centro de Contato com o Cliente', 6.0),
('Finanças para Não Financeiros', 1.0),
('Fundamentos Agronômicos - Cana-de-açúcar vILT - Avaliação', 6.0),
('Fundamentos Agronômicos - Grãos vILT - Avaliação', 6.0),
('Fundamentos da Aplicação e Pulverização', 16.0),
('Gerenciamento de Peças de Varejo: Quatro Principais Indicadores de Desempenho + Amplitude', 3.0),
('Gestão de Divergências e Recompra', 4.0),
('Habilidades de Vendas - Habilidades de Atendimento ao Cliente', 12.0),
('Impulsionando o Sucesso dos Concessionários com RPM', 32.0),
('Introdução Técnica de Colheitadeira - Plataforma do Operador/Tecnologia Avançada', 10.0),
('Introdução Técnica do Trator da Série 7M', 6.0),
('John Deere Precision Upgrades - Conceito & Estratégia', 10.0),
('John Deere Precision Upgrades - Kit de Instalação para Pulverizadores', 3.0),
('Master Sales - Baterias Clarios - Tecnologia, Potencial e Estratégias Comerciais', 1.0),
('Monitores - Visão Geral', 3.0),
('Motores - Avaliação Introdução e Diagnóstico em Sistemas Elétricos', 1.0),
('Motores - Avaliação Sistemas de Ar e Exaustão', 1.0),
('Motores - Avaliação Sistemas de Combustível', 1.0),
('Motores - Avaliação Sistemas de Lubrificação e Arrefecimento', 1.0),
('Motores - Introdução a Motores Diesel John Deere', 6.0),
('Motores - Introdução Básica Motores Diesel', 3.0),
('Motores - Visão Geral dos Sistemas de Combustível', 2.0),
('Motores - Visão Geral dos Sistemas Elétricos', 8.0),
('Orientação, Automação e Autonomia - Visão Geral', 2.0),
('Pacote Essencial - PUK', 5.0),
('Peças - Introdução à peça certa pelo preço certo', 7.0),
('Peças - Venda de aditivos de combustível', 8.0),
('Peças - Venda de filtros', 10.0),
('Peças - Venda de Graxa', 10.0),
('Peças - Venda de Líquidos de Arrefecimento', 6.0),
('Peças - Venda de Óleo de Motor', 5.0),
('Peças - Venda de óleos hidráulicos e de transmissão', 8.0),
('Peças - Venda de produtos químicos', 7.0),
('Peças - Vendas de Componentes John Deere REMAN', 1.0),
('Peças & Produtos de Alta perfomance - Vendas de mangueiras hidráulicas', 7.0),
('Peças & Produtos de Alta Performance - Venda de Baterias', 3.0),
('Plantadeira - Avaliação da Introdução Técnica', 6.0),
('Plantadeira - Introdução Técnica das Unidades de Linha', 4.0),
('Plantadeira – Introdução Técnica de Modelos e Estruturas', 3.0),
('Plantadeira - Introdução Técnica do Sistema de Fertilizantes', 4.0),
('Plantadeira - Introdução Técnica dos Sistemas Base', 4.0),
('Plantadeira – Introdução Técnica dos Sistemas de Monitoramento', 5.0),
('Plantadeiras - Linhas EmergePRO™ Introdução Técnica', 12.0),
('Plantadeiras - Tanque de Inoculante GreenSystem™ Introdução Técnica', 24.0),
('Plantadeiras 2100 Precision Upgrades - Operação e ajustes', 12.5),
('Plantadeiras 2100 Precision Upgrades - Visão Geral de Vendas', 4.0),
('Plantadeiras DB ExactEmerge™, MaxEmerge™5e e MaxEmerge™5 - Comparativo com Outras Marcas', 1.5),
('Plantadeiras DB MaxEmerge™ 5e e ExactEmerge™ - Introdução Técnica', 24.0),
('Plantadeiras Elétricas Série DB: Avaliação Final - Operação e Ajustes', 19.0),
('Plantadeiras Elétricas Série DB: Caixa Central de Semente (CCS) e Vácuo - Operação e Ajustes', 9.0),
('Plantadeiras Elétricas Série DB: Dosadores ExactEmerge™ e MaxEmerge™ 5e - Operação e Ajustes', 9.0),
('Plantadeiras Elétricas Série DB: Linha de plantio EmergePro™ - Operação e Ajustes', 9.0),
('Plantadeiras Elétricas Série DB: Pressão Pneumática na Linha de Plantio - Operação e Ajustes', 9.0),
('Plantadeiras Elétricas Série DB: SeedStar™ 4HP e Tecnologias - Operação e Ajustes', 6.0),
('Plantadeiras Elétricas Série DB: Visão Geral - Operação e Ajustes', 16.0),
('Plantadeiras Série 1200 - Visão Geral de Vendas', 1.0),
('Plantadeiras Série DB - Visão Geral de Vendas', 0.5),
('Pós-vendas: Mercado, Oportunidades e Estratégias de Sucesso com as Soluções para o ciclo de Vida', 34.0),
('Potencializando as Vendas de Peças e Serviços com o PoPS', 33.0),
('Potencializando o Uso de Tecnologias e Entrega de Valor para o cliente', 12.0),
('Pré Avaliação do Desafios de Habilidades Mastertec', 4.0),
('Precision Upgrades Colheitadeiras - Operação e Ajustes', 2.0),
('Precision Upgrades para Colheitadeiras - Visão Geral de Vendas', 1.0),
('Preparo - Grades Aradoras e Niveladoras GreenSystem™ Introdução Técnica', 2.0),
('Processo Dólar - Banco John Deere', 1.0),
('Pulverizador - Avaliação de Introdução Técnica das Séries 400 e 600', 11.0),
('Pulverizador - Introdução Técnica ao Controle dos Bicos​', 9.5),
('Pulverizador - Introdução Técnica da Visão Geral dos Sistemas das Séries 400 e 600', 9.0),
('Pulverizador - Introdução Técnica do Sistema de Solução das Séries 400 e 600', 10.5),
('Pulverizador - Introdução Técnica Elétrica/Eletrônica das Séries 400 e 600', 10.0),
('Pulverizador - Introdução Técnica Hidráulica/Hidrostática das Séries 400 e 600', 10.0),
('Pulverizador - See & Spray™ Gen 2 Introdução Técnica', 14.0),
('Pulverizador - See & Spray™ Select Introdução Técnica', 1.0),
('Pulverizadores - M4000 Mudanças e Evoluções Técnica MY23', 4.5),
('Pulverizadores - M4000 Mudanças e Evoluções Técnicas MY24', 3.0),
('Pulverizadores M4000 - Operação e Ajustes', 12.0),
('Pulverizadores Serie M4000 - Comparativo com Outras Marcas', 2.0),
('Pulverizadores Serie M4000 - Visão Geral de Vendas', 5.0),
('Receptores e RTK - Visão Geral', 6.0),
('See & Spray™ Select - Operação e Ajustes', 3.0),
('See & Spray™ Select - Visão Geral de Vendas', 10.0),
('Segmentação de Clientes e Estratégia do Negócio', 13.0),
('Semifinal MasterSales 2026 - Brasil', 21.0),
('Shop.Deere - Visão Geral do E-commerce de Peças', 8.0),
('Sistema do Extrator Secundário - Unimil', 1.0),
('Sistemas - Balcão Digital', 8.0),
('Sistemas – Introdução ao John Deere Connected Support™', 8.0),
('Sistemas - Metrologia Dimensional Básica', 6.0),
('Sistemas - Service Admin Portal e Expert Alerts', 12.0),
('Sistemas - Sistema de Garantias John Deere - PMPs', 4.0),
('Sistemas - Sistema de Garantias John Deere - Reivindicações', 4.0),
('Sistemas - Sistema de Garantias John Deere Rastreamento de Produto', 4.0),
('Sistemas - Sistema de Garantias John Deere Visão Geral e Aplicação', 3.5),
('Sistemas Elétricos e Eletrônicos 1', 1.5),
('Sistemas Elétricos e Eletrônicos 2', 1.5),
('Sistemas Elétricos e Eletrônicos 4', 1.5),
('Sistemas Hidráulicos - MPG01 Analisador Digital', 6.0),
('Sistemas Hidráulicos e Hidrostáticos 4', 3.0),
('Sistemas Técnicos – Teste de Diagnóstico dos Sistemas Hidráulico/Hidrostático', 1.0),
('Soluções de Plantio GreenSystem™ - Visão Geral de Vendas', 1.0),
('Suporte Técnico de Peças - Conceitos Básicos', 4.0),
('Tecnologia de Aplicação - Visão Geral de Vendas', 7.0),
('Tecnologias de Aplicação - Operação e Ajustes', 6.0),
('Tecnologias de Plantio - Visão Geral de Vendas', 4.0),
('Trator – Introdução técnica à Série 7M', 6.0),
('Trator – Introdução Técnica das Séries 7M', 6.0),
('Tratores - Introdução Técnica Série 9 MY22', 11.0),
('Tratores - Série 5E MAR-I Introdução Técnica', 4.0),
('Tratores - Série 6M Introdução Técnica', 6.0),
('Tratores - Série 8R MAR-I Introdução Técnica', 26.0),
('Tratores 6J - Introdução Técnica', 2.0),
('Tratores Série 6J - Comparativo com Outras Marcas', 1.0),
('Tratores Série 6J - Visão Geral de Vendas', 1.0),
('Tratores Série 6M - Operação e Ajustes', 5.0),
('Tratores Série 7J – Introdução Técnica', 14.0),
('Tratores Série 7M - Operação e Ajustes', 7.5),
('Tratores Série 7M - Visão Geral de Vendas', 8.0),
('Tratores Série 8R e 9R - Operação e Ajustes', 34.0),
('Tratores Série 9 - Introdução de Vendas', 0.5),
('Vendas Incrementais com o PartsAdvisor', 24.0),
('Visão Geral da Instalação de Precision Upgrades', 3.0),
('Visão Geral de Vendas e Marketing do Motor 13.6L', 1.5),
('Visão Geral do CCMS (DTAC, DPAC, DMAC)', 7.0),
('Visão Geral dos Sistemas de Detecção de Material da Tecnologia de Precisão', 2.0),
('Visão Geral e Avaliação do Parts ADVISOR™', 3.0)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_training_goal()
RETURNS TABLE (
  total_hours numeric,
  realized_hours numeric,
  pending_hours numeric,
  execution_percent numeric,
  deadline date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_realized numeric;
  v_deadline date;
BEGIN
  -- REGRA DE NEGOCIO DA META CORPORATIVA DE TREINAMENTOS:
  -- 1) Meta total = soma de default_hours dos itens do catalogo com counts_for_goal = true.
  --    Nao existe valor fixo na funcao. A coluna active controla apenas a disponibilidade
  --    do treinamento para novos agendamentos e NAO altera a meta historica.
  -- 2) Horas realizadas sao contadas POR COLABORADOR: cada registro de trainings com
  --    status = 'realizado' soma suas proprias horas.
  --    Ex.: treinamento de 8h concluido por 10 colaboradores = 80h realizadas.
  -- 3) Status 'pendente' e 'nao_realizado' NAO reduzem a meta.
  -- 4) Horas pendentes nunca ficam negativas; % execucao limitado a 100%.
  -- 5) Prazo vem de public.training_goal_settings (configuravel, sem alterar esta RPC).
  -- 6) Indicador global: NAO sofre influencia dos filtros da tela.
  SELECT COALESCE(SUM(default_hours), 0) INTO v_total
  FROM public.training_catalog
  WHERE counts_for_goal = true;

  SELECT COALESCE(SUM(hours), 0) INTO v_realized
  FROM public.trainings
  WHERE status = 'realizado';

  SELECT goal_deadline INTO v_deadline
  FROM public.training_goal_settings
  WHERE id = true;

  RETURN QUERY SELECT
    v_total,
    v_realized,
    GREATEST(v_total - v_realized, 0),
    CASE WHEN v_total > 0 THEN ROUND(LEAST(v_realized / v_total, 1) * 100, 1) ELSE 0 END,
    v_deadline;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_training_goal() TO authenticated;