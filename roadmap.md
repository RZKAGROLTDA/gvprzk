# Roadmap

## Condição Especial — melhoria solicitada em 29/10/2026
- [x] Aprovar plano técnico e alterações de banco para período padrão, Tipo de Condição e Margem %.
- [x] Aplicar exclusivamente as duas colunas anuláveis e restrição do tipo; 410 registros e fingerprint anterior preservados, todos os novos campos vazios.
- [x] Implementar apenas na Condição Especial: período padrão, tipo obrigatório manual, margem manual, sexto indicador ponderado, tabela/Excel e lotes ordenados por ID.
- [x] Validar 10 testes automáticos; Excel gerado/reaberto com 410 históricos e 126 no mês; 2.021 IDs únicos no teste de paginação. Fingerprint dos dados anteriores intacto.
- [ ] Validar criação/edição/aprovação, filtros e download pelo navegador com login real por perfil — sessão autenticada indisponível no Supabase externo; depende de validação do usuário no preview.
- [ ] Publicação bloqueada até autorização explícita.

- [x] LUCAS — vínculo C&F - Ananindeua reativado (21:00 UTC) e validado. Observação: Lucas é Gerente (global) desde 15:37 — backend aceita qualquer filial; seletor da tela só oferece Ananindeua + C&F - Ananindeua.
- [ ] PENDENTE ANTIGO: bloquear login da conta antiga do Isac (profiles.da753f5-e441-4673-8e82-807aede2eab2) — botão "Desativar" indisponível (external_unmanaged); aguardando decisão do usuário (reativar temporariamente ou banir no painel Supabase).


## M3 — Acesso Multi-Filial

- [x] Etapa 1 — Base de filiais do usuário (useUserFiliais, estado por sessão)
- [x] Etapa 2 — Seletor de filial ativa no cabeçalho
- [x] Etapa 3A — POPS, Agenda, Programação (listagem), Retornos
- [x] Etapa 3B — Carteira (RPC get_clients_overview_v2 multi-filial validado 12/12), Treinamentos, listas de consultores
- [ ] M3 Gestão Administrativa de Filiais Adicionais — interface em Gerenciar Usuários
  - Implementar campo Filiais Adicionais (dialog + hook), salvar via set_user_filiais
  - Bateria de testes reversível (inclui validação temporária Diogo Caiapônia+Planalto Verde, sem gravar permanente)
- [ ] Aguardando autorização: primeiro acesso multi-filial real (Diogo)

- [ ] M3 Filial Ativa efetiva: revisar arquitetura A (user_active_filial no banco) x B (sessão + parâmetro validado) e minimizar alterações de RLS antes de implementar E1
- [ ] M3 E1 (arquitetura B aprovada): POPS usando Filial Ativa como filial efetiva + validacao no banco, sem alterar RLS
- [ ] M3 E1: revisao final antes de aplicar (validar filial existente/ativa, mapear todas as chamadas POPS, Excel e consultas diretas)
- [ ] M3 E1 aplicar versao final + bateria completa (Diogo Caiaponia/Planalto Verde, Excel, 42501)

## M3 / E2 — Filial Ativa nos módulos (aprovado 18/09)
- [x] Parque de Máquinas (lista, KPIs, Excel) restrito à Filial Ativa para todos
- [x] Validação do Parque (resumo + validadores) restrito à Filial Ativa
- [x] Regularização (pendências, contadores, máquinas por cliente, lotes/PDF/cancelamento/reenvio/finalização) sem misturar filiais
- [x] Carteira/CRM somente Filial Ativa (nunca soma) — E3 concluída (banco + telas validados)
- [ ] Bateria Caiapônia ↔ Planalto Verde ↔ volta, filial única e filial não autorizada

## E2 — Regularização (concluída)
- [x] 9 funções da Regularização com Filial Ativa (effective_filial_ids) + assert_batch_filial
- [x] Lote legado sem filial: somente admin/gestor em contexto global
- [x] Frontend: Regularização parte da Filial Ativa, sem "Sem filial" para usuário comum
- [x] Bateria em BEGIN/ROLLBACK
- [x] Revisão comparativa (status/permissões) antes de aplicar a Regularização

## E4 — Meu Dia, Filial Ativa (diagnóstico aprovado; proposta ajustada, aguardando autorização)
- [ ] Banco: my_day_assert_target(p_user_id, p_filial_id DEFAULT NULL) assinatura única (sem overload); validar filial via effective_filial_ids ANTES do caso self (filial não autorizada → 42501 mesmo para self); get_my_day_team_summary via effective_filial_ids; get_my_day_user_summary/user_details com p_filial_id
- [ ] Frontend: filialId nas chamadas e queryKeys de equipe/individual (useMyDay.ts, MyDay.tsx, UserDayDialog.tsx); bloqueio por isScopeReady
- [ ] Meu Dia pessoal 100% intacto (summary/details/context/builders/queryKeys)
- [ ] Bateria: supervisor principal/adicional/volta sem soma, 42501 não autorizada e consultor comum, admin global/restrito, troca sem reload
- [ ] Depois: diagnóstico específico de useTasks/offline

