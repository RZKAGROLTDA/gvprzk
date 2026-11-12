# Aba PROJEÇÃO — Metas e Projeções de Vendas

## Decisões já tomadas
- Todas as filiais cadastradas entram, exceto **Tele Vendas**.
- O cadastro atual não tem divisional. O administrador define a divisional (MT, GO, PA) de cada filial na própria aba Projeção, uma única vez. As filiais e os cadastros existentes não são alterados.
- Metas: cadastro manual na tela + importação de planilha Excel (colunas Filial, Mês, Ano, Meta), com prévia antes de gravar.

## O que o usuário verá
- Novo item **Projeção** no menu principal, visível só para Administrador, Gerente e Supervisor.
- **Painel**: filtros por mês, ano, divisional e filial. Cartões com o consolidado geral e por divisional. Tabela com todas as filiais: meta, última projeção sem risco e com risco, % de atingimento, % acima/abaixo da meta, GAP em R$, semana da última atualização e a evolução S1–S4. Filiais sem lançamento aparecem como **PENDENTE**, nunca como zero. Botão Exportar Excel.
- **Lançamento (Supervisor)**: escolhe a semana (1 a 4) e informa a projeção sem risco, a projeção com risco e uma observação opcional. Cada semana fica guardada separadamente. A semana 3 não apaga a semana 2, e as semanas nunca são somadas.
- **Metas (Administrador)**: edição na tela ou importação; cada alteração guarda o histórico.

## Cálculos
- Última projeção = a semana mais recente lançada no mês.
- Atingimento = projeção ÷ meta. Crescimento/queda = (projeção ÷ meta − 1). GAP = projeção − meta.
- Consolidados: somam metas e últimas projeções apenas das filiais que já lançaram. Mostram também quantas filiais estão pendentes.

## Permissões (aplicadas no banco)
- Administrador: tudo. É o único que cadastra metas e divisionais.
- Gerente: visualiza as filiais autorizadas, conforme o acesso de gestão atual.
- Supervisor: vê e lança apenas na sua Filial Ativa autorizada (`effective_filial_ids`). Uma filial não autorizada é negada com o código 42501.
- Consultores, RAC, CPA, CSA e demais vendedores: sem acesso.

## Detalhes técnicos
Somente tabelas novas, sem tocar nas existentes:
- `projection_filial_divisional` (filial_id, divisional MT/GO/PA, incluída sim/não)
- `projection_goals` (filial_id, ano, mês, valor da meta, quem cadastrou e quando; uma meta por filial/mês)
- `projection_goal_history` (valor anterior e novo, quem alterou e quando; gravado automaticamente)
- `projection_entries` (filial_id, ano, mês, semana 1–4, sem risco, com risco, observação, quem lançou/alterou e quando; um registro por semana)
- `projection_entry_history` (cada edição de uma semana, imutável)
- Acesso por RLS com `has_role` + `effective_filial_ids`; gravações por funções seguras que validam papel, filial e semana. Validação de valores por trigger.
- Painel servido por uma função que já respeita o escopo do usuário. A exportação Excel usa o mesmo conjunto de dados.
- Testes dos cálculos (atingimento, GAP, última semana, PENDENTE, consolidado) e simulação de permissões com BEGIN/ROLLBACK.

## Fluxo de aprovação
1. Você aprova o plano. Apresento o SQL completo para aprovação, sem executar.
2. Após a aprovação do SQL, aplico, implemento as telas e testo.
3. Apresento os resultados. Não publico sem a sua autorização final.
