# M2 — Importação da Base e Carteira POPS (proposta, nada aplicado)

## 1. Auditoria

### 1.1 Base POPS (planilha)
O arquivo da base POPS **não está disponível** no ambiente. Os únicos uploads existentes são imagens e um `TAKERATE.xlsx` (outro contexto). Portanto:
- não há como auditar linhas, seriais únicos, duplicidades, clientes, filiais, modelos e campos vazios da base POPS agora;
- os nomes reais das colunas ("Serial Number", "Dealer Account Number", etc.) serão auditados **no envio do arquivo**, antes de fixar o parser;
- a estrutura proposta abaixo é agnóstica ao cabeçalho: a linha crua é guardada em `jsonb` e um mapeamento de colunas é gravado no lote.

### 1.2 Parque de Máquinas (`public.client_equipment`) — fonte oficial
| Métrica | Valor |
|---|---|
| Máquinas | 19.917 |
| Seriais/chassis distintos (normalizados) | 19.438 |
| Sem serial | 23 |
| Grupos de serial repetido | 451 |
| Serial repetido com o mesmo `client_code` | 5 |
| Sem `client_code` | 4.328 (21,7%) |
| Sem `model` | 9.103 (45,7%) |
| Sem `year` | 7.095 |
| Clientes distintos | 3.448 |
| Filiais | 14 |
| RACs/CPA/CSA aprovados e ativos | 12 |
| `pops_machines` hoje | 0 registros |

Comprimento de serial: 17 caracteres (18.399), 13 (1.399), demais residuais.

### 1.3 Riscos para o matching
1. **451 grupos de serial duplicado** no Parque → sem `client_code` na planilha essas linhas caem em `REVISAR`, nunca em match automático.
2. **46% sem modelo** → modelo só serve como reforço, nunca como critério isolado.
3. **21,7% sem código do cliente** → confirmação por código não pode ser obrigatória.
4. Serial com formatos mistos (13 vs 17) → normalização obrigatória (upper, remover não alfanuméricos) e comparação também por **sufixo** quando um lado tem 13 e o outro 17.
5. Nome de cliente e filial **não** entram como critério de decisão, apenas como informação de conferência.

## 2. Modelagem (novas tabelas, todas com prefixo `pops_`)

### `pops_import_batches`
Lote de importação. Campos: `id`, `program_id` (FK `pops_programs`), `file_name`, `column_map jsonb`, `status pops_import_status` (`rascunho|processado|confirmado|cancelado`), `total_rows`, `counts jsonb` (resumo materializado), `created_by`, `confirmed_by`, `confirmed_at`, `created_at`, `updated_at`.

### `pops_import_rows`
Uma linha da planilha + resultado do matching (dado temporário/auditoria, não duplica o Parque de forma permanente).
Campos: `id`, `batch_id` (FK, `ON DELETE CASCADE`), `row_number int`, `raw jsonb` (linha original íntegra),
extraídos: `serial_raw`, `serial_norm`, `client_code_raw`, `client_code_norm`, `client_name_raw`, `filial_raw`, `model_raw`, `year_raw`, `platform_raw`;
resultado: `match_status pops_match_status`, `match_score int`, `match_reason text`, `matched_equipment_id uuid` (FK `client_equipment`, `ON DELETE SET NULL`), `candidates jsonb` (até 5 candidatos com id/serial/cliente/modelo/filial), `resolution pops_row_resolution` (`pendente|confirmado|vinculado_manual|ignorado`), `resolved_by`, `resolved_at`, `confirmed_machine_id uuid` (FK `pops_machines`), `created_at`, `updated_at`.

### `pops_client_assignments`
Carteira padrão por cliente (garante "mesmo cliente = mesmo RAC").
Campos: `id`, `program_id`, `client_code_norm text`, `client_name text`, `rac_user_id uuid`, `assigned_by`, `notes`, timestamps. `UNIQUE (program_id, client_code_norm)`.

### Alteração mínima em `pops_machines`
Nenhuma coluna nova é necessária: `responsible_user_id`, `import_batch_id`, `source` e `notes` já existem. A atribuição individual continua em `pops_machines.responsible_user_id`.

### Enums novos
`pops_import_status`, `pops_match_status` (`MATCH_EXATO|REVISAR|NAO_ENCONTRADA|DUPLICADA_NA_BASE|JA_NO_POPS`), `pops_row_resolution`.

### PK/FK/UNIQUE
- PK `uuid` em todas.
- `pops_import_rows`: `UNIQUE (batch_id, row_number)`.
- `pops_client_assignments`: `UNIQUE (program_id, client_code_norm)`.
- `pops_machines`: mantém `UNIQUE (program_id, equipment_id)` (já existente) — garante 1 máquina = 1 unidade da meta.

## 3. Estratégia de matching (`pops_match_import_batch`)
Normalização: `pops_norm_serial(text)` = upper + remoção de tudo que não é `[A-Z0-9]`; `pops_norm_code(text)` = dígitos com zeros à esquerda removidos.

Ordem de decisão por linha:
1. Serial vazio/curto (<6) → `NAO_ENCONTRADA` (motivo: serial inválido).
2. Serial repetido no próprio arquivo → `DUPLICADA_NA_BASE` (a primeira ocorrência segue o fluxo normal).
3. Candidatos = `client_equipment` com `serial_norm` igual **ou** sufixo compatível (13↔17).
   - 1 candidato → `MATCH_EXATO` (score 100 se `client_code` também confere; 90 se a planilha não trouxe código; 70 → `REVISAR` se o código conflita).
   - >1 candidato → desempate por `client_code_norm`; se sobrar exatamente 1 → `MATCH_EXATO` (score 95); senão `REVISAR` com `candidates` preenchido.
   - 0 candidatos → `NAO_ENCONTRADA`.