## Etapa 1 — Filial das prioridades pendentes Nível A (aguardando aprovação do SQL ajustado)
- [ ] SQL ajustado: todas as auxiliares como TEMP, execução atômica em uma transação, COMMIT só se todas as validações passarem
- [ ] Seleção recalculada no momento da execução (sem número fixo)
- [ ] Após COMMIT: confirmar que não restam auxiliares em public e reler os números persistidos

- [x] POPS: conclusao de servico autoriza por Filial Ativa + filiais autorizadas (effective_filial_ids), com Supervisor incluido; aplicado no banco (pops_complete_machine com p_filial_id) e na tela (usePops/PopsMachineDrawer/Pops).

## Consolidacao de contas — Isac Manso Stanke (aguardando aplicacao)
- [ ] Infra user_account_links + resolve_primary_user_id (aprovada conceitualmente)
- [ ] Vinculo alias 513dcb05 -> titular 04884288 (PM2064), idempotente e com guarda de divergencia
- [ ] Desativacao da conta antiga pelo procedimento oficial (historico 100% preservado)
- [ ] Consolidacao de TODOS os indicadores por colaborador: get_performance_by_seller_v2, get_activity_metrics_v2, get_my_day_team_summary (tela da duplicidade), get_equipment_validators, pops_executor_results
- [ ] Transacao unica com validacoes 1..9 + idempotencia; falha => ROLLBACK
- [ ] Nao aplicar a Robson, Diogo, Deibdy

## Consolidacao Isac — revisao solicitada (simulacao reversivel, sem COMMIT)
- [ ] V1/V9 validam apenas o vinculo do alias (nao a tabela inteira)
- [ ] Guarda contra remapeamento do alias (alias -> outro titular => abortar)
- [ ] created_by do vinculo: usar auth.uid() administrativo quando existir; documentar quando NULL
- [ ] get_performance_by_seller_v2: vendas contadas uma vez por task (sem duplicacao por followup) e sem repetir valor entre filiais
- [ ] Mapear todas as RPCs/telas que agrupam por created_by/responsible_user_id/seller_id/executed_by/validated_by/user_id e listar nao cobertas
- [ ] Validar Filial Ativa intacta (identidade != escopo)
- [ ] Numeros reais A e P + consolidado esperado; idempotencia; ROLLBACK integral

- [ ] Consolidação Isac: aplicar migration (BEGIN/COMMIT + validações E) e depois rodar V10–V17 em sessão autenticada; só então usar o botão Desativar.

- [x] Consolidação Isac: COMMIT aplicado + validações pós-COMMIT OK
- [ ] Consolidação Isac: banir a conta antiga no Auth (botão Desativar indisponível — perfil já saiu da lista de aprovados; depende de ação do gestor)

- [ ] CRM Supervisor: escopo único (último acompanhamento → filial do criador) em detalhe/mídia/storage/produtos; validar Filial Ativa; cache na troca
- [ ] Entregar SQL revisado (Filial Ativa no Storage, sem caminho alternativo, versão antiga da mídia removida) para aprovação — não executar

- [ ] CRM Supervisor: escopo único pela Filial Ativa no servidor (simular, não aplicar)
- [ ] Preparar SQL dos 18 cargos ausentes (simular, não gravar)
- [ ] Telas: gravar Filial Ativa no servidor e limpar dados e fotos ao trocar (após aprovação)

- [ ] Parque/Regularização: (1) Salvar e validar desabilitado no Editar Equipamento; (2) filtro multi-filial em todas as abas; (3) detalhes em Regularizados/Cancelados + cancelamento de regularizado só após aprovação do fluxo

## CRM Supervisor — validação final (não aplicar)
- [ ] Policies SELECT de products conferidas; RAC só produtos acessíveis; 919 do Samuel preservados; simulação com FAIL interrompendo; arquivo sem bloco de simulação; SHA-256
- [ ] CRM Supervisor PAUSADO (nada aplicado; simulação final não executada)
- [ ] Parque: botão "Salvar e validar" desabilitado em Editar Equipamento — diagnóstico + proposta antes de corrigir

