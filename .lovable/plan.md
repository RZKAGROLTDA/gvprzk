# Auditoria — Busca de clientes no cadastro de Tarefas

## Como funciona hoje

Componente único de busca: `src/components/task-form/BasicInfoBlock.tsx` (usado por Ligação, Visita à Fazenda, Checklist da Oficina e Visita Técnica).

Fluxo atual:
1. Usuário digita → debounce 200ms → chama a RPC `public.search_clients(p_query, p_limit)`.
2. Se a RPC falhar ou retornar vazio → fallback para a lista estática `src/lib/clientCodes.ts` (`CLIENT_CODES`, arquivo com ~5.400 linhas embutido no bundle).
3. Ao selecionar, preenche `clientCode` + `clientName` e dispara `onClientSelected`, que em Visita Técnica/Checklist carrega as máquinas do cliente e o autofill de contato (`src/lib/clientAutofill.ts`).

Outros pontos relacionados:
- `src/pages/CreateTask.tsx` importa `CLIENT_CODES` (`clientCodes`) — resquício da base estática.
- `src/hooks/useVisitSchedules.ts` (Agenda de Visitas do CRM) faz autocomplete com `ILIKE` **direto na tabela `tasks`** (`client` / `clientcode`) — consulta lenta.
- `src/lib/clientAutofill.ts` lê a última tarefa do cliente em `tasks` — isso é autofill de contato, não busca de cliente; permanece.

## Onde está o problema

A RPC `public.search_clients` **não consulta `clients_master`**. Ela busca exclusivamente em `public.client_equipment` (Parque de Máquinas), ou seja, só encontra clientes que possuem máquina cadastrada. Por isso a Tarefa "não acha todos os clientes", enquanto Campanhas (que usa `search_clients_for_campaigns`, baseada em `clients_master`) acha.

## O que será alterado

Banco (1 migration, apenas funções — nenhuma tabela/dado/RLS):
- `CREATE OR REPLACE FUNCTION public.search_clients(p_query text, p_limit int)` — mesma assinatura e mesmo retorno (`client_code`, `client_name`), passando a usar:
  1. **Fonte principal:** `public.clients_master` (apenas `active`), busca por `client_code_norm` (código com/sem zeros à esquerda), `client_code ILIKE`, `client_name ILIKE` e `client_name_norm`.
  2. **Complemento (fallback histórico):** `client_equipment` e `campaign_clients_master`, incluídos somente quando o código normalizado não existe na `clients_master` — garantindo **zero duplicidade** (`DISTINCT ON (norm)`).
  - Sem `ILIKE` na tabela `tasks`.
  - Mesma checagem de autorização usada em Campanhas (perfil aprovado e ativo), mantendo `SECURITY DEFINER` + `search_path = public`.

Frontend:
- `src/components/task-form/BasicInfoBlock.tsx` — remove o fallback para `CLIENT_CODES` e os `console.log` de diagnóstico; mantém layout, debounce e o mesmo contrato `onClientSelected`.
- `src/hooks/useVisitSchedules.ts` — troca o `ILIKE` em `tasks` pela RPC `search_clients` (elimina o gargalo).
- `src/pages/CreateTask.tsx` — remove o import não utilizado de `CLIENT_CODES`.

## Como fica a nova busca

Digitar `1234`, `0001234`, `SILVA` ou `joão da s` retorna os clientes ativos da base mestre (31k+), ordenados por match exato de código e depois nome, limitados a 20–50 resultados. Seleção continua preenchendo código, nome e disparando máquinas/autofill exatamente como hoje.

## Riscos

- Nenhuma alteração de dados, tarefas, RLS, permissões ou estrutura.
- A assinatura da RPC não muda → nenhum outro consumidor quebra.
- Risco residual baixo: clientes que existem só no Parque de Máquinas e não na base mestre continuam encontráveis via complemento; se um código estiver grafado de forma diferente entre as bases, prevalece o nome oficial da `clients_master` (comportamento desejado).
- Performance: busca por nome usa `ILIKE '%...%'` em `clients_master` (~31k linhas) — bem mais leve que a tabela `tasks`. Se necessário, avaliamos índice trigram depois de medir.
