# Regularização em 3 visões (Pendentes / Aguardando envio / Regularizados)

## Como está hoje

- `src/pages/Equipamentos.tsx` já tem menu de cards com entradas independentes (Validação do Parque, Regularização).
- `EquipmentRegularizationPanel.tsx` é hoje **apenas a visão de pendentes**: KPIs + filtros + grupos cliente+filial + seleção + "Criar lote".
- `RegularizationBatchDialog.tsx` faz duas coisas hoje: criar o lote e, depois de criado, gerar/baixar PDF/e-mail. Toda a parte pós-criação (PDF, download, mailto) já está pronta e será reaproveitada como "visualizar lote".
- Banco já suporta o ciclo completo, nada novo de estrutura é necessário:
  - `equipment_regularization_create_batch` → nasce em `aguardando_envio` com snapshot dos itens;
  - `equipment_regularization_get_batch` → lote + itens (base do PDF);
  - `equipment_regularization_mark_pdf_generated` → auditoria;
  - `equipment_regularization_mark_send_error` → `erro_envio`;
  - `equipment_regularization_finalize` → `concluido` + `send_status='enviado'` + `sent_by`/`sent_at` (este é o "Confirmar envio");
  - `equipment_regularization_cancel` → `cancelado` (máquinas voltam às pendências);
  - trigger de transição já aceita `aguardando_envio → concluido`, `→ erro_envio`, `erro_envio → aguardando_envio`.
- Falta apenas **uma RPC de leitura para listar lotes** — hoje só existe leitura de um lote por id.

## O que implementar

### Backend (1 RPC nova + ajuste depois nas 3 de pendências)

1. `equipment_regularization_batches_list(p_statuses text[], p_filial_id uuid, p_client text, p_page int, p_page_size int)` — somente leitura, `SECURITY DEFINER`, mesma regra de visibilidade dos lotes já usada nas policies. Retorna JSON `{ total, batches: [...] }` com, por lote: id, status, `send_status`, data de criação, total de máquinas, clientes (agregados do snapshot dos itens: código + nome), filiais, `signer_name`, `sent_at`, `sent_by` + nome do responsável, `pdf_generated_at`, `send_error`.
   - Aguardando envio → chamada com `['aguardando_envio','erro_envio']`.
   - Regularizados → chamada com `['enviado','concluido']`.
   - Sem duplicar dados: tudo agregado a partir de `equipment_regularization_items` (snapshot já existente).
2. **Somente depois** que a área "Aguardando envio" estiver no ar: alterar as 3 RPCs de pendências para excluir máquinas com item em lote de status `aguardando_envio`, `erro_envio`, `enviado`, `concluido`. `cancelado` volta às pendências e `gerado` mantém comportamento atual. `client_equipment` não é tocado.

### Frontend

- `src/hooks/useEquipmentRegularization.ts`: acrescentar `useRegularizationBatches(statuses, filters, page, pageSize)`, `useConfirmRegularizationSend()` (chama `finalize`) e `useRetrySend()` (volta `erro_envio → aguardando_envio` via RPC existente). Invalidar `reg-batches`, `reg-kpis`, `reg-clients`, `reg-machines` após confirmar.
- `EquipmentRegularizationPanel.tsx`: passa a ser um container com `Tabs` de 3 visões, reaproveitando o conteúdo atual como aba **Pendentes** (extraído para `RegularizationPendingTab.tsx`, sem mudança de comportamento).
- Novo `RegularizationBatchesTab.tsx` (usado nas duas abas de lotes, variando statuses e ações):
  - tabela: Cliente, Código, Filial, Data de criação, Máquinas, Status (badge), Responsável/Envio (só em Regularizados);
  - filtros de filial e cliente reaproveitando os mesmos controles;
  - paginação server-side igual à de pendentes.
- Novo `RegularizationBatchViewDialog.tsx`: abre por `batchId`, usa `useRegularizationBatch` e mostra cabeçalho + relação das máquinas do snapshot. Ações reaproveitando o código já existente no `RegularizationBatchDialog` (extraído para um hook `useBatchDocumentActions`): **Visualizar PDF**, **Baixar PDF**, **Email** (gera + baixa + mailto, sem alterar status) e, apenas em Aguardando envio, **Confirmar envio** com `AlertDialog` "Confirma que o documento deste lote foi enviado?". Em `erro_envio`, botão extra "Repetir envio".
  - Em Regularizados o diálogo é somente leitura + PDF, mostrando data e usuário responsável pela confirmação.
- `RegularizationBatchDialog.tsx` continua sendo o fluxo de criação; após criar, mostra o aviso de que o lote foi para "Aguardando envio" e o painel troca para essa aba.

## Ordem de execução

1. RPC de listagem de lotes (migration).
2. Hooks + 3 abas + diálogo de visualização/confirmação.
3. Validar o ciclo completo (criar → aguardando → confirmar → regularizados).
4. Só então a migration que ajusta as 3 RPCs de pendências.

## Garantias

- Nenhuma alteração em `client_equipment` em qualquer etapa.
- Nenhuma base paralela: pendências vêm do Parque, lotes vêm do snapshot já gravado.
- PDF e e-mail permanecem idênticos ao comportamento atual.
