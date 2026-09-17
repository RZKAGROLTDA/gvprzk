# M3 — Gestão de Filiais Adicionais no Administrativo (diagnóstico + plano)

Somente levantamento. Nada implementado, nada alterado no banco.

## 1. Onde o campo será incluído

Tela **Gerenciar Usuários** (`Users`), na lista de "Usuários Aprovados".

- A coluna **Filial** continua exibindo apenas a **Filial Principal** (lógica atual intacta).
- Nova coluna **Filiais Adicionais**:
  - exibe as adicionais ativas como etiquetas (ou "Nenhuma");
  - para administrador/gestor autorizado, um botão "Gerenciar" abre uma janela com a seleção múltipla.
- A janela mostra: Filial Principal (somente leitura) + lista de filiais com caixas de seleção, marcando as adicionais ativas. Botões Salvar / Cancelar.
- Para quem não tem permissão, a coluna é apenas de leitura, sem botão.

## 2. Componentes/arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/pages/Users.tsx` | nova coluna + botão + estado da janela |
| `src/components/users/AdditionalFiliaisDialog.tsx` (novo) | janela de seleção múltipla |
| `src/hooks/useUserAdditionalFiliais.ts` (novo) | carregar e salvar as adicionais de um usuário |

Nada em `useUserFiliais`, `FilialSelector`, `activeFilial`, RLS, M1/M2 ou Excel do POPS.

## 3. Carregamento das filiais atuais

- Lista de filiais: já carregada em `Users.tsx` (`filiais`), reaproveitada.
- Adicionais ativas do usuário selecionado: leitura de `user_filiais` filtrando pelo usuário e por vínculos ativos, carregada quando a janela abre (cache curto, sem refetch em foco).
- Nada é inferido por cargo, região ou nome de filial.

## 4. Salvamento

- Uma única chamada a `set_user_filiais(target_user_id, filial_ids)` com a lista completa de adicionais marcadas.
- A função já validada é a responsável por: autorização do solicitante, existência do perfil alvo, remoção da principal da lista efetiva, reativação/desativação de vínculos, preservação de histórico e registro na auditoria (`requested_filial_ids`, `effective_additional_filial_ids`, `primary_filial_id`).
- Desmarcar uma filial equivale a enviá-la fora da lista → o vínculo é desativado e o acesso encerrado.
- Após salvar: mensagem de sucesso e atualização da lista e do escopo do usuário afetado.

## 5. Como a principal não entra como adicional

Três camadas:
1. a filial principal é exibida separada e **não aparece** entre as opções marcáveis;
2. antes de enviar, o frontend remove a principal da lista;
3. a função no banco já descarta a principal da lista efetiva.

## 6. Testes previstos

- Usuário sem adicional: coluna "Nenhuma"; comportamento das telas idêntico ao atual.
- Adicionar 1 adicional; verificar exibição e escopo do usuário (2 filiais).
- Adicionar 2 adicionais e depois retirar 1; verificar encerramento do acesso.
- Retirar todas: usuário volta exatamente ao estado de filial única.
- Principal não selecionável e ignorada mesmo se forçada.
- Usuário sem permissão não vê o botão e a chamada é recusada pelo banco.
- Auditoria registrada em cada alteração, com os campos esperados.
- Admin/manager continuam globais.
- Caso final: Diogo Jesus Silva com Caiapônia + Planalto Verde, conferindo troca de filial ativa no cabeçalho.
- Testes de banco em `BEGIN/ROLLBACK`; nenhum vínculo permanente sem sua autorização.
