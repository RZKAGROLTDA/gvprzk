# M2 — Importação da Base e Carteira POPS (proposta corrigida, nada aplicado)

## 1. Entendimento corrigido da origem das máquinas

Dois conceitos distintos e independentes:

| Conceito | O que é | Papel |
|---|---|---|
| **BASE DE ORIGEM POPS** | A nova relação/planilha que você forneceu (Serial Number, Dealer Account Number, Dealer Location, Product Series, Manufacture Year, Model, Nome Cliente, Plataforma) | Define **QUEM entra** no programa. É o universo inicial de máquinas candidatas. |
| **FONTE MESTRE DA MÁQUINA** | `public.client_equipment` | Define **A QUAL máquina do Parque** cada linha está vinculada e permanece a fonte oficial dos dados da máquina após o vínculo. |

Consequências assumidas:
- `client_equipment` **não define** a base POPS. Ele é usado apenas para (1) localizar a máquina correspondente, (2) obter o `equipment_id`, (3) confirmar cliente/filial/modelo/chassi e (4) servir como fonte oficial dos dados depois do vínculo.
- A carga inicial da carteira POPS é formada **exclusivamente** a partir da nova base enviada. Nenhuma máquina do Parque é selecionada automaticamente, em lote, por amostragem ou por qualquer critério próprio.
- Fica descartada qualquer leitura de que "pops_machines = seleção das 19.917 máquinas do Parque". O correto é: **N linhas da nova base POPS → matching com `client_equipment` → confirmação → `pops_machines`**.
- Adicionar máquinas manualmente a partir do Parque fica como possibilidade **futura**, fora da M2.

### 1.1 Status do arquivo
A planilha foi fornecida fora do ambiente do Lovable e **não está acessível** aqui (os uploads presentes são imagens e um `TAKERATE.xlsx` de outro contexto). Portanto a auditoria da base POPS (linhas, seriais únicos, duplicidades, clientes, filiais, modelos, campos vazios, qualidade do serial) será executada **no momento do envio do arquivo**, antes de fixar o parser. A estrutura proposta é agnóstica ao cabeçalho: a linha crua vai íntegra em `jsonb` e o mapeamento de colunas fica gravado no lote.

### 1.2 Auditoria do Parque (apenas como alvo do matching)
Números levantados para dimensionar risco de vínculo — não para compor a base POPS:

| Métrica de `client_equipment` | Valor |
|---|---|
| Máquinas cadastradas | 19.917 |
| Seriais/chassis distintos (normalizados) | 19.438 |
| Grupos de serial repetido | 451 |
| Sem serial | 23 |
| Sem `client_code` | 4.328 (21,7%) |
| Sem `model` | 9.103 (45,7%) |
| Sem `year` | 7.095 |
| Clientes distintos | 3.448 |
| Filiais | 14 |
| RAC/CPA/CSA aprovados e ativos | 12 |
| `pops_machines` hoje | 0 |

Comprimento do serial: 17 caracteres (18.399), 13 (1.399), restante residual.

Riscos para o matching:
1. 451 grupos de serial duplicado no Parque → sem código de cliente, essas linhas vão para `REVISAR`, nunca a match automático.
2. 46% sem modelo → `Model` só reforça, nunca decide sozinho.
3. 21,7% sem código de cliente → confirmação por `Dealer Account Number` não pode ser obrigatória.
4. Formatos mistos de serial (13 vs 17) → normalização + comparação por sufixo.
5. `Nome Cliente` e `Dealer Location` são apoio/conferência, jamais critério de match automático.

## 2. Fluxo atualizado da importação

```text
NOVA BASE POPS (planilha)
  → upload + mapeamento de colunas
  → validação de linhas (serial presente/plausível)
  → matching contra client_equipment (serial > código cliente > modelo > local/cliente como apoio)
      ├─ MATCH_EXATO         (1 máquina do Parque localizada com segurança)
      ├─ REVISAR             (>1 candidato ou evidência insuficiente)
      ├─ NAO_ENCONTRADA     (nenhuma máquina segura no Parque)
      ├─ DUPLICADA_NA_BASE  (mesma máquina repetida no arquivo)
      └─ JA_NO_POPS         (equipment_id já vinculado ao POPS 2026)
  → revisão gerencial (planilha × Parque lado a lado)
  → resolução das divergências (vincular manualmente / ignorar / manter pendente)
  → CONFIRMAÇÃO explícita
  → INSERT em pops_machines (somente linhas da base com equipment_id resolvido)
  → atribuição das máquinas aos RACs
```

Nenhuma linha entra em `pops_machines` automaticamente, e nenhuma máquina que não esteja na nova base entra no programa.

## 3. Alterações necessárias na proposta da M2

1. **`pops_import_rows` passa a ser o registro canônico da base de origem POPS** (não um artefato descartável): mantém a linha crua e os campos extraídos, com vida útil longa, para conciliação e para acompanhar pendências que ainda não têm vínculo no Parque.
2. Campos extraídos alinhados exatamente ao cabeçalho informado: `serial_number`, `dealer_account_number`, `dealer_location`, `product_series`, `manufacture_year`, `model`, `client_name`, `platform` (+ versões normalizadas `serial_norm`, `client_code_norm`).
3. `matched_equipment_id` é **nullable** e permanece nulo indefinidamente para pendências — a linha continua fazendo parte da base POPS mesmo sem vínculo.
4. Nenhuma rotina de "seleção de máquinas do Parque" existe na M2: não há RPC, filtro ou job que popule `pops_machines` a partir de `client_equipment`.
5. `pops_machines.source` passa a ser `'importacao'` para toda a carga inicial; entrada manual pelo Parque fica reservada para etapa futura.
6. Contagem da meta continua garantida por `UNIQUE (program_id, equipment_id)` em `pops_machines`.
7. A auditoria da base POPS deixa de constar como concluída e passa a ser um passo formal na aplicação da M2, quando o arquivo for enviado.

### Objetos (inalterados no essencial, ajustados nos campos)
- **`pops_import_batches`**: `id`, `program_id` (FK `pops_programs`), `file_name`, `column_map jsonb`, `status pops_import_status` (`rascunho|processado|confirmado|cancelado`), `total_rows`, `counts jsonb`, `created_by`, `confirmed_by`, `confirmed_at`, timestamps.
- **`pops_import_rows`**: `id`, `batch_id` (FK, cascade), `row_number`, `raw jsonb`, campos extraídos acima, `match_status pops_match_status`, `match_score`, `match_reason`, `matched_equipment_id` (FK `client_equipment`, `ON DELETE SET NULL`), `candidates jsonb`, `resolution pops_row_resolution` (`pendente|confirmado|vinculado_manual|ignorado`), `resolved_by`, `resolved_at`, `confirmed_machine_id` (FK `pops_machines`), timestamps. `UNIQUE (batch_id, row_number)`.
- **`pops_client_assignments`**: `id`, `program_id`, `client_code_norm`, `client_name`, `rac_user_id`, `assigned_by`, `notes`, timestamps. `UNIQUE (program_id, client_code_norm)`.
- **`pops_machines`**: sem colunas novas (`responsible_user_id`, `import_batch_id`, `source`, `notes` já existem).
- Enums novos: `pops_import_status`, `pops_match_status`, `pops_row_resolution`.

### Matching (`pops_match_import_batch`)
Normalização: `pops_norm_serial()` = upper + remoção de não alfanuméricos; `pops_norm_code()` = dígitos sem zeros à esquerda.
1. Serial ausente/curto (<6) → `NAO_ENCONTRADA`.
2. Serial repetido no arquivo → `DUPLICADA_NA_BASE` (a primeira ocorrência segue o fluxo).
3. Candidatos por serial igual ou sufixo compatível (13↔17):
   - 1 candidato → `MATCH_EXATO` (100 se o código do cliente confere; 90 se a planilha não trouxe código; 70 → `REVISAR` se o código conflita);
   - >1 → desempate por código do cliente; sobrando 1 → `MATCH_EXATO` (95); senão `REVISAR` com `candidates`;
   - 0 → `NAO_ENCONTRADA`.
4. `matched_equipment_id` já no programa → `JA_NO_POPS`.
`Model`/`Product Series` reforçam o score; `Nome Cliente`/`Dealer Location` apenas informam a conferência.

