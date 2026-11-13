# Projeção — exclusão lógica de lançamentos

Status: proposta para aprovação. Não executar nem publicar.

## Estrutura atual conferida no banco
- `projection_entries`: uma linha por filial/ano/mês/semana, valores `numeric(16,2)`, criador, editor e datas; ainda não há exclusão lógica nem versão.
- `projection_entry_history`: valores, observação, ação, usuário e data; atualmente não há proteção contra atualização/exclusão do histórico.
- `projection_save_entry` altera a mesma linha existente; `get_projection_panel` inclui todos os lançamentos tanto nas semanas como na seleção da última semana.
- Os únicos leitores/escritores dessas tabelas são essas funções, `get_projection_history` e a validação. A tela, indicadores e Excel utilizam o painel; a variação procura a semana anterior não vazia.
- Tabelas já estão fechadas para usuários comuns. `projection_scope`, `projection_role_ok`, `projection_is_admin` e `projection_filial_in` validam usuário aprovado/ativo, cargos por `has_role`, Filial Ativa autorizada e exclusão de Tele Vendas.

## Alteração proposta
1. Adicionar exclusivamente aos lançamentos os campos de exclusão (data/hora, usuário, motivo) e versão. Linhas existentes permanecem ativas; valores e autoria não são alterados.
2. Substituir a unicidade atual por unicidade somente dos lançamentos ativos. Novo lançamento da semana excluída recebe outro UUID; não reativa nem sobrescreve o original.
3. Uma função exclusiva para excluir valida cargo e filial no servidor, exige motivo e versão esperada, bloqueia a linha, marca a exclusão e registra seu snapshot na mesma transação. Confirmação desatualizada ou repetida é recusada.
4. O snapshot contém os valores e observação originais, UUIDs do criador/editor, nomes disponíveis no momento da exclusão, datas originais, motivo e autor/data/hora da exclusão. Não inventar nomes históricos anteriores à implantação; os UUIDs originais permanecem preservados.
5. Impedir modificação/remoção dos históricos e de lançamentos já excluídos; impedir exclusão física de lançamentos. Novo histórico de exclusão deve corresponder exatamente ao lançamento excluído.
6. Filtrar `deleted_at IS NULL` nas duas leituras do painel: S1–S4 e última semana. A última é a maior semana ativa, nunca a soma. Exclusão da última retorna à anterior; sem nenhuma, semanas/projeção ficam nulas e a filial fica pendente. Metas e sua fórmula permanecem intactas.
7. Manter a assinatura e formato das funções existentes. No histórico, a ação será `excluido`, apresentada como **Excluído**; motivo aparece junto da observação original. Uma consulta de detalhes devolve o snapshot completo da exclusão com o mesmo controle de filial.

## Tela após aprovação
- Em **Lançar semana**, listar os registros ativos da filial/mês/ano escolhidos, com semana, valores e botão de lixeira **Excluir**.
- Confirmação com filial, mês, ano, semana e valores; motivo obrigatório; cancelar não muda nada. Ao confirmar, enviar UUID e versão, nunca valores informados pelo navegador como fonte da auditoria.
- Administrador pode excluir nas filiais incluídas; supervisor somente na Filial Ativa autorizada; gerente permanece somente leitura, sem botão ou acesso à operação.
- Após sucesso, aguardar atualização de lançamentos, painel e histórico, inclusive totais e Excel; não mostrar resultado antigo como atualizado se a consulta falhar. Ao mudar Filial Ativa, fechar a confirmação anterior.
- Histórico identifica **Excluído**, permite consultar os dados originais e motivo, e nunca alimenta cálculos.

## Validações antes da implantação
Analisar sintaxe do SQL, compatibilidade das assinaturas, cobertura dos leitores e preservação dos controles de acesso. Testes de comportamento serão feitos em banco isolado; nenhum SQL desta proposta será aplicado ao GVPS sem aprovação.

## Testes previstos após aprovação
1. Administrador exclui filial incluída; gerente recebe 42501; supervisor exclui somente Filial Ativa autorizada.
2. Supervisor com filial diferente da ativa, filial não autorizada, escopo ausente, conta não aprovada/inativa, usuário sem cargo e anônimo são recusados.
3. Tele Vendas recusada para todos, inclusive administrador.
4. Motivo vazio/espaços recusado; não altera lançamento nem histórico.
5. Excluir S4 retorna S3; excluir S3 retorna S1 quando S2 não existe; excluir a única semana deixa a filial pendente.
6. Excluir semana intermediária mantém a última e recalcula variação contra a anterior válida.
7. Semana excluída desaparece de S1–S4, indicadores, GAPs, divisionais, total geral e Excel; não somar semanas.
8. Valores, criador/editor e datas originais permanecem iguais no registro excluído e snapshot; motivo e autor/data/hora da exclusão conferem.
9. Nova gravação da semana excluída gera novo UUID, mantém o original excluído e não conflita com a unicidade.
10. Confirmar exclusão depois de edição recusa a versão antiga; duas exclusões simultâneas produzem apenas uma exclusão/histórico.
11. Gravações simultâneas da mesma semana mantêm somente um lançamento ativo e históricos corretos; gravação concorrente com exclusão fica serializada.
12. Tentativas de alterar/apagar histórico, apagar fisicamente lançamento ou reativar/editar excluído são recusadas.
13. Renomear pessoas depois da exclusão não muda os nomes salvos no snapshot.
14. Metas, importação de metas, divisionais e históricos de metas mantêm os resultados e assinaturas atuais.
15. Cancelamento, erros, motivo, troca de filial, atualização imediata e consulta do histórico serão verificados pela interface quando houver sessão autenticada disponível.

## Arquivos de aprovação
- SQL completo: `docs/PROJECAO_EXCLUSAO_SEMANAS.sql`.
- Somente depois da aprovação: executar migração pelo mecanismo oficial e implementar a interface. Publicação continua bloqueada.