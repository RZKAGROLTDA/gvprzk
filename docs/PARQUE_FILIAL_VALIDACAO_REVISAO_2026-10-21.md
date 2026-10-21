# Revisão antes da simulação — 21/10/2026

## Resultado: INTERROMPIDO antes de executar o arquivo

SHA-256 calculado sobre o arquivo atual `docs/PARQUE_FILIAL_VALIDACAO.sql`:

`4ee1c942fdd5cc0ecea21f4c561f94b91ff6e532e771997d7a55420f63681ad6`

Este hash identifica o arquivo revisado, **não uma versão aprovada ou validada**.

## Evidência somente-leitura no banco

| Medida | Referência anterior | Consulta atual |
|---|---:|---:|
| Máquinas | 20.198 | 20.200 |
| Validadas (`last_validation_at IS NOT NULL`) | 6.418 | 6.424 |
| Lotes | 41 | 41 |
| Itens | 318 | 318 |
| Colunas propostas existentes | 0 | 0 |
| Outras sessões idle in transaction | — | 0 |

A definição atual de `validate_client_equipment` não contém os campos propostos. Isso confirma que a proposta não está aplicada; não comprova, sozinho, identidade integral dos dados/históricos com a tentativa anterior. Não há snapshot anterior suficiente nesta execução para afirmar isso. As diferenças nas contagens não foram produzidas por esta revisão, que só realizou leituras no banco.

## Bloqueios reais no arquivo

1. **Filial cadastral seria alterada:** a função continua atribuindo `v_eff[1]` à filial cadastral de máquinas sem filial e gravando `filial_id = v_new_filial` (linhas 77–119). Isso viola a preservação solicitada.
2. **Fallback incorreto para validadas:** `COALESCE(validation_filial_id, filial_id)` usa a filial cadastral também em máquinas já validadas sem vínculo confiável. O critério deve ser condicional: validada usa exclusivamente `validation_filial_id`; nunca validada usa `filial_id`. A opção “Sem filial” deve testar esse mesmo critério.
3. **Evidência temporal ausente no preenchimento antigo:** os vínculos atuais de perfil/adicionais, tarefas sem restrição temporal e filial de historical_users não provam qual filial estava autorizada na data da validação. Os 6.129 identificáveis do diagnóstico anterior não podem ser tratados como 6.129 vínculos historicamente comprovados.
4. **Filial selecionada não é obrigatória:** a função admite fallback para filial cadastral em visão global e manutenção silenciosa do vínculo quando não determina responsável. Deve recusar operação que exige responsável sem seleção autorizada explícita.
5. **Lotes:** o arquivo grava a filial efetiva em `equipment_regularization_items.filial_id`, substituindo o significado cadastral original no novo snapshot. É necessário separar filial responsável para escopo da filial cadastral preservada para itens/PDF e ações, mantendo compatibilidade dos lotes antigos.
6. **Preservação e testes:** desabilitar todos os triggers USER para backfill não deve substituir uma estratégia auditável e verificável; o arquivo precisa de verificações de integridade, seleção dinâmica e idempotência, sem forçar os números anteriores.

## Simulação e testes

**Não executados:** backfill; nova validação; criação de lotes; uma/várias/nenhuma filial; Sem filial; recusas 42501; compatibilidade das chamadas antigas após mudança; expansão de clientes após correção; comparação de histórico antes/depois de rollback.

Não houve nova tentativa de escrita, portanto não há resultado `SIMULACAO_OK_ROLLBACK` nesta execução. Nenhuma migração ou publicação foi realizada. Nenhum registro de teste foi criado.

As ferramentas disponíveis nesta sessão têm limites: `read_query` aceita leituras; `run_sql` aceita mudanças de dados, não DDL; a ferramenta de migration é destinada à aplicação de alterações. `PGHOST` está ausente. Não foi usado nenhum desses caminhos para contornar as restrições. Uma simulação integral DDL deve ter um caminho autorizado que mantenha BEGIN/ROLLBACK na mesma sessão, ou ser fornecida para execução no SQL Editor, sem alegar execução inexistente.

## Telas: ajustes preparados em desenvolvimento

- Usar seleção inicial somente após carregar as opções autorizadas; enquanto isso, não chamar as consultas de máquinas/indicadores/clientes/lotes nem exportar.
- Inicializar uma única vez; troca de Filial Ativa não deve substituir a seleção local. Usar principal autorizada quando não houver seleção inicial possível; caso contrário, avisar.
- Compartilhar exatamente o mesmo escopo explícito entre consultas e exportação; não enviar fallback legado enquanto a seleção não estiver pronta.
- Resetar paginação ao mudar seleção/filtros e não manter resultados antigos de outra seleção como se fossem atuais.
- Corrigir o erro de pares no jsonb_build_object de pending_machines dentro do SQL proposto; não mascarar o erro na interface.
- Garantir compatibilidade do escopo de lotes antigos e da filial responsável, preservando filial cadastral.

Implementados nesta revisão: inicialização compartilhada e consultas condicionadas à seleção pronta nos dois painéis; persistência da seleção ao trocar Filial Ativa; fallback inicial para principal autorizada; parâmetros legados neutros; bloqueio de exportação/atualização manual antes da inicialização; seletor desabilitado enquanto não pronto; descarte de resultados anteriores da listagem em troca de filtro; reset da paginação dos lotes e seleção de máquinas na troca do escopo. Critério de filial da validação e correção de expansão de clientes continuam dependentes do SQL, que não foi executado.

Testes executados: `bunx vitest run src/lib/parkFilialScope.test.ts src/hooks/useParkFilialSelection.test.tsx`: **10 testes passaram em 2 arquivos**. Cobrem uma/várias/todas/nenhuma seleção, Sem filial autorizado, bloqueio inicial, fallback principal autorizado e preservação na troca do cabeçalho. Observabilidade: `build OK` em 21/10/2026 14:07:35 UTC. Estes testes verificam lógica frontend, não acesso real ao banco nem fluxo autenticado de criação/expansão/exportação. Projeto usa Supabase externo; sessão autenticada gerenciada não está disponível nesta revisão.

## Próximo passo seguro

Reformular o arquivo para atender às regras acima e reconstruir o diagnóstico com evidência temporal real. Só então gerar um novo hash e script reversível com verificações dinâmicas. Não solicitar aprovação de aplicação com base no hash atual ou nos testes não executados.