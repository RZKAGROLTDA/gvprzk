# M3 — Etapa 3: aplicar a Filial Ativa nas telas (diagnóstico, sem implementar)

## O que o levantamento mostrou

Hoje quase nenhuma tela usa a filial principal do cadastro para filtrar. O padrão atual é:
o filtro de filial começa em "Todos" (sem filtro) e é o banco (M1/M2) que limita o usuário
às filiais permitidas. Ou seja: o multi-filial já enxerga as duas filiais somadas, mas não
consegue **focar** em uma delas, porque nada no frontend está ligado à Filial Ativa.

Três exceções que hoje travam na filial principal:

- Lista de consultores/equipe (`useFilteredConsultants`): supervisor é fixado na filial principal.
- Treinamentos: supervisor é fixado na filial principal.
- Análise Gerencial: supervisor é fixado na filial principal e o seletor fica desabilitado.

E um caso de formulário: Programação de visita pré-preenche a filial com a principal
(fora do escopo desta etapa, por ser criação de registro).

## Tela por tela

| Tela | Comportamento atual | Alteração necessária | Risco |
|---|---|---|---|
| POPS | Filtro de filial local começa em "Todos"; metas, carteira e executores recebem esse valor | Iniciar o filtro na Filial Ativa e reagir à troca no cabeçalho; para não-global, limitar a lista de filiais às autorizadas | Baixo. Cuidado para o Excel/PDF exportarem o mesmo recorte da tela |
| CRM — Agenda Semanal | Filtro local "Todos" | Iniciar na Filial Ativa e reagir à troca | Baixo |
| CRM — Programação | Filtro local "Todos" | Iniciar na Filial Ativa e reagir à troca (só a listagem, não o formulário) | Baixo |
| CRM — Retornos | Filtro aplicado na memória sobre os dados já carregados | Iniciar na Filial Ativa e reagir à troca | Baixo |
| CRM — Carteira de Clientes | Filtro local "Todos" enviado ao banco | Iniciar na Filial Ativa e reagir à troca | Médio: a Carteira usa nome de filial em parte dos filtros; precisa converter para o identificador certo |
| CRM — Treinamentos | Supervisor travado na filial principal | Passar a usar a Filial Ativa; gestor global mantém "Todas" | Médio: é onde o supervisor multi-filial hoje perde dados da segunda filial |
| CRM — Gerencial | Filtro local "Todos" com contagens por filial | Iniciar na Filial Ativa e reagir à troca | Baixo |
| Meu Dia / Minha Equipe | Filtro de filial começa vazio; o banco define o escopo | Iniciar na Filial Ativa e reagir à troca; mostrar o seletor de filial quando o usuário tiver 2+ | Médio: hoje o seletor de filial fica escondido para supervisor |
| Relatórios / KPIs | Filtro por **nome** de filial, começa em "Todos" | Iniciar na Filial Ativa e reagir à troca; restringir a lista às filiais autorizadas | Médio: conversão nome ↔ identificador e KPIs que hoje ignoram filial |
| Desempenho por Vendedor / por Filial | Filial fixada como "sem filtro"; o recorte vem da lista de vendedores | Passar a Filial Ativa no lugar do valor fixo | Médio: números mudam para quem tem 2 filiais (passa a ver uma por vez) |
| Validação do Parque | Filtro local; validadores filtrados na memória | Iniciar na Filial Ativa e reagir à troca | Baixo |
| Regularização | Filtro local "Todos" + opção "sem filial" | Iniciar na Filial Ativa, mantendo a opção "sem filial" | Baixo |
| Listas de consultores / equipe / executores | Supervisor travado na filial principal | Passar a acompanhar a Filial Ativa | Alto: é a lista mais reutilizada; um erro aqui esvazia filtros de várias telas |
| Criação de tarefas / atividades | Usa a filial principal | **Fora desta etapa**, conforme combinado | — |

## Como será feito (parte técnica)

- Fonte única já pronta: `useUserFiliais()` (`filiais`, `filialIds`, `primaryFilialId`,
  `activeFilialId`, `isGlobal`, `isMultiFilial`).
- Cada tela deixa de iniciar o filtro em `'all'`/`null` e passa a iniciar em `activeFilialId`,
  reagindo à troca via efeito. Usuário com 1 filial: `activeFilialId` = principal, e como o
  banco já restringia a essa filial, o resultado é idêntico ao de hoje.
- Admin/manager global mantêm `activeFilialId = null` = "Todas as filiais": nada muda.
- Telas que filtram por **nome** (Relatórios, parte do CRM) usam `filiais` do hook para
  converter o identificador ativo no nome correspondente.
- Nas telas onde o filtro de filial é uma lista, a lista passa a mostrar apenas
  `filiais` (autorizadas) para não-global; global continua vendo todas.
- `useFilteredConsultants`, empregados de Treinamentos e executores POPS passam a receber
  `activeFilialId` em vez da filial principal.
- Nada de escrita: `profiles.filial_id` e `user_filiais` não são tocados; o banco (M1/M2)
  continua sendo a autoridade final e barra qualquer filial fora do escopo.
- Chaves de cache do React Query passam a incluir a filial ativa, para a troca no cabeçalho
  atualizar os dados sem misturar recortes.

## Ordem sugerida de implementação

1. Listas auxiliares (consultores/equipe/executores) — base das demais telas.
2. POPS + Validação do Parque + Regularização.
3. CRM (5 abas) + Gerencial.
4. Meu Dia / Minha Equipe.
5. Relatórios / KPIs / Desempenho.
6. Validação final com Diogo (Caiapônia + Planalto Verde), em vínculo reversível.

## Riscos gerais

- Telas que hoje somam as duas filiais passarão a mostrar uma por vez: mudança de números
  esperada e desejada, mas precisa ser comunicada.
- Dados históricos sem filial preenchida podem desaparecer de listas filtradas; manter a
  opção "sem filial" onde já existe.
- Cache antigo pode exibir o recorte anterior por alguns segundos se a chave não incluir a
  filial ativa — daí a mudança nas chaves de cache.
