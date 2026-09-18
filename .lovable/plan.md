# Regularização do Parque — Conferência e proposta final (E2)

Nada foi alterado no banco nem no frontend.

## Respostas da conferência

**1. O lote tem filial própria?** Não. A tabela de lotes não possui campo de filial. O snapshot de itens tem um campo de filial, mas ele está **vazio em 100% dos registros** (124 de 124) — a criação do lote nunca o preencheu. Hoje, portanto, **não é possível determinar a filial de um lote com segurança**.

**2. Um lote pode conter máquinas de filiais diferentes?** Tecnicamente sim (nada impede). Na prática, nenhum dos 11 lotes existentes mistura filiais — todos os 11 são de máquinas **sem filial cadastrada**, todos em "aguardando envio". Na nova regra, misturar passa a ser proibido.

**Conclusão sobre o campo:** não vou criar um campo novo "por padrão". A filial do lote passa a ser o campo de filial **do próprio snapshot de itens**, que já existe e apenas deixou de ser preenchido. A criação passa a gravá-lo, e a validação das operações usa a filial dos itens (que, por regra nova, é sempre uma só). Os 11 lotes atuais ficam classificados como "sem filial", operáveis apenas por quem está em contexto global ou no filtro "Sem filial" — nenhum dado de lote é reescrito.

**3. Assinaturas atuais completas (as 9 funções)**

```
equipment_regularization_pending_kpis(p_filial_id uuid, p_without_filial boolean, p_client text, p_situation text, p_chassis text)
equipment_regularization_pending_clients(p_filial_id uuid, p_without_filial boolean, p_client text, p_situation text, p_chassis text, p_page integer, p_page_size integer)
equipment_regularization_pending_machines(p_client_key text, p_filial_id uuid, p_without_filial boolean, p_client text, p_situation text, p_chassis text)
equipment_regularization_create_batch(p_equipment_ids uuid[], p_header_city text, p_header_state text, p_document_date date, p_signer_name text, p_signer_role text, p_recipient_name text, p_recipient_email text, p_pmp_number text, p_notes text)
equipment_regularization_get_batch(p_batch_id uuid)
equipment_regularization_finalize(p_batch_id uuid, p_recipients text[], p_provider_message_id text, p_email_subject text, p_email_message text)
equipment_regularization_confirm_send(p_batch_id uuid)
equipment_regularization_cancel(p_batch_id uuid, p_reason text)
equipment_regularization_mark_send_error(p_batch_id uuid, p_error text, p_recipients text[])
equipment_regularization_mark_pdf_generated(p_batch_id uuid)
```

Todas passam a receber a filial como **último parâmetro opcional** (`p_filial_id uuid DEFAULT NULL`), exceto as três de pendências, que já a têm. Sem sobrecarga de função.

**4. Como cada operação valida que o lote é da Filial Ativa**

Uma única função auxiliar nova, `equipment_regularization_assert_batch_filial(p_batch_id, p_filial_id)`:

```
v_filiais  := public.effective_filial_ids(p_filial_id);   -- autoriza e resolve o contexto
v_batch_f  := filial única dos itens do lote (ou nulo, se lote legado sem filial)

-- contexto global (admin/gestor sem filial): libera
IF cardinality(v_filiais) = 0 THEN RETURN; END IF;

-- lote de outra filial, ou lote sem filial fora do contexto global: recusa
IF v_batch_f IS NULL OR NOT (v_batch_f = ANY(v_filiais)) THEN
  RAISE EXCEPTION 'Lote de outra filial: operacao nao permitida no contexto atual'
    USING ERRCODE = '42501';
END IF;
```

- **create_batch**: antes de inserir, calcula a filial de cada máquina; recusa (42501) máquina fora do contexto e recusa lote com mais de uma filial; grava a filial no snapshot de cada item.
- **get_batch** (base do PDF): chama a função auxiliar antes de montar o retorno.
- **finalize, confirm_send, cancel, mark_send_error, mark_pdf_generated**: chamam a função auxiliar logo após a checagem de permissão existente, antes de qualquer alteração.
- **pending_kpis / pending_clients / pending_machines**: filtram por `effective_filial_ids(p_filial_id)` além dos filtros da tela.

Em todas: contexto vazio = global (admin/gestor sem filial); sem filial informada por usuário comum = filial principal; filial não autorizada = 42501. `EXECUTE` revogado de `PUBLIC`, concedido a `authenticated`.

## Frontend

- `src/hooks/useEquipmentRegularization.ts` — envia a Filial Ativa em todas as consultas **e operações** (criar, PDF, finalizar, cancelar, reenviar) e a inclui nas chaves de cache.
- `src/components/equipment/EquipmentRegularizationPanel.tsx` — o filtro de filial deixa de ser um contexto próprio: parte da Filial Ativa do cabeçalho e acompanha sua troca. "Todas as filiais" e "Sem filial" só aparecem para administradores/gestores sem filial selecionada.

## Não muda

`client_equipment.machine_status` segue a fonte oficial; lote segue snapshot; PDF/e-mail não altera o Parque; finalização só registra o envio; cancelado segue liberando recriação. Parque, Validação, POPS, regras de acesso, cargos, usuários, matrículas e vínculos intocados.

## Testes após autorização (leitura; escrita em BEGIN/ROLLBACK)

Diogo Caiapônia → Planalto Verde → volta a Caiapônia (pendências, contadores, clientes, máquinas conferidos contra a base); máquina de Caiapônia recusada com Planalto Verde ativa e vice-versa; lote com duas filiais recusado; PDF, finalizar, cancelar e reenviar de lote de outra filial recusados com 42501; usuário de filial única inalterado; filial não autorizada 42501; admin sem filial global e com filial restrito.
