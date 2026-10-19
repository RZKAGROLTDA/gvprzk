# Filtro de várias filiais: Validação e Regularização de Máquinas

Nada é aplicado no banco nem publicado sem a sua autorização para cada passo.

## 1. Validação de Máquinas (já implementado, falta a ordenação)
- O filtro "Filiais" continua como está.
- A ordenação estável depende do arquivo `docs/PARQUE_ORDEM_ESTAVEL.sql`, com SHA-256 `456bfedd...7922`. A mudança é uma linha só: acrescentar o código único da máquina como desempate.
- Para aplicar, é preciso uma destas duas coisas:
  - (A) o resultado do teste que você roda no editor SQL;
  - (B) sua autorização para aplicar e conferir em partes, com volta imediata se algo divergir.
- Depois de aplicado, confiro em partes pequenas:
  - Todas as filiais + Sem filial: 20.195 máquinas, sem repetidas nem faltando.
  - Querência + Canarana: 584.
  - Indicadores, filtros e exportação continuam batendo com a lista.

## 2. Como a Regularização funciona hoje
- **Tudo segue a Filial Ativa, uma filial por vez.** São 9 funções do servidor (pendências, contadores, máquinas por cliente, lista de lotes, detalhe, PDF, envio, validação, conclusão, cancelamento e retirada de máquina). Cada uma recebe uma única filial e confere a autorização.
- **Criação de lote:** a criação recusa quando uma máquina:
  - é de outra filial;
  - está sem filial, se o usuário não tiver visão global;
  - já está em outro lote aberto;
  - já foi regularizada;
  - não está como vendida, inativa ou sucateada.

  Além disso, o lote **é recusado quando junta filiais diferentes**.
- **Ações sobre um lote existente:** antes de qualquer ação, o servidor exige que todas as máquinas do lote sejam de uma única filial e que essa filial seja a Filial Ativa autorizada. Na visão global, isso é liberado.
- **"Erro de Envio":** hoje não existe como aba separada. O erro fica registrado no próprio lote, que continua em "Aguardando envio".

## 3. O que proponho mudar
**Tela**
- Novo filtro "Filiais" na Regularização, igual ao da Validação:
  - caixas de seleção, "Selecionar todas" e "Limpar seleção";
  - "Sem filial" só para Admin e Gerente;
  - seleção vazia mostra nenhum resultado.
- Ele vale para os indicadores, a lista de pendentes e todas as abas: Pendentes, Aguardando envio, Aguardando retorno, Em validação, Regularizados, Cancelados e a nova aba **Erro de Envio**. A nova aba mostra os lotes cujo último envio falhou e serve só para consulta. O lote continua na mesma etapa de antes.
- A seleção fica guardada só dentro da Regularização. A Filial Ativa do cabeçalho não muda.
- Na tela de pendentes, será possível marcar máquinas de filiais diferentes e criar um único lote com elas.

**Servidor** (uma migração, que só aplico com a sua aprovação)
- As funções de consulta (contadores, pendentes, máquinas por cliente e lista de lotes) passam a aceitar uma lista de filiais e a opção "Sem filial". Elas usam a mesma conferência da Validação: cada filial da lista precisa ser autorizada ao usuário, e uma filial não autorizada é recusada. As chamadas atuais continuam funcionando como hoje.
- **Criação de lote:** cai a regra "uma filial por lote". Em troca, cada máquina precisa pertencer a uma das filiais selecionadas e autorizadas. Continuam valendo todas as outras regras: duplicidade, lote aberto, já regularizada, situação, e "Sem filial" só na visão global.
- **Ações sobre lotes** (PDF, envio, reenvio, validação, conclusão, cancelamento e retirada): todas as filiais do lote precisam estar autorizadas ao usuário. Supervisor e RAC não mexem em lotes que tenham qualquer máquina de filial não autorizada.
- **A filial de cada máquina não muda.** Cada item do lote guarda a filial original da máquina, como hoje. A conclusão só muda a situação.
- **Permissões e acesso aos dados:** nenhuma permissão nem regra de acesso aos dados muda. Visitantes sem login continuam sem acesso.

## 4. Testes antes de aplicar (simulação que se desfaz no final)
- As chamadas atuais dão os mesmos totais de antes, tanto para Admin quanto para um usuário de filial única.
- Admin:
  - uma filial, várias filiais, e todas mais "Sem filial";
  - a soma por filial é igual ao total consolidado.
- Iuri (Vila Rica + Canarana):
  - cria lote com as duas filiais e consegue fazer todas as ações nele;
  - é recusado ao pedir Querência ou "Sem filial".
- Duplicidade: a mesma máquina não entra em dois lotes abertos.
- Os lotes atuais (os 13 aguardando envio e os cancelados) continuam iguais.

## 5. Riscos
- **A exceção passa a valer também para a Regularização.** Vou registrar isso na regra permanente: só Validação e Regularização juntam filiais; CRM, POPS e os demais continuam com uma filial só.
- **PDF e e-mail de um lote com várias filiais:** o cabeçalho continua usando o nome do cliente. O PDF mostra a filial de cada máquina. Se quiser outro formato, me diga.
- **Lotes antigos sem filial:** continuam disponíveis só para a visão global.
- **Erro de Envio:** a aba nova depende do registro de envio. Lotes antigos que falharam antes desse registro existir podem não aparecer nela.
- **O que não muda:** a publicação continua esperando a sua validação, e CRM, POPS e os demais módulos não são alterados.
