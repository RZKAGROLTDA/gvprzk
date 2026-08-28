# Regularização do Parque — Arquitetura Ajustada (aguardando aprovação)

Auditoria aprovada como diagnóstico. Proposta ajustada nos 3 pontos solicitados. **Nenhuma implementação ainda.**

## 1. Ordem das etapas (corrigida)

**ETAPA 1 — Atualização da base de prioridade (primeiro, quando o arquivo for fornecido)**
- Carregar a nova base em tabela de staging (descartável, sem tocar no Parque).
- Gerar **diff para conferência** antes de aplicar: entram na prioridade / saem / permanecem / não encontradas no Parque.
- Após aprovação do diff, aplicar em lote alterando **somente**:
  - `validation_priority`
  - `validation_source`
  - `validation_priority_reason`
  - `validation_priority_updated_at`
- **Nunca alterar**: `machine_status`, `last_validation_at`, `validated_by` nem demais campos da máquina. Validations já realizadas ficam 100% intactas.

**ETAPA 2 — Painel de Regularização do Parque** (só depois da Etapa 1).

## 2. Modelo por LOTE (corrigido — PDF não é por cliente)

Referência oficial do PDF: **LOCALIZAÇÃO DE EQUIPAMENTOS JD.docx** (declaração ao processo de garantia/PMP John Deere). Layout, cabeçalho, texto padrão e tabela serão replicados com fidelidade a partir desse documento.

### Conceito
- O painel de gestão continua **agrupado por cliente** (visualização e indicadores), mas a ação é **selecionar máquinas/clientes pendentes e montar um LOTE DE REGULARIZAÇÃO**.
- Um lote pode ter: 1 cliente, vários clientes, várias máquinas.
- Gera **um único PDF** por lote, com todas as máquinas selecionadas.
- Após o envio, **somente as máquinas daquele lote** passam a ser consideradas comunicadas. Uma nova máquina do mesmo cliente classificada depois como Inativa/Vendida/Sucateada reaparece automaticamente como **nova pendência**.

### Tabela mínima do PDF (por linha de máquina)
Chassi/Nº de Série · Conta/Código do cliente · Localização do concessionário · Nº do PMP · Expiração · Nome do cliente · Cidade · UF/Região · Motivo (Inativa/Vendida/Sucata).

**Lacunas mapeadas** (campos do modelo JD que não existem hoje em `client_equipment`): `pmp_number`, `pmp_expiration`, `city`, `state/region`. Proposta: itens do lote guardam esses valores em snapshot, editáveis antes de gerar o PDF (não criamos campos em `client_equipment` até você decidir a fonte oficial).

### Estrutura nova mínima — 2 tabelas (sem tocar em `client_equipment`)
1. `equipment_regularization_batches` — o lote/envio:
   - code (identificação do lote), status (`gerado`/`enviado`)
   - recipients (lista), subject, body (texto padrão editável — definido depois)
   - pdf_path (bucket privado `regularization-pdfs`)
   - machines_count, counts por motivo, filiais/clientes envolvidos
   - sent_at, sent_by, created_by, created_at, updated_at
2. `equipment_regularization_batch_items` — máquinas do lote:
   - batch_id, equipment_id
   - snapshot no momento do envio: modelo, chassi/série, client_code, client_name, filial, motivo (`machine_status`), data e responsável da validação, pmp_number, pmp_expiration, city, state

**Regra da pendência** (sem flags no cliente nem na máquina): pendente = máquina em `inativa`/`vendida`/`sucateada` que **não consta em nenhum `equipment_regularization_batch_items` vinculado a um lote com `status = 'enviado'`**. Máquina em lote apenas `gerado` **continua pendente** até o envio efetivo. O histórico do que foi comunicado é exatamente o conteúdo dos itens de lotes enviados.

### Leitura: RPCs novas (sem alterar as do Parque)
- `equipment_regularization_clients(filtros)` — painel agrupado por cliente: cliente, código, filial, total identificadas, qtd por motivo, status Pendente/Enviado, último lote.
- `equipment_regularization_batch_machines(batch_id)` / máquinas pendentes por cliente para compor o lote (com checkbox de seleção multi-cliente).
- KPIs do topo: clientes pendentes, máquinas identificadas, inativas, vendidas, sucatas, lotes/envios concluídos.
- Filtros: filial, cliente, motivo, status.

### Frontend (Etapa 2)
Nova aba dentro do Parque (`Regularização`): KPIs no topo, tabela por cliente com checkboxes para seleção multi-cliente, painel lateral com máquinas e motivo/data/responsável, botão **Montar lote** → revisão do lote → **Gerar PDF** (reaproveitando o padrão jsPDF/jspdf-autotable de `workshopChecklistPdf.ts`) → **Preparar e-mail**.

### RLS
Leitura por `can_view_equipment_park()` (mesma regra do Parque); criação de lote pelo usuário aprovado; exclusão restrita a gestores. Nenhuma policy existente é alterada.

## 3. E-mail — arquitetura prevista, implementação adiada
- **Não** buscar e-mail do cliente via `tasks` neste processo — destinatário **não é o cliente**; é o fluxo de garantia/PMP John Deere e será definido depois.
- Cada lote já terá os campos: destinatário(s), assunto, corpo padrão, PDF anexado, data/hora do envio, enviado por, status e máquinas contidas.
- Quando definidos destinatário e texto padrão: 1 edge function de envio + 1 secret do provedor (ex. Resend), com dialog de revisão antes do envio e registro do lote como ENVIADO somente após confirmação real.

## Próximo passo
Aguardo: (a) sua aprovação desta arquitetura; (b) o arquivo da nova base de prioridade para a Etapa 1; (c) o DOCX de referência para o layout do PDF (pode ser na Etapa 2).
