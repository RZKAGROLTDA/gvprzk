# Exclusão de lançamentos semanais — Projeção de Vendas

## Proposta para aprovação
- Adicionar lixeira **Excluir** junto das semanas registradas em **Lançar semana**.
- Confirmar filial, mês, ano e semana, com motivo obrigatório.
- Administrador pode excluir nas filiais incluídas; supervisor somente na Filial Ativa autorizada. Gerente continua somente leitura; Tele Vendas permanece excluída.
- Preservar o lançamento original e registrar **Excluído** no histórico, com valores, responsáveis, datas, horário e motivo.
- Excluídos deixam de alimentar semanas, indicadores, GAPs, variações, consolidados e Excel. A última semana válida anterior passa a valer; sem outra, filial sem projeção.
- Relançar a mesma semana cria um novo registro sem sobrescrever o excluído.
- Metas, divisionais e demais módulos permanecem intactos. Não publicar.

## Proposta técnica e SQL completo
- [SQL para aprovação](sandbox:/mnt/documents/PROJECAO_EXCLUSAO_SEMANAS.sql)
- [Revisão técnica e testes](sandbox:/mnt/documents/PROJECAO_EXCLUSAO_SEMANAS_PROPOSTA.md)

As tabelas e funções reais foram conferidas. O SQL adiciona exclusão lógica e versão em `projection_entries`, motivo/snapshot em `projection_entry_history`, unicidade somente de semanas ativas, proteção contra alterações/remoção de histórico e registros excluídos, operação autorizada e consultas de lançamentos e exclusões.

`projection_save_entry` passa a gravar somente linhas ativas; `get_projection_panel` filtra ativos tanto nas semanas como na última projeção. Assinaturas atuais e controles de acesso são preservados. Bloqueio por semana e versão esperada impedem excluir um registro editado depois da confirmação.

## Validação realizada
- 23 comandos SQL com sintaxe válida; proposta aplicada somente em PostgreSQL 17.11 local descartável.
- 25 verificações passaram: permissões simuladas, motivo, histórico e dados originais, retorno à anterior, ausência de projeção, relançamento, centavos, versão desatualizada, Tele Vendas e tabelas fechadas.
- Nenhuma execução no GVPS, nenhuma alteração de tela e nenhuma publicação.
- Sessões reais, concorrência entre conexões, interface e regressão completa de metas/importação ainda não testadas.

## Depois da aprovação
1. Revalidar o SQL contra o estado do banco e aplicar pelo mecanismo oficial.
2. Implementar confirmação, motivo, atualização imediata e histórico **Excluído**.
3. Testar concorrência, cálculos, metas/importação, Excel e os três perfis; apresentar os resultados e limitações.
4. Aguardar autorização separada para publicar.