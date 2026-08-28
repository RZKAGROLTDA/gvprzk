# Regularização do Parque — Auditoria e Proposta Mínima

## 1. Arquitetura atual (auditada)

### Onde ficam as validações
Tudo vive na tabela única `client_equipment` (19.932 máquinas). Não existe tabela de histórico de validações.
- `machine_status` — situação da máquina: `ativa` (19.537), `vendida` (255), `inativa` (128), `sucateada` (12).
- `last_validation_at` — data/hora da última validação.
- `validated_by` — usuário que validou.
- `validation_priority`, `validation_source`, `validation_priority_reason`, `validation_priority_updated_at` — base de prioridade de validação (Etapa 1).
- `transfer_history` (jsonb) — único histórico existente hoje, e só de transferências de titularidade.

Conclusão: os 3 motivos pedidos já existem como `inativa` / `vendida` / `sucateada`, e **395 máquinas** já estão nesses status (praticamente todas já com data e responsável de validação — 394 de 395). Ou seja, o painel novo nasce com dados reais e não precisa de nenhum campo novo em `client_equipment`.

### Relação máquina → cliente → filial
`client_equipment.client_code` + `client_name` (texto, sem FK; base mestre é `clients_master`) e `filial_id` → FK `filiais.id`. O agrupamento por cliente do painel deve usar `client_code` normalizado + `filial_id`, mesmo padrão já usado no Parque.

### Componentes / RPCs do Painel de Parque
- Página: `src/pages/Equipamentos.tsx`.
- Hook central: `src/hooks/useClientEquipment.ts` (listagem, KPIs, validadores, update, create, transfer).
- Componentes: `EquipmentParkBlock`, `EquipmentCard`, `EquipmentEditDialog`, `EquipmentCreateDialog`, `equipmentConstants.ts`.
- RPCs: `get_equipment_park_paginated`, `get_equipment_park_kpis`, `get_equipment_validation_summary`, `get_equipment_validators`, `search_client_equipment`, `can_view_equipment_park`, `can_edit_client_equipment`.

### PDF — o que reaproveitar
`jspdf` + `jspdf-autotable` já instalados. Referências prontas: `src/lib/workshopChecklistPdf.ts` (675 linhas, cabeçalho, seções, tabelas, rodapé) e `src/lib/generateReportPDF.ts`. Reaproveitamos o mesmo estilo/cabeçalho — nada novo de infraestrutura.

### E-mail — o que existe
**Nada.** Não há Resend/SMTP, nem edge function de envio, nem secret de e-mail. Edge functions atuais: bulk-import-equipment, cleanup-orphan-auth-user, deactivate-user, delete-user, import-clients-master, pops-import-load. Para envio real será necessária 1 edge function + 1 secret (provedor a definir, ex. Resend).

### Destinatário do cliente
`clients_master` não tem e-mail. A única fonte é `tasks.email` (2.207 de 16.025 tarefas preenchidas). Então: pré-carregar o e-mail mais recente encontrado por `clientcode` e permitir digitação/edição manual sempre.

## 2. Proposta mínima (sem alterar o Parque atual)

Nenhuma alteração em `client_equipment`, nas RPCs do Parque nem nas telas atuais. Só adicionamos uma camada de leitura + 2 tabelas de envio.

### Estrutura nova mínima: 2 tabelas
1. `equipment_regularizations` — um registro por **envio** (não por cliente):
   client_code, client_name, filial_id, machines_count, counts por motivo, status (`gerado` / `enviado`), pdf_path, recipient_email, subject, body, sent_at, sent_by, created_at.
2. `equipment_regularization_items` — as máquinas **daquele** envio:
   regularization_id, equipment_id, snapshot (modelo, chassi, motivo, data e responsável da validação no momento do envio).

Isso resolve o requisito central: nada de `email_sent=true` no cliente. A pendência é sempre calculada como *máquinas em inativa/vendida/sucateada que ainda não aparecem em nenhum item de envio*. Se amanhã uma nova máquina do mesmo cliente virar Inativa, ela reaparece automaticamente como pendência nova, sem apagar o envio anterior.

Opcional (fase 2 do PDF): bucket privado `regularization-pdfs` para guardar o PDF exatamente como enviado.

### Camada de leitura: 2 RPCs
- `equipment_regularization_clients(filtros, paginação)` — lista agrupada por cliente com: cliente, código, filial, total identificadas, qtd inativa/vendida/sucata, status Pendente/Enviado, último envio.
- `equipment_regularization_machines(client_code, filial_id)` — máquinas do cliente com modelo, chassi, horas, ano, tipo, motivo, data e responsável da validação, e se já foi enviada antes (e em qual envio).
- Indicadores do topo saem de uma terceira RPC leve de KPIs (clientes pendentes, máquinas identificadas, inativas, vendidas, sucatas, envios concluídos).
Filtros: filial, cliente, motivo, status.

### Frontend
Nova aba/rota dentro do Parque (`Regularização`), reaproveitando os padrões atuais: tabela paginada, painel lateral de detalhe do cliente, KPIs no topo, botão Gerar PDF, e depois o dialog de preparação de e-mail com revisão antes do envio.

### RLS
Mesma regra já vigente no Parque: leitura por `can_view_equipment_park()`; criação de envio pelo próprio usuário aprovado; exclusão restrita a gestores. Sem tocar nas policies existentes.

## 3. Etapa 1 — nova base de prioridade, sem perder validações
A prioridade e a validação são campos independentes na mesma linha. Então a atualização mexe **somente** em `validation_priority*`, nunca em `machine_status`, `last_validation_at` ou `validated_by`.

Fluxo proposto (só quando você mandar): carregar a nova base em uma tabela de staging → gerar um **diff** para conferência antes de aplicar (entram na prioridade / saem da prioridade / permanecem / não encontradas no Parque) → aplicar em lote apenas o flag de prioridade, com `validation_source` e `validation_priority_updated_at` novos. Máquinas já validadas continuam com histórico intacto; se saírem da nova base, perdem só o flag de prioridade.

## 4. Ordem sugerida de implementação
1. Tabelas + RLS + RPCs de leitura (sem tocar no Parque).
2. Painel com KPIs, tabela por cliente e detalhe das máquinas.
3. Gerar PDF por cliente (reaproveitando o estilo do checklist).
4. Envio de e-mail (edge function + secret do provedor) e registro do envio.
5. Etapa 1: staging + diff da nova base de prioridade.

Nada foi criado ou alterado nesta etapa — aguardo sua aprovação.
