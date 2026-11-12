# Pacotes e Negociações — revisão para aprovação

## Estrutura confirmada por consulta somente leitura
- `clients_master.id`: UUID, chave primária da base oficial utilizada na busca de clientes do GVPS. `clients_master` contém nome, código e indicador ativo; não possui filial. A seleção exige cliente ativo e usa UUID, não nome/código. Clientes legados ainda não presentes nessa base não são criados automaticamente.
- `clients.id`: pertence a outro cadastro com e-mail, etapas e datas de fluxo; não é a base oficial de autocomplete usada nesta proposta.
- `profiles.user_id`: UUID com restrição UNIQUE; relacionamento do responsável comercial. Autorização nunca usa `profiles.role`.
- `projection_scope`: valida usuário ativo/aprovado; administrador pode consultar todas; gerente/supervisor ficam em uma filial autorizada. Escopo vazio não libera acesso.
- `projection_filial_in`: exclui Tele Vendas e filiais desabilitadas para Projeção.

## Garantias da proposta
- Somente duas novas tabelas, funções e gatilhos próprios; nenhuma modificação em estruturas existentes.
- Tabelas sem acesso direto de `anon`, `authenticated` ou `PUBLIC`; acesso técnico concedido a `service_role`; leitura e gravação do aplicativo por funções com escopo validado.
- Gerente somente consulta; administrador/supervisor podem criar e editar no escopo permitido. Responsável selecionável é usuário aprovado/ativo com vínculo à filial da negociação.
- Valor não negativo, até duas casas decimais, sem arredondamento silencioso de entrada com precisão excessiva.
- Situação livre obrigatória; observações livres; cliente, responsável, valor, título, situação e observações editáveis. Filial/período permanecem fixos.
- Alteração e histórico na mesma transação; versão esperada obrigatória nas edições e bloqueio da linha impedem sobrescrita concorrente.
- Toda alteração grava os estados anterior/novo completos, além das colunas explícitas de valor/situação/responsável, nomes dos responsáveis, autor e horário. Regravar valores idênticos não duplica histórico.
- Histórico imutável e preservado; os nomes armazenados não dependem de renomeação futura do usuário.
- Listagem e histórico paginados por chave, até 500 por chamada; a interface deverá percorrer as páginas, sem truncar resultados.
- Um cliente ou responsável desativado já vinculado pode permanecer para permitir a atualização da situação; nova seleção exige cadastro ativo/autorizado.

## Testes previstos após autorização, em transação reversível
1. Administrador consulta filiais incluídas e cria negociação.
2. Supervisor cria/edita na Filial Ativa autorizada.
3. Supervisor não consulta/edita negociação de outra filial usando ID direto.
4. Gerente consulta sua filial autorizada, mas não cria nem edita.
5. Usuário sem acesso à Projeção e usuário não aprovado/inativo são recusados.
6. Filial inexistente, escopo não autorizado e Tele Vendas são recusados.
7. Acesso direto às tabelas e sequência é recusado para usuários comuns.
8. Cliente inexistente/inativo não pode ser nova seleção; UUID é preservado, inclusive com nomes iguais.
9. Responsável sem vínculo autorizado é recusado; vínculo adicional ativo é aceito.
10. Valor R$ 1.500.000,25 permanece exatamente 1500000.25; negativo, NaN e três decimais são recusados.
11. Mudanças de valor, situação e responsável preservam os valores anterior/novo, autor e horário.
12. Edição de cliente, identificação ou observações mantém snapshot completo no histórico.
13. Duas edições com a mesma versão: primeira aceita, segunda recusada, sem perda de informação.
14. Envio idêntico não incrementa versão nem duplica histórico.
15. Histórico não pode ser alterado ou apagado; paginação não perde nem duplica linhas.
16. Listagem devolve todos os campos e respeita mês/ano e Filial Ativa.

## Estado
Migração anterior cancelada antes da execução. Este SQL não foi aplicado; testes de execução e interface ainda não realizados. A revisão atual confirma a estrutura existente e examina o SQL proposto, não substitui testes de execução.
Não publicar.