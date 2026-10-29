# Condição Especial — período, tipo e margem

## Escopo e autorização
Melhorar somente a aba Condição Especial. Este plano não executa migração, não altera telas nem publica. A implementação começa após a aprovação das mudanças abaixo; a publicação continuará dependendo de autorização separada.

## 1. Período e filtros
- Ao abrir a aba ou limpar os filtros, selecionar do primeiro dia do mês atual até hoje, usando datas locais.
- Manter a **Data Venda** como referência do período, como na tela atual, com início e fim inclusivos. Não substituir datas ausentes por datas de cadastro.
- Permitir qualquer período histórico. Preservar os filtros existentes e acrescentar **Tipo de Condição: Todos / Condição Safra / Condição Normal**.
- Aplicar o período na consulta, antes de carregar registros: não buscar todo o histórico na abertura.
- Tabela, cinco indicadores existentes, novo indicador e Excel usarão exatamente o mesmo conjunto filtrado e autorizado.
- Registros sem Data Venda continuarão preservados e acessíveis quando o período estiver sem limites; limpar filtros voltará ao mês atual.

## 2. Formulário, tabela e Excel
- Acrescentar **Tipo de Condição** obrigatório na criação e no salvamento da edição, com Safra e Normal. Registros antigos abrirão sem seleção; sua classificação será manual, sem atualização em massa.
- Acrescentar **Margem %** opcional, manual e editável, com duas casas decimais, junto a Valor Venda, Desconto % e Desconto Total.
- Não calcular margem pelo desconto. Campo vazio será armazenado como ausência de informação; zero informado será um valor válido.
- Exibir tipo e margem na tabela e acrescentar as duas colunas ao Excel, preservando todas as colunas atuais. Dados ausentes ficarão em branco no arquivo.
- Manter regras atuais de edição, status, aprovação, rejeição, exclusão e histórico. Aprovar/rejeitar registros antigos não exigirá classificá-los; a obrigatoriedade vale ao salvar o formulário de criação/edição.

## 3. Indicadores
Manter sem mudanças de fórmula: **Qtd. Condições, Valor Total Vendido, Desconto Médio, Desconto Total e Ticket Médio**.

Adicionar **Margem Média %**:

```text
Σ (Valor Venda × Margem %) / Σ Valor Venda
```

- Numerador e denominador consideram somente registros com margem preenchida, dentro dos mesmos filtros.
- Margem zero participa; margem ausente não participa.
- Se não houver margens preenchidas ou a soma dos valores de venda elegíveis for zero, mostrar **Sem dados suficientes**, nunca uma média fictícia.
- Arredondar apenas o resultado exibido para duas casas decimais.
- Exemplo de teste: vendas de R$ 100 com margem de 10% e R$ 300 com margem de 20% resultam em **17,50%**, não 15%. Uma venda adicional sem margem não altera esse resultado.

## 4. Alterações técnicas no banco — para aprovação
Adicionar somente duas colunas em `public.special_conditions`, ambas anuláveis e sem valor padrão:

```sql
ALTER TABLE public.special_conditions
  ADD COLUMN condition_type text,
  ADD COLUMN margin_percent numeric(12,2);

ALTER TABLE public.special_conditions
  ADD CONSTRAINT special_conditions_condition_type_valid
  CHECK (condition_type IS NULL OR condition_type IN ('safra', 'normal'));
```

- `condition_type`: valores armazenados `safra`/`normal`; nomes apresentados Condição Safra/Condição Normal.
- `margin_percent`: valor manual com precisão de duas casas; nenhum cálculo automático e nenhum intervalo percentual arbitrário imposto.
- A validação fixa do tipo aceita ausência nos registros antigos. O formulário exigirá uma escolha antes de salvar uma criação ou edição.
- Não executar UPDATE, preenchimento retroativo, alteração de RLS, concessões, cargos, filiais ou vínculos.
- Não alterar os gatilhos existentes de status, aprovação, nome do vendedor ou atualização de data.
- Não criar tabelas nem funções SECURITY DEFINER; as consultas continuarão usando o acesso atual, sob RLS.

### Consulta e compatibilidade
- Atualizar os campos explícitos consultados e enviados, sem editar manualmente os tipos gerados pelo Supabase.
- Retirar o teto atual de uma única consulta de 1.000 linhas: carregar páginas de até 1.000, com ordenação por ID e avanço pelo último ID retornado, até terminar.
- Manter o escopo de acesso atual, sem combinar filiais ou ampliar autorização. Preservar as demais condições dos filtros.
- Não apresentar indicadores ou liberar Excel como completos enquanto houver lotes pendentes; em falha, não gerar arquivo parcial.
- Nenhuma alteração nas demais abas ou nas exportações da Análise Gerencial.

## 5. Validação após aprovação
- Testar abertura e limpeza no mês atual, inclusive virada de mês e datas locais; intervalo histórico inclusivo.
- Testar criação e edição exigindo tipo, e preservação de registros antigos sem tipo/margem.
- Testar margem manual com duas casas, zero e ausência de valor; comprovar que desconto não modifica margem.
- Testar média ponderada com o exemplo de 17,50%, exclusão de valores ausentes e ausência de denominador válido.
- Conferir as cinco fórmulas existentes, filtragem Safra/Normal/Todos e correspondência entre tabela, indicadores e Excel.
- Validar paginação com mais de 1.000 registros, IDs únicos e interrupção sem arquivo em caso de falha.
- Conferir os acessos de vendedores, supervisores e gerentes e o fluxo de aprovação, sem mudar permissões ou registros reais para realizar os testes.

## Estado atual
Análise somente de leitura: existem **410 condições**, das quais **401 têm Data Venda** e **9 não têm**. Não há campos de tipo ou margem hoje. Nenhuma migração foi executada e nenhuma tela foi alterada ou publicada nesta etapa.