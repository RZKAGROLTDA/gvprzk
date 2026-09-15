# M3 — Acesso Multi-Filial no Frontend (levantamento e plano)

Etapa de diagnóstico. Nenhuma alteração foi feita.

## Situação encontrada

O sistema hoje carrega o cadastro do usuário com **uma única filial** (a principal) e usa esse valor
para travar escopo, preencher formulários e montar filtros. As regras de banco já aprovadas (M1/M2)
reconhecem filiais adicionais, mas a interface não sabe que elas existem.

### Já prontas (nada a mudar, só passar a filial ativa)
Telas cujos filtros de filial já são livres e apenas obedecem às regras do banco:
- POPS (filtro de filial próprio)
- CRM: Agenda Semanal, Programação, Retornos, Carteira de Clientes, Treinamentos (filtro gerencial)
- Relatórios / KPIs (filtro de filial por nome ou código)
- Validação do Parque e Regularização (filtro de filial próprio)
- Meu Dia — Minha equipe (filtro de filial já enviado ao banco)

Consequência: para quem tiver 2 filiais, essas telas já retornam as duas somadas, mas ainda **não existe
um lugar para escolher qual delas olhar** de forma consistente, e algumas listas auxiliares ficam incompletas.

### Ainda presas à filial principal (precisam mudar)
- **Lista de colegas/consultores** usada em vários filtros: monta a lista só da filial principal, então
  vendedores da segunda filial não aparecem para filtrar.
- **Treinamentos**: o escopo do supervisor é fixado na filial principal.
- **Criação de tarefas** (Ligação, Visita de Campo, Visita Técnica, Checklist de Oficina): a filial vem
  automaticamente do cadastro, sem opção de registrar na segunda filial.
- **Análise Gerencial**: supervisor é amarrado à filial principal e é bloqueado se ela estiver vazia.
- **Indicadores de vendas consolidados**: calculados só com a filial principal.
- **Férias**: o formulário trava na filial principal.
- **Cabeçalho do aplicativo**: mostra apenas o nome da filial principal, sem indicar as demais.

## Plano da M3 (por etapas, cada uma autorizada por você)

### Etapa 1 — Base de filiais do usuário
- Novo carregamento das filiais autorizadas (principal + adicionais ativas), a partir da estrutura criada na M1.
- Nova "filial ativa" guardada na sessão do navegador, com a principal como padrão.
- Regra de segurança: a filial ativa só pode ser uma das autorizadas; qualquer outra volta para a principal.
- Admin/Manager continuam globais e ganham a opção "Todas as filiais".

### Etapa 2 — Seletor no topo
- Seletor de filial no cabeçalho, **exibido somente para quem tem 2 ou mais filiais**.
- Quem tem 1 filial vê exatamente a tela atual, sem seletor.
- Trocar a filial recarrega os dados das telas abertas.

### Etapa 3 — Ligar as telas ao seletor
Ordem sugerida, uma frente por vez com validação:
1. Listas de colegas/consultores e Meu Dia (equipe)
2. CRM: Agenda Semanal, Programação, Retornos, Carteira, Treinamentos
3. POPS
4. Tarefas (criação e listagens) — passa a permitir escolher entre as filiais autorizadas
5. Relatórios/KPIs e Análise Gerencial
6. Validação do Parque e Regularização
7. Férias e cabeçalho

### Etapa 4 — Validação final
Caso oficial: Diogo Jesus Silva com Caiapônia + Planalto Verde.
- Confere que o seletor mostra só essas duas.
- Confere que cada tela muda os dados ao trocar.
- Confere que uma terceira filial continua inacessível.
- Confere que usuários de uma filial só não notam diferença.

## Riscos
- **Telas com muitos filtros** (CRM, POPS, Relatórios): risco de conflito entre o filtro de filial da própria
  tela e a filial ativa do topo. Mitigação: a filial ativa define o padrão e limita as opções do filtro.
- **Criação de tarefas**: hoje a filial é preenchida sozinha; passar a exigir escolha pode confundir. Mitigação:
  manter a principal pré-selecionada.
- **Dados históricos**: registros antigos permanecem na filial em que foram criados; nada é transferido.
- **Cache de telas**: é necessário limpar o cache ao trocar de filial para não exibir dados da filial anterior.
- **Bloqueios existentes** (ex.: Análise Gerencial exige filial) podem se comportar diferente com múltiplas
  filiais; serão revisados na etapa correspondente.

## Fora do escopo
Nada de M1/M2 é alterado. Nenhum vínculo de filial é criado nesta etapa, inclusive o do Diogo, que só será
configurado quando você autorizar a validação final.
