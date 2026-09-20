# Validação de máquinas com Filial Ativa — proposta (não aplicada)

Objetivo: nenhuma validação nova pode terminar sem filial, e nenhuma validação pode mudar a filial de uma máquina que já tem filial.

## 1. Nova função de banco (RPC) e assinatura

```
public.validate_client_equipment(
  p_equipment_id  uuid,
  p_filial_id     uuid,            -- Filial Ativa do cabeçalho
  p_mark_validated boolean DEFAULT true,
  p_model         text    DEFAULT NULL,
  p_year          integer DEFAULT NULL,
  p_hours         numeric DEFAULT NULL,
  p_serial_chassis text   DEFAULT NULL,
  p_observation   text    DEFAULT NULL,
  p_machine_status text   DEFAULT NULL,
  p_client_code   text    DEFAULT NULL
) RETURNS SETOF public.client_equipment
```

- VOLATILE, SECURITY DEFINER, owner postgres, `SET search_path = public`.
- Assinatura única (confirmação em `pg_proc` antes e depois). Sem sobrecarga.
- `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.
- Retorna a linha já atualizada, com as mesmas colunas que a tela usa hoje.

Fluxo interno, em ordem:

1. `auth.uid()` obrigatório, senão erro de autenticação.
2. Perfil aprovado e ativo (mesma checagem já usada no parque) + `can_view_equipment_park()`.
3. `v_eff := effective_filial_ids(p_filial_id)` — única autoridade de filial; filial não autorizada devolve 42501 por si mesma.
4. Lê a filial atual da máquina (`FOR UPDATE`).
5. Decide a filial:
   - máquina **sem** filial: exige filial operacional definida. Se `cardinality(v_eff) = 1` → grava essa filial. Se `cardinality(v_eff) = 0` (admin/manager em visão global) → erro orientando a selecionar uma filial; não grava nada.
   - máquina **com** filial: não altera a filial. Se `cardinality(v_eff) > 0` e a filial da máquina não está em `v_eff` → 42501 (somente leitura para o perfil atual).
6. `UPDATE` único com os campos permitidos + `validated_by = auth.uid()` e `last_validation_at = now()` quando `p_mark_validated`.

## 2. Campos que a função pode alterar

Apenas: `model`, `year`, `hours`, `serial_chassis`, `observation`, `machine_status`, `client_code` (somente quando estava vazio, como hoje), `filial_id` (somente de NULL para a Filial Ativa), `validated_by`, `last_validation_at`, `updated_at`.

Nunca toca: cliente já preenchido, transferências, histórico de transferência, prioridade de validação, lote de importação, `created_by`, `validation_source`.

## 3. Tela de edição/validação e `useUpdateEquipment`

- `useUpdateEquipment` passa a chamar a RPC em vez de `UPDATE` direto, mantendo a mesma interface (`{ id, patch }` + `markValidated`) e a mesma classificação de erros (42501 → "outra filial", sessão, tempo excedido, conflito).
- Passa `p_filial_id: activeScopeFilialId` do mesmo hook de Filial Ativa já usado no parque; a mutação só é habilitada quando o escopo está pronto.
- Novo erro tratado: admin/manager sem filial selecionada → aviso "selecione uma filial no cabeçalho para validar esta máquina" e botão de validar desabilitado nesse caso (máquina sem filial + visão global).
- Transferência de máquina continua como está (fora do escopo).
- Invalidação de cache atual (`['client-equipment']`) preservada.

## 4. Criação manual de máquina

- `useCreateEquipment` passa a gravar `filial_id` = Filial Ativa, com a mesma validação.
- Para não duplicar regra de autorização, a criação também passa por função de banco própria (`create_client_equipment(...)`, SECURITY DEFINER, mesma checagem de perfil e `effective_filial_ids`), preservando a checagem de duplicidade de chassi que já existe.
- Admin/manager em visão global: exige filial selecionada para criar.
- Máquinas antigas não são alteradas.

## 5. Admin/manager em visão global

Regra escolhida (mais segura): **não permitir** validar máquina sem filial sem antes selecionar uma Filial Ativa. Nada de filial arbitrária, nada de herdar filial do perfil. Validar máquina que já tem filial continua permitido em visão global, sem alterar a filial.

## 6. Segurança

- Sem permissão genérica nova: a política de `UPDATE` da tabela permanece como está; a RPC é SECURITY DEFINER e restringe as colunas.
- Autorização: usuário autenticado, perfil aprovado e ativo, `can_view_equipment_park()`, `effective_filial_ids` como teto e 42501 para filial não autorizada.
- Proteção anti-transferência: a filial só muda de NULL para a Filial Ativa; qualquer outra tentativa é ignorada/bloqueada.
- Sem alteração em RLS, cargos, vínculos, POPS, Parque (leitura), Regularização, Meu Dia, CRM.

## 7. Bateria de testes (formato Teste | Filial Ativa | Obtido | Esperado | Status)

Estrutura: assinatura única em `pg_proc`; privilégios (sem PUBLIC, com authenticated); colunas retornadas iguais às atuais.

Comportamento (com impersonação real):
1. Máquina sem filial + RAC com sua filial ativa → grava essa filial, validador e data.
2. Mesma máquina revalidada → filial permanece a mesma.
3. Máquina com filial da própria filial ativa → valida, filial inalterada.
4. Máquina de outra filial → 42501, nada alterado.
5. Multi-filial (Diogo) com Planalto Verde ativa → máquina sem filial recebe Planalto Verde.
6. Mesmo usuário com Caiapônia ativa → outra máquina sem filial recebe Caiapônia.
7. Multi-filial com filial não autorizada (Canarana) → 42501.
8. Admin/manager sem filial ativa + máquina sem filial → recusado, filial continua NULL.
9. Admin/manager com filial ativa + máquina sem filial → grava a filial selecionada.
10. Admin/manager sem filial ativa + máquina com filial → valida, filial inalterada.
11. Usuário sem filial autorizada → 42501.
12. Campos editados aplicados corretamente; campos proibidos inalterados (transferência, prioridade, lote, origem).
13. Criação manual: recebe a Filial Ativa; duplicidade de chassi continua barrada; visão global sem filial → recusado.
14. Máquina recém-validada aparece imediatamente na listagem da filial correspondente e na lista "Validado por".
15. Integridade: nenhuma máquina histórica alterada além das usadas nos testes, que serão revertidas.

Testes de escrita usarão transação com desfazimento (ou reversão explícita dos valores originais) e comprovação final de que nada permaneceu alterado. Qualquer falha: paro, mostro a causa e não corrijo automaticamente.

## 8. Impacto no fluxo atual

- Validação deixa de ser UPDATE direto e passa por função de banco; a tela muda pouco (mesmos botões, mesmas mensagens, um bloqueio novo para visão global sem filial).
- A partir da correção, nenhuma máquina nova fica sem filial ao ser validada ou criada.
- Regularização de Máquinas passa a receber máquinas já com filial nas novas validações; o passivo histórico continua fora do fluxo até decidirmos (item abaixo).
- As 19.231 máquinas sem filial e as 54 do Filipe permanecem intocadas nesta etapa.

## Caso Filipe — proposta separada (54 máquinas)

Evidência levantada: das 54, apenas **5** têm vínculo com visita registrada — e elas apontam **4 para Canarana e 1 para Querência**. As outras **49 não têm nenhuma evidência** de contexto de filial. Ou seja, ser RAC de Querência não sustenta atribuir Querência às 54; há inclusive contra-evidência.

Alternativas, sem inventar filial:
- **A. Só o comprovável:** atribuir filial apenas às 5 com vínculo de visita, cada uma conforme a filial da própria visita (4 Canarana, 1 Querência). As 49 continuam sem filial.
- **B. Confirmação do responsável:** apresentar ao Filipe (ou ao gestor) a lista das 49 para confirmação filial por filial, gravando só o que ele confirmar, com registro de quem confirmou.
- **C. Derivar do cliente:** quando todas as outras máquinas do mesmo cliente já tiverem uma única filial, propor essa filial — apenas como sugestão a confirmar, nunca automático.
- **D. Aguardar:** manter o passivo e resolvê-lo naturalmente na próxima validação de cada máquina, já com a regra nova.

Recomendação: A + B (A é comprovável e imediato; B resolve o resto sem suposição). C só como apoio à decisão de B. Nada disso será executado sem sua escolha.
