# Regularização — revisão comparativa (somente diferenças). Nada aplicado.

## 1. Estados do lote — nada muda

Confirmado na versão em produção: a criação nasce em **aguardando_envio**; **confirmar envio** e **cancelar** exigem status **gerado**; **concluir envio (finalize)** aceita **aguardando_envio** ou **erro_envio**; **erro de envio** aceita **aguardando_envio** ou **erro_envio**; **marcar PDF gerado** só atualiza quando o lote está em aguardando_envio ou erro_envio.

Essa é exatamente a regra que a proposta mantém — nenhum estado, transição ou exigência de status foi alterado, incluído ou removido. (Os 11 lotes existentes estão todos em "aguardando envio".)

## 2. Finalização — nada muda

`finalize` mantém idênticos: status `concluido`, `send_status = 'enviado'`, limpeza do erro, incremento de tentativas, destinatários, id da mensagem, assunto/mensagem com o mesmo COALESCE, `sent_at`/`sent_by`, `applied_at`/`applied_by`, a marcação de `regularized_by`/`regularized_at` nos itens e os dois `set_config`. Única inclusão: a validação da Filial Ativa, **depois** da checagem de autor/gestor e **antes** de qualquer alteração.

## 3. Permissões existentes — comparação linha por linha

| Função | Checagens hoje | Na proposta |
|---|---|---|
| finalize | permissão de operar; autor **ou** gestor; status; destinatários; itens > 0 | todas mantidas + validação de filial |
| confirm_send | permissão de operar; autor **ou** gestor; status = gerado; itens > 0 | todas mantidas + validação de filial |
| cancel | permissão de operar; autor **ou** gestor; status = gerado | todas mantidas + validação de filial |
| mark_send_error | permissão de operar; lote existe; status | **hoje não tem checagem de autoria/gestor** — a proposta não acrescenta nenhuma; mantém como está + validação de filial |
| mark_pdf_generated | permissão de operar (nada mais; o UPDATE simplesmente não atinge lote em outro status) | mantida + validação de filial |

**Ponto que eu vou corrigir na proposta:** na versão que montei, `mark_pdf_generated` passava a lançar "Lote nao encontrado". Hoje ela é silenciosa nesse caso. Vou remover essa exceção para não mudar comportamento — a função segue silenciosa quando o lote não existe, e a validação de filial só roda quando o lote existe.

Em `get_batch` o "Lote nao encontrado" já existe hoje; apenas passa a ser verificado antes da montagem do retorno (mesma mensagem, mesmo efeito).

## 4. Pendências — como as três condições convivem

- **Usuário não global** (comum ou multi-filial): a filial efetiva vem de `effective_filial_ids(p_filial_id)` — filial ativa validada, ou a principal quando nada é informado. Filial não autorizada → 42501. O caminho "Sem filial" fica sem resultado por construção (a máquina teria de ter filial nula e pertencer à lista ao mesmo tempo), e no frontend a opção deixa de existir para esse usuário.
- **Admin/gestor**: sem filial → global; com filial informada → somente aquela filial; "Sem filial" continua disponível apenas na visão global, como filtro administrativo.

## 5. Lotes legados — confirmado

Os 11 lotes / 124 itens sem filial não são tocados, nem preenchidos, nem inferidos. Usuário comum ou multi-filial: bloqueado (42501). Admin/gestor com filial ativa: bloqueado. Admin/gestor na visão global: permitido. A validação também recusa lote com mais de uma filial em contexto de filial, sem nunca escolher uma delas.

## 6. Criação — confirmado

Todas as máquinas são validadas antes do primeiro registro (situação pendente, filial ativa, filial única, já regularizada, já em lote aguardando). Nenhum registro é criado se qualquer uma falhar. A filial continua sendo gravada no item do lote, como já era previsto pela estrutura atual. **Nenhum campo novo** é criado na tabela de lotes.

## Resumo das diferenças

1. As três consultas de pendências passam a restringir pela filial efetiva.
2. Criação recebe a filial ativa como último parâmetro, valida tudo antes de inserir e proíbe mistura de filiais.
3. As seis operações de lote (PDF/detalhe, concluir, confirmar, cancelar, erro, marcar PDF) recebem a filial ativa como último parâmetro e ganham **uma única linha** de validação.
4. `mark_pdf_generated` sem a exceção de "lote não encontrado" (correção deste ajuste).
5. Nada mais: nenhum status, permissão, auditoria ou regra de negócio alterada.

Aguardo sua autorização para aplicar.
