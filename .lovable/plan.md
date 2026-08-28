# Regularização do Parque — Plano de execução por etapas

Escopo desta fase: trabalhar **somente** as máquinas já classificadas hoje como `vendida` (255), `inativa` (128) e `sucateada` (12) — total 395 pendências iniciais.

Fora de escopo agora (não será tocado):
- Nenhuma alteração em `validation_priority*` nem em qualquer dado de validação.
- Nenhuma mudança no funcionamento atual do Parque de Máquinas ou nas validações existentes.
- Atualização da nova base de prioridade fica adiada.

Ajuste definitivo aprovado: no PDF, o campo antes chamado "Motivo" passa a ser **"Situação da Máquina"**, com os valores exibidos **Vendida | Inativa | Sucata** (`sucateada` é apresentado como "Sucata").

---

## Etapa R1 — Estrutura de lotes (banco)
Criar as duas tabelas do fluxo, sem mexer em nada existente:

`equipment_regularization_batches` — guarda **apenas os dados do documento**, sem `filial_id` (o lote pode ser multi-filial):
- `header_city`, `header_state` (linha "Cidade, DD de mês de AAAA")
- `document_date`
- `pmp_number` (padrão do lote, quando aplicável)
- `signer_name`, `signer_role` (assinante)
- `recipient_name`, `recipient_email` (destinatário)
- `status` (`gerado` | `enviado` | `cancelado`), `generated_at`, `sent_at`, `sent_by`, `created_by`

`equipment_regularization_items` — vínculo ao lote e ao equipamento + **snapshot** completo do PDF, incluindo a filial/localização real da máquina:
- `equipment_id`, `filial_id` (filial real da máquina), `dealer_location`
- `serial_chassis`, `responsible_account`, `pmp_number`, `expiration_date`
- `client_code`, `client_name`, `city`, `state`
- `machine_situation` (`vendida` | `inativa` | `sucata`)

Regras de acesso: usuários aprovados e ativos visualizam lotes e itens; gestores/admin criam, editam, geram e confirmam envio. Grants explícitos para `authenticated` e `service_role`.

**Validação R1:** tabelas criadas vazias, RLS ativa, inserção de teste bloqueada/permitida conforme cargo.

---

## Etapa R2 — Painel de pendências (leitura)
- RPC paginada de pendências: máquinas com situação vendida/inativa/sucateada que **não** constam em nenhum item de lote com `status = 'enviado'`.
- Máquina em lote apenas `gerado` **continua pendente**.
- Cards de KPI: total pendente, por situação, e total já regularizado (enviado).
- Filtros: filial, situação, cliente, nº de série.

**Validação R2:** contagem inicial = 395 e soma por situação = 255/128/12.

---

## Etapa R3 — Seleção, revisão por máquina e geração do lote
- Seleção múltipla na tabela (com "selecionar todos da página" e limite por lote).
- Formulário do lote (dados do documento): cidade/UF e data do cabeçalho, nº do PMP padrão, assinante, destinatário.
- **Revisão obrigatória por item antes de gerar**: os campos que não existem no Parque podem ser pré-preenchidos por padrão (do formulário ou por filial), mas cada máquina permite revisar/editar individualmente:
  Conta Responsável | Localização do concessionário | Nº do PMP | Expiração | Cidade | Região.
- O **snapshot final só é gravado no momento da geração** do lote (`status = 'gerado'`); máquinas continuam pendentes.

**Validação R3:** gerar um lote de teste com 3 máquinas de filiais diferentes, editando campos por item, e conferir os itens gravados.

---

## Etapa R4 — PDF do lote (multi-cliente)
Gerar o PDF replicando o modelo oficial RZK/John Deere:
cabeçalho com logo, "Cidade, DD de mês de AAAA", título **DECLARAÇÃO DE NÃO LOCALIZAÇÃO**, parágrafo padrão com o nº do PMP, tabela verde, parágrafo de encerramento, bloco de assinatura e rodapé institucional.

Colunas da tabela: Nº de Série | Conta Responsável | Localização do concessionário | Nº do PMP | Expirações | Nome do cliente | Cidade | Região | **Situação da Máquina**.

Dados sempre lidos do snapshot do item (nunca do Parque atual).

**Validação R4:** abrir o PDF do lote de teste e comparar com o documento de referência.

---

## Etapa R5 — Confirmar envio
- Tela de preparação do lote: revisão dos itens, destinatário e PDF gerado.
- Ação **"Confirmar envio"** (não há envio automático nesta fase — nenhum provedor de e-mail integrado): grava `status = 'enviado'`, `sent_at` e `sent_by`.
- É esse passo — e só ele — que remove as máquinas do painel de pendências.
- Envio automático por e-mail fica para etapa posterior.

**Validação R5:** confirmar envio do lote de teste e conferir que as 3 máquinas saem da pendência (395 → 392).

---

## Etapa R6 — Histórico e controle
- Aba de histórico: lista de lotes com filial, data, quantidade de máquinas, situação e status.
- Detalhe do lote com itens e reimpressão do PDF.
- Ação de cancelar lote `gerado` (itens voltam ao painel, sem apagar histórico).

**Validação R6:** reimprimir PDF de lote enviado e cancelar um lote gerado conferindo o retorno das pendências.

---

## Detalhes técnicos
- Consultas de pendência e histórico sempre via RPC paginada (padrão do projeto), sem `SELECT *` e sem `count exact` fora da primeira página.
- Filtro de filial com `LOWER(TRIM())`.
- Datas via `parseLocalDate` / `formatDateDisplay` / `formatDateToLocal`.
- PDF com jsPDF nativo (sem `jspdf-autotable`), seguindo o padrão de `workshopChecklistPdf.ts`.
- React Query com `staleTime` 5–10 min e sem refetch em foco.
- Nenhuma coluna de mídia pesada nas listagens.