4. Se `matched_equipment_id` já existe em `pops_machines` do programa → `JA_NO_POPS`.
Cliente/filial/modelo **nunca** decidem sozinhos; entram apenas em `match_reason` e no comparativo da revisão.

## 4. Divergências
- `NAO_ENCONTRADA`: nunca cria `client_equipment`. A linha fica disponível para `vincular_manual` (informando um `equipment_id` real), `ignorado`, ou permanece `pendente`.
- `REVISAR`: gestor escolhe um candidato (vinculação manual) ou ignora.
- `DUPLICADA_NA_BASE` / `JA_NO_POPS`: informativas, não confirmáveis.

## 5. Fluxo de confirmação
`criar lote → carregar linhas → processar matching → resumo/revisão → resolver divergências → confirmar` .
A confirmação (`pops_confirm_import_batch`) insere em `pops_machines` **apenas** linhas com `matched_equipment_id` e `match_status = MATCH_EXATO` ou `resolution = vinculado_manual`, com `source='importacao'`, `import_batch_id`, `status='foco'`, `active=true`, `ON CONFLICT (program_id, equipment_id) DO NOTHING`. Idempotente: reexecutar não duplica.

## 6. Atribuição ao RAC
- `pops_assign_rac_by_client(program_id, client_code, rac_user_id)`: grava/atualiza `pops_client_assignments` e propaga para **todas** as máquinas POPS ativas daquele cliente.
- `pops_assign_rac_machines(machine_ids[], rac_user_id, p_force)`: individual/lote. Se a máquina pertencer a cliente com RAC padrão diferente, falha com aviso a menos que `p_force = true` (ação explícita da gestão) — que então atualiza o padrão do cliente.
- `pops_assign_rac_by_filial(program_id, filial_id, rac_user_id)`: aplica por cliente dentro da filial.
- Uma máquina tem um único `responsible_user_id`. Histórico de troca fica para a M3 (`pops_events`).
- Alvo válido: usuário aprovado, ativo e com papel `rac`.

## 7. RLS
- Todas as tabelas novas: RLS habilitada, `REVOKE ALL ... FROM anon`, `GRANT` só a `authenticated` (+ `service_role`), sem `DELETE` para `authenticated` (exceto cascade do lote via função de gestor).
- `pops_import_batches` / `pops_import_rows`: SELECT/INSERT/UPDATE apenas para `manager`/`admin` (via `has_role`).
- `pops_client_assignments`: leitura conforme `pops_scope()` (RAC vê o próprio, Supervisor a filial, Manager/Admin global); escrita só Manager/Admin.
- Nenhuma política fora do prefixo `pops_` é tocada.

## 8. RPCs (todas `SECURITY DEFINER`, `search_path=public`, sem N+1)
| RPC | Papel |
|---|---|
| `pops_create_import_batch(program_id, file_name, column_map, rows jsonb)` | cria lote + insere todas as linhas em uma única instrução |
| `pops_match_import_batch(batch_id)` | matching em lote (set-based, sem loop por linha) |
| `pops_import_summary(batch_id)` | contadores por status/resolução em um único jsonb |
| `pops_import_rows_list(batch_id, status, resolution, search, limit, offset)` | divergências lado a lado (planilha × Parque) com total |
| `pops_resolve_import_row(row_id, action, equipment_id)` | confirmar / vincular manual / ignorar |
| `pops_confirm_import_batch(batch_id)` | insere confirmados em `pops_machines` |
| `pops_assign_rac_by_client` / `pops_assign_rac_machines` / `pops_assign_rac_by_filial` | atribuição |
| `pops_portfolio_clients(program_id, rac_user_id, filial_id, search, limit, offset)` | carteira agrupada por cliente (máquinas / serviçadas / pendentes) |
| `pops_portfolio_client_machines(program_id, client_code, ...)` | máquinas do cliente com dados do Parque |

## 9. Índices
- `pops_import_rows (batch_id, match_status)`, `(batch_id, resolution)`, `(serial_norm)`, `(matched_equipment_id)`.
- `pops_client_assignments (program_id, rac_user_id)`.
- `client_equipment`: índice funcional `pops_ce_serial_norm_idx` em `upper(regexp_replace(serial_chassis,'[^A-Za-z0-9]','','g'))` — necessário para o matching; será criado só se o `EXPLAIN` confirmar ganho.
- `pops_machines (program_id, responsible_user_id, active)` para a carteira.

## 10. SQL completo da M2
Arquivo de apoio: o script será enviado na íntegra na mensagem de aprovação/aplicação, na ordem obrigatória por tabela: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY`, seguido de funções, RPCs, triggers de `updated_at` e índices. Nenhuma linha de dado da planilha faz parte da migration.

## 11. Garantias
- Nenhum dado será importado até sua aprovação: a migration apenas cria estrutura vazia.
- `client_equipment` não é alterada (somente leitura + possível índice funcional).
- Nada de execução, amostra, oportunidade, OS, dashboard, integração com Tarefas/Meu Dia ou frontend final nesta etapa.
- A auditoria da base POPS será feita quando você enviar a planilha.