### Divergências e não encontradas
- `NAO_ENCONTRADA`: nunca cria `client_equipment`; a linha fica pendente na base POPS e pode ser vinculada manualmente depois, ignorada, ou permanecer pendente.
- `REVISAR`: gestor escolhe um candidato ou ignora.
- `DUPLICADA_NA_BASE` / `JA_NO_POPS`: informativas, não confirmáveis.

### Confirmação
`pops_confirm_import_batch` insere em `pops_machines` apenas linhas com `matched_equipment_id` e (`MATCH_EXATO` ou `resolution='vinculado_manual'`), com `source='importacao'`, `import_batch_id`, `status='foco'`, `active=true`, `ON CONFLICT (program_id, equipment_id) DO NOTHING`. Idempotente.

### Atribuição ao RAC
- `pops_assign_rac_by_client(program_id, client_code, rac_user_id)` grava o padrão do cliente e propaga a todas as máquinas POPS ativas dele.
- `pops_assign_rac_machines(machine_ids[], rac_user_id, p_force)`: individual/lote; divergir do padrão do cliente exige `p_force=true` (ação explícita da gestão, que atualiza o padrão).
- `pops_assign_rac_by_filial(program_id, filial_id, rac_user_id)`: por cliente dentro da filial.
- Uma máquina tem um único `responsible_user_id`; histórico de troca fica para a M3. Alvo válido: usuário `rac` aprovado e ativo.

### Carteira
`pops_portfolio_clients(...)` agrupa por cliente (máquinas POPS / serviçadas / pendentes) e `pops_portfolio_client_machines(...)` detalha modelo, serial, ano, filial e demais dados **lidos de `client_equipment`**. Sem execução e sem OS nesta M2.

### RLS e segurança
- RLS habilitada nas 3 tabelas novas; `REVOKE ALL ... FROM anon`; `GRANT` a `authenticated` (sem `DELETE`) e `ALL` a `service_role`.
- `pops_import_batches` / `pops_import_rows`: leitura e escrita só `manager`/`admin` via `has_role`.
- `pops_client_assignments`: leitura por `pops_scope()` (RAC próprio, Supervisor filial, Manager/Admin global); escrita só Manager/Admin.
- CPA/CSA não participam automaticamente. Nenhuma política fora do prefixo `pops_` é tocada.

### Índices
`pops_import_rows (batch_id, match_status)`, `(batch_id, resolution)`, `(serial_norm)`, `(matched_equipment_id)`; `pops_client_assignments (program_id, rac_user_id)`; `pops_machines (program_id, responsible_user_id, active)`; índice funcional em `upper(regexp_replace(serial_chassis,'[^A-Za-z0-9]','','g'))` sobre `client_equipment` apenas se o `EXPLAIN` confirmar ganho.

### RPCs
`pops_create_import_batch`, `pops_match_import_batch`, `pops_import_summary`, `pops_import_rows_list`, `pops_resolve_import_row`, `pops_confirm_import_batch`, `pops_assign_rac_by_client|_machines|_by_filial`, `pops_portfolio_clients`, `pops_portfolio_client_machines` — todas `SECURITY DEFINER`, `search_path=public`, set-based (sem N+1).

## 4. Confirmação: `client_equipment` não define a base POPS
Confirmado. `client_equipment` é apenas a fonte mestre consultada para localizar a máquina e fornecer `equipment_id` e dados oficiais. Nenhuma RPC, trigger, filtro ou script da M2 popula `pops_machines` a partir de `client_equipment`.

## 5. Confirmação: nada fora da nova relação entra no programa
Confirmado. Toda linha de `pops_machines` na carga inicial terá origem rastreável em uma linha de `pops_import_rows` do lote importado (`source='importacao'`, `import_batch_id` preenchido). Não há seleção aleatória, automática ou em massa de máquinas do Parque. Inclusão manual pelo Parque fica para etapa futura, sob nova aprovação.

## 6. Garantias
- A migration da M2 cria apenas estrutura vazia; **nenhum dado será importado até sua aprovação** e até o envio da planilha.
- `client_equipment` não é alterada (somente leitura + possível índice funcional).
- Não haverá execução, amostra, oportunidade, OS, status operacional de execução, dashboard, integração com Tarefas/Meu Dia ou frontend final nesta etapa.
- SQL completo da M2 será apresentado na íntegra na aprovação, na ordem obrigatória: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY` → funções/RPCs/triggers → índices.
