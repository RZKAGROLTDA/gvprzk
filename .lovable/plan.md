# Auditoria — Controle de acesso do Parque de Máquinas

Nada foi alterado. Somente diagnóstico.

## 1. Causa exata

O modal fica "somente leitura" porque a permissão de edição é decidida por **uma única fonte**: a função de banco `public.can_edit_client_equipment(p_equipment_id)`, que exige um dos vínculos abaixo:

```sql
has_role(admin) OR has_role(manager)
OR ce.created_by  = auth.uid()
OR ce.validated_by = auth.uid()
OR ce.filial_id IS NULL
OR ce.filial_id = get_user_filial_id()
OR ce.filial_id = get_supervisor_filial_id(auth.uid())
```

Para um consultor (RAC/CPA/CSA/vendas), uma máquina de **outra filial** que ele não criou nem validou retorna `false` → o frontend entra em modo leitura.

## 2. Frontend responsável

`src/components/equipment/EquipmentEditDialog.tsx`

```tsx
const { data: canEdit, isLoading: checkingPermission } = useCanEditEquipment(...)
const readOnly = open && canEdit === false;          // linha 42
const busy = isPending || isTransferring || readOnly || checkingPermission;  // linha 180
```

Consequências no modal:
- linhas 207-216: banner "Esta máquina é somente leitura para o seu perfil…";
- campos desabilitados via `readOnly` / `busy`;
- botões de **status** (linha 222+) e **Salvar** desabilitados;
- bloco de ações incluindo **Transferir Máquina** (linha 503) recebe `hidden`;
- **validação** da máquina compartilha o mesmo `busy`.

Hook: `src/hooks/useClientEquipment.ts`
- `useCanEditEquipment` (linhas 387-401) → RPC `can_edit_client_equipment`;
- mensagens de erro "pertence a outra filial" nas linhas 444, 531 e 747 (editar/validar e transferir).

Não existe comparação de filial escrita no frontend — ele apenas reflete a resposta do banco.

## 3. Banco responsável

| Objeto | Papel | Restringe por filial? |
|---|---|---|
| `can_view_equipment_park()` | libera leitura para qualquer perfil aprovado + ativo | Não |
| `get_equipment_park_paginated` / `_kpis` / `_validation_summary` (SECURITY DEFINER) | listagem/KPIs do parque inteiro | Não |
| `can_edit_client_equipment(uuid)` | gate do modal (editar/validar/status/transferir) | **Sim** |
| RLS `client_equipment_select` | leitura direta na tabela | **Sim** (mesma expressão) |
| RLS `client_equipment_update` (USING + WITH CHECK) | edição, validação, status e transferência (todas são `UPDATE` direto na tabela) | **Sim** |
| RLS `client_equipment_insert` | `created_by = auth.uid()` | Não |
| RLS `client_equipment_delete` | apenas admin/manager | n/a |

## 4. Visualizar × Editar × Validar × Transferir

- **Visualizar:** global hoje — a tela lê pela RPC `SECURITY DEFINER`, que ignora a RLS de SELECT.
- **Editar / Validar / Alterar status / Transferir:** todas são `UPDATE` na mesma tabela e passam pela **mesma** política `client_equipment_update` + o mesmo gate `can_edit_client_equipment`. Ou seja, **não há diferença entre elas**: quem pode editar pode validar, mudar status e transferir; quem não pode, não faz nenhuma.

## 5. Matriz atual de permissões

| Cargo | Ver (todas as filiais) | Editar/Validar/Status/Transferir | Excluir |
|---|---|---|---|
| Admin | Sim | Todas as filiais | Sim |
| Manager (gerente) | Sim | Todas as filiais | Sim |
| Supervisor | Sim | Só a própria filial (+ criadas/validadas por ele) | Não |
| RAC / CPA / CSA / Consultores | Sim | Só a própria filial (+ criadas/validadas por ele, + máquinas sem filial) | Não |

## 6. A otimização recente causou isso?

Não. A restrição **já existia**: `can_edit_client_equipment` foi criada junto com o ajuste de RLS granular do parque, e a otimização de performance apenas reescreveu as políticas no padrão `InitPlan` (`(SELECT auth.uid())`), preservando a expressão lógica idêntica. O que mudou a **percepção** foi a centralização da listagem na RPC paginada: a visualização passou a ser global, então o usuário agora abre máquinas de outras filiais e encontra o bloqueio de escrita que antes ficava invisível (a máquina simplesmente não aparecia).

## 7. Proposta (para aprovação) — parque sem restrição por filial

Objetivo: qualquer usuário **aprovado e ativo** com acesso ao Parque pode ver, editar, validar, alterar status e transferir qualquer máquina.

Uma migration, apenas funções e políticas:

1. `CREATE OR REPLACE FUNCTION public.can_edit_client_equipment(p_equipment_id uuid)` → retorna `public.can_view_equipment_park()` (aprovado + ativo) desde que a máquina exista. Mesma assinatura e retorno → nenhum consumidor quebra.
2. `client_equipment_select` → `USING (public.can_view_equipment_park())`.
3. `client_equipment_update` → `USING`/`WITH CHECK` = `public.can_view_equipment_park()`.
4. `client_equipment_insert` → mantido (`created_by = auth.uid()`), somando `can_view_equipment_park()`.
5. `client_equipment_delete` → **mantido como está** (só admin/manager), pois exclusão não estava no pedido.

Frontend: nenhuma alteração necessária. Como `can_edit_client_equipment` passa a retornar `true`, o modal deixa de entrar em modo leitura, os botões de status/validação/transferência reaparecem e as mensagens de "outra filial" se tornam inalcançáveis. Opcionalmente, depois, ajustamos o texto de erro genérico de `42501` (hoje diz "outra filial").

## 8. Impacto de segurança

- Aumenta a superfície de escrita: qualquer colaborador aprovado e ativo passa a poder alterar, validar e transferir máquinas de qualquer filial — é exatamente a regra pedida, mas remove o isolamento por filial como barreira contra erro operacional.
- Continuam ativos: exigência de sessão autenticada, perfil **aprovado** e **ativo** (usuário desativado perde tudo imediatamente), exclusão restrita a admin/manager, histórico de transferência (`transfer_history`) e rastreabilidade de `validated_by`/`transferred_by`.
- Recomendação (opcional, só se você quiser): manter DELETE restrito, como proposto, e considerar registrar as edições no `audit_log`.

## 9. Garantia sobre dados

A alteração proposta é **apenas de regras de permissão** (uma função e três políticas). Nenhum `INSERT`, `UPDATE`, `DELETE` ou `ALTER TABLE`: nenhuma máquina, histórico, validação, prioridade ou vínculo com tarefas é alterado ou perdido. Também é totalmente reversível — basta restaurar a expressão anterior.
