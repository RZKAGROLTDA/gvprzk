# Aba Treinamentos — CRM do Vendedor (versão mínima)

Cada registro em `public.trainings` representa 1 treinamento agendado para 1 colaborador. Sem tasks, sem participantes, sem presença/status, sem alterações no CRM atual, follow-ups, auth ou RLS existentes.

## 1. CREATE TABLE final

```sql
CREATE TABLE public.trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  training_date date NOT NULL,
  training_time text NOT NULL,
  hours numeric NOT NULL,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  filial_id uuid,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_trainings_training_date ON public.trainings(training_date);
CREATE INDEX idx_trainings_user_id ON public.trainings(user_id);
CREATE INDEX idx_trainings_filial_id ON public.trainings(filial_id);
```

## 2. RLS proposta

GRANTs no mesmo migration, logo após CREATE TABLE:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainings TO authenticated;
GRANT ALL ON public.trainings TO service_role;

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
```

Políticas:

- **SELECT**
  - admin/manager: todos os registros.
  - supervisor: registros onde `filial_id` é a filial do supervisor (`get_supervisor_filial_id()`).
  - demais usuários: registros onde `user_id = auth.uid()`.

- **INSERT**
  - admin/manager: qualquer colaborador.
  - supervisor: apenas colaboradores da própria filial.
  - vendedor/RAC/consultor: apenas `user_id = auth.uid()`.

- **UPDATE / DELETE**
  - admin/manager: todos.
  - supervisor: registros da própria filial.
  - o próprio usuário: seus próprios registros (`user_id = auth.uid()`).

Todas as verificações de papel usam a função `public.has_role()`.

## 3. Regra de preenchimento do colaborador

No formulário de agendamento:

- **Se o usuário logado for vendedor, RAC ou consultor:**
  - `user_id` = `auth.uid()`
  - `user_name` = nome do próprio usuário
  - campo Colaborador fica oculto ou em modo somente leitura
  - não é possível selecionar outro colaborador

- **Se o usuário logado for supervisor, manager ou admin:**
  - exibe campo de seleção de colaborador
  - pesquisa por nome
  - exibe `Nome — Filial` na lista
  - preenche `user_id`, `user_name` e `filial_id` do colaborador selecionado

## 4. Desenho do formulário

Diálogo acionado pelo botão `+ Agendar Treinamento`.

Campos, na ordem:

1. **Colaborador**
   - Vendedor/RAC/Consultor: oculto/pré-preenchido com o próprio usuário.
   - Supervisor/Manager/Admin: combobox pesquisável com nome + filial.

2. **Nome do treinamento**
   - input de texto

3. **Data**
   - date picker (padrão do projeto)

4. **Horário**
   - input time (texto HH:MM)

5. **Quantidade de horas**
   - input numérico

Botão salvar insere uma única linha em `public.trainings`.

## 5. Aba Treinamentos (resumo)

- Nova aba ao lado das abas atuais do CRM.
- Botão `+ Agendar Treinamento` no topo.
- Filtros: Período, Colaborador, Filial.
- Tabela: Data, Horário, Colaborador, Filial, Treinamento, Horas.
- Ações de editar/excluir conforme permissão.