## Multi-filial Validação + Regularização (aprovado plano 19/10)
- [x] SQL da Regularização (docs/REGULARIZACAO_MULTI_FILIAL.sql, SHA 46e742eb...facf9ce) APLICADO 20/10 ~14:37 UTC; dados intactos (41 lotes, 318 itens, 20.198 máquinas, 13 aguardando envio)
- [x] Tela da Regularização: filtro Filiais multi-select (Selecionar todas/Limpar/Sem filial só Admin-Gerente) aplicado a KPIs, clientes, máquinas e listas de lotes; criação de lote multifilial via escopo; build OK + 5 testes passaram. NÃO publicado — aguardando autorização. Teste autenticado na interface indisponível (Supabase externo); usuário deve validar no preview.
- [ ] Ordenação Validação: docs/PARQUE_ORDEM_ESTAVEL.sql aguardando autorização
- [ ] Filial da validação (Parque + Regularização): preparar SQL + simulação reversível — registrar filial responsável na validação/mudança de situação, filtros multifiliais pela filial da última validação, backfill só com evidência confiável (289 ficam pendentes de revisão manual), correção de equipment_regularization_pending_machines e init dos filtros. NÃO aplicar/publicar sem autorização.
- [x] Revisão SQL 21/10: arquivo reescrito (v2) — filial cadastral nunca gravada, backfill só com tarefa vinculada datada (janela 365d, filial única), critério validada=validation_filial_id / nunca validada=filial_id, recusa 42501 sem filial determinável. SHA-256 novo: 29074deb...16c8c7d. Simulação reversível SIMULACAO_OK_ROLLBACK (hashes por statement conferidos, fingerprint da filial cadastral intacto, rollback comprovado: 0 colunas novas, 20.201/6.425/41/318 inalterados). Resultados: 1.397 backfill_tarefa, 5.028 validadas sem vínculo (revisão manual), kpis legado 20.201, vazia=0, sem filial 17.897, reg_pendentes 410, reg_clientes 165, expansão de cliente OK (57), recusa 42501 OK. Observação: validadores=0 no teste (provável limitação do contexto de auth simulado — verificar na aplicação real). AGUARDANDO autorização para aplicar.
- [ ] Correção isolada equipment_regularization_pending_machines: docs/REGULARIZACAO_PENDING_MACHINES_FIX.sql (SHA 7535069d...da2cb5), texto aprovado, independente da migração de filial — AGUARDANDO autorização.
- [x] Inicialização das telas 21/10: seleção explícita vazia enquanto não pronta, consultas condicionadas à inicialização, preservação na troca da Filial Ativa, principal autorizada como fallback inicial, parâmetros legados neutros e reset de lotes/página por escopo; 10 testes passaram, build OK. Não publicado. Fluxo autenticado e novo critério da filial da validação ainda não verificados/aplicados; dependem da revisão SQL.
- [ ] Regularização: correção de equipment_regularization_pending_machines (texto aprovado) — cancelada, aguardando nova autorização após diagnóstico

- [x] Correção isolada da expansão de clientes da Regularização aplicada (sem anon), testada e dados intactos (21/10/2026).
- [ ] Proposta pré-migração PARQUE_FILIAL_VALIDACAO v2 (visibilidade das 5.028, recuperação de filial, filtros atuais, validadores=0, implantação) — aguardando aprovação do usuário.

- [ ] Etapa 1 filial da validação — revisão final: filial não autorizada via app.validation_filial_id; separar definição da filial cadastral na criação x alteração; histórico rastreia processo/importação; SQL definitivo sem comandos de simulação; simulação com SHA e rollback; tela pronta para publicação coordenada. (sem aplicar/publicar)
- [ ] Etapa 1 — fechar: validação/situação nunca alteram filial cadastral (inclusive chamadas diretas); identificar processo automático (nome do processo, usuário técnico, lote); apresentar simulação real.
- [ ] Etapa 1 — simulação autorizada (SHA 8a2dbb91…): testar máquina fora do escopo, pendência de operação automática no histórico, contagens antes/depois.
- [ ] Etapa 1 — operação automática sem filial: preservar filial anterior e registrar a operação como pendente no histórico; nova simulação.

- [ ] Etapa 1: confirmar que usuario autenticado nao contorna a filial obrigatoria via app.validation_filial_origin (processo_automatico/importacao)
- [ ] Etapa 1: validar permissoes com usuarios autenticados reais e confirmar tela pronta para Filial Ativa antes da implantacao
- [ ] Etapa 1: conferência final compara filial_id original x final de cada máquina (só testes)

## Etapa 1 — Filial responsável pela validação
- [ ] Simulação A (usuários reais) — testes ajustados (B global=inexistente / restrito=não autorizada; cargos confirmados; máquina ausente = NÃO TESTADO); aguardando aprovação para executar
- [ ] Ambiente B isolado — diagnóstico pendente
- [ ] Referências C (somente leitura)
