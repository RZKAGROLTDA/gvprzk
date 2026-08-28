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
- `equipment_regularization_batches`: filial, cidade/UF do cabeçalho, data do documento, nº do PMP, nome/cargo do assinante, destinatário do envio, `status` (`gerado` | `enviado` | `cancelado`), datas de geração e envio, autor.
- `equipment_regularization_items`: vínculo ao lote e ao equipamento, mais o **snapshot** completo usado no PDF: nº de série, conta responsável, localização do concessionário, nº do PMP, expiração, nome do cliente, cidade, região (UF) e **situação da máquina** (vendida/inativa/sucata).

Regras de acesso: gestores/serviços podem criar e enviar lotes; consultores visualizam os lotes da própria filial. Grants explícitos para `authenticated` e `service_role`.

**Validação R1:** tabelas criadas vazias, RLS ativa, inserção de teste bloqueada/permitida conforme cargo.

---

## Etapa R2 — Painel de pendências (leitura)
- RPC paginada de pendências: máquinas com situação vendida/inativa/sucateada que **não** constam em nenhum item de lote com `status = 'enviado'`.
- Máquina em lote apenas `gerado` **continua pendente**.
- Cards de KPI: total pendente, por situação, e total já regularizado (enviado).
- Filtros: filial, situação, cliente, nº de série.

**Validação R2:** contagem inicial = 395 e soma por situação = 255/128/12.

---

## Etapa R3 — Seleção e geração do lote
- Seleção múltipla na tabela (com "selecionar todos da página" e limite por lote).
- Formulário do lote: cidade/data do documento, nº do PMP, assinante, destinatário.
- Ao gerar: cria o lote em `status = 'gerado'` e grava os itens com o snapshot; máquinas continuam pendentes.
- Campos de snapshot inexistentes no Parque (conta responsável, localização do concessionário, PMP, expiração) são preenchidos no formulário do lote, com padrão por filial.

**Validação R3:** gerar um lote de teste com 3 máquinas e conferir os itens gravados.

---

## Etapa R4 — PDF do lote (multi-cliente)
Gerar o PDF replicando o modelo oficial RZK/John Deere:
cabeçalho com logo, "Cidade, DD de mês de AAAA", título **DECLARAÇÃO DE NÃO LOCALIZAÇÃO**, parágrafo padrão com o nº do PMP, tabela verde, parágrafo de encerramento, bloco de assinatura e rodapé institucional.

Colunas da tabela: Nº de Série | Conta Responsável | Localização do concessionário | Nº do PMP | Expirações | Nome do cliente | Cidade | Região | **Situação da Máquina**.

Dados sempre lidos do snapshot do item (nunca do Parque atual).

**Validação R4:** abrir o PDF do lote de teste e comparar com o documento de referência.

---

## Etapa R5 — Preparação e envio
- Tela de preparação do lote: revisão dos itens, destinatário e anexo (PDF).
- Ação "Marcar como enviado": grava data/autor do envio e muda `status` para `enviado`.
- É esse passo — e só ele — que remove as máquinas do painel de pendências.
- Envio de e-mail automático fica como passo opcional posterior (não há provedor configurado hoje).

**Validação R5:** enviar o lote de teste e confirmar que as 3 máquinas saem da pendência (395 → 392).

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
