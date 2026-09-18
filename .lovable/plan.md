# Regularização do Parque — Diagnóstico (E2)

Nada foi alterado. Abaixo o que hoje ignora a Filial Ativa e a proposta.

## Situação atual

**Pendentes / contadores / clientes / máquinas**
As três consultas (`equipment_regularization_pending_kpis`, `_pending_clients`, `_pending_machines`) já aceitam uma filial, mas ela vem do filtro da própria tela, que começa em "Todas as filiais". Resultado: quem tem duas filiais vê hoje a soma das duas, e o filtro nem valida se a filial escolhida é autorizada. Nenhuma delas usa a regra da Filial Ativa (`effective_filial_ids`).

**Lotes: aguardando envio, concluídos, erro de envio, cancelados**
Não existe nenhuma lista dessas etapas na tela hoje — só o lote recém-criado é aberto em diálogo. Portanto não há o que corrigir agora, mas também nenhum lugar onde a filial seja considerada.

**Criação de lote** (`equipment_regularization_create_batch`)
Aceita qualquer máquina pendente de qualquer filial. Um colaborador com as duas filiais pode criar um lote com máquinas de Caiapônia enquanto opera em Planalto Verde, e até misturar as duas no mesmo lote.

**Detalhe do lote / PDF** (`equipment_regularization_get_batch`)
Devolve qualquer lote para quem pode ver o Parque, sem checar a filial das máquinas do lote.

**Finalizar envio, confirmar envio, cancelar, registrar erro, marcar PDF gerado**
Todas checam apenas permissão e autoria do lote. Nenhuma verifica a filial: operando em Planalto Verde é possível concluir, cancelar ou reenviar um lote de Caiapônia.

## Alterações propostas

### Banco (9 funções, mesma regra já validada no Parque e na Validação)

| Função | Motivo |
|---|---|
| `_pending_kpis`, `_pending_clients`, `_pending_machines` | passar a filtrar por `effective_filial_ids(p_filial_id)` além do filtro da tela; filial não autorizada → 42501 |
| `_create_batch` | novo parâmetro final `p_filial_id`; recusar máquina fora da filial informada e gravar a filial do lote |
| `_get_batch` | recusar lote cujas máquinas não pertencem à filial autorizada/ativa |
| `_finalize`, `_confirm_send`, `_cancel`, `_mark_send_error`, `_mark_pdf_generated` | novo parâmetro final `p_filial_id`; recusar operação sobre lote de outra filial |

Regra única em todas: `effective_filial_ids` decide — vazio = global (admin/gestor sem filial), sem filial informada = filial principal, filial não autorizada = 42501. Assinaturas mudam apenas por acréscimo no final, sem sobrecarga; `EXECUTE` revogado de `PUBLIC` e concedido a `authenticated`.

Nada da lógica funcional muda: `client_equipment.machine_status` continua a fonte oficial, o lote continua snapshot, PDF/e-mail não altera o Parque, finalização só registra o envio e cancelado segue liberando recriação.

### Frontend (2 arquivos)

- `src/hooks/useEquipmentRegularization.ts` — enviar a Filial Ativa em todas as consultas e operações e incluí-la nas chaves de cache, para a troca de filial atualizar na hora.
- `src/components/equipment/EquipmentRegularizationPanel.tsx` — o filtro de filial passa a partir da Filial Ativa; a opção "Todas as filiais" fica apenas para administradores/gestores sem filial selecionada, para nunca somar filiais.

Não serão tocados: Parque, Validação, POPS, regras de acesso (RLS), cargos, usuários, matrículas PM e vínculos.

## Testes previstos (somente leitura; escrita em BEGIN/ROLLBACK)

Diogo: Caiapônia → Planalto Verde → volta a Caiapônia, comparando pendentes, contadores, clientes e máquinas com a base; máquina de Caiapônia recusada em lote com Planalto Verde ativa e vice-versa; concluir/cancelar/reenviar lote de outra filial recusado; usuário de filial única inalterado; filial não autorizada → 42501; admin sem filial global e com filial restrito.
