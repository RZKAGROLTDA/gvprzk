# Multi-Filial — Filial Ativa como filial efetiva (revisão de arquitetura, sem implementação)

## 1. Causa raiz (confirmada)

O banco conhece apenas duas coisas: a filial principal (`profiles.filial_id`) e o
**escopo autorizado** (`get_user_filial_ids_internal` = principal + adicionais ativas).
A Filial Ativa existe só no frontend, então:

- consultas com parâmetro de filial funcionam;
- consultas sem parâmetro devolvem a **união** das filiais (dado misturado);
- funções antigas devolvem sempre a **principal** (rótulo/escopo errado).

## 2. Alternativa A x Alternativa B

| Critério | A) `user_active_filial` no banco | B) Filial Ativa na sessão + parâmetro validado no banco |
| --- | --- | --- |
| Duas abas / dois dispositivos | **Falha**: uma linha por usuário; a aba B muda o contexto da aba A e a A passa a mostrar outra filial sem aviso | **Correto**: cada aba/dispositivo carrega o próprio contexto na requisição |
| Segurança | No banco | No banco: cada função valida `p_filial_id = ANY(get_user_filial_ids_internal(auth.uid()))`, senão erro `42501`. O frontend nunca amplia acesso |
| Alterações de RLS | Alta: as policies precisam ler a filial ativa (33 policies) | **Mínima**: RLS continua garantindo apenas o escopo autorizado |
| Risco de regressão | Alto (RLS + escrita a cada troca de filial) | Baixo (mudança concentrada em RPCs/consultas) |
| Filial única | Preservado | Preservado (ativa = principal) |
| Admin/manager global | Preservado | Preservado (`NULL` = todas) |
| Escrita no banco a cada troca | Sim (linha por usuário) | Não |
| Cache/React Query | Chave não muda → risco de dado velho | Filial entra na chave → invalidação natural |

### Recomendação: **B**

A é reprovada exatamente pelo risco levantado: estado global por usuário provoca
interferência entre abas e dispositivos, além de exigir mexer em toda a RLS.

Em B a segurança continua 100% no banco, porque a filial recebida é sempre conferida
contra `get_user_filial_ids_internal(auth.uid())` **dentro** de funções
`SECURITY DEFINER`, e a RLS permanece como segunda barreira: mesmo que alguém envie uma
filial não autorizada, a função rejeita e a RLS não devolveria as linhas.

## 3. Separação das duas regras

- **RLS = teto de permissão.** Continua respondendo "este usuário pode ver esta linha?"
  usando o escopo autorizado (M2, já validado). **Nenhuma das 33 policies precisa
  conhecer a Filial Ativa** — nenhuma delas é usada para *escolher* a filial exibida.
- **Consulta/RPC = seleção da filial.** Passa a receber a filial efetiva e filtrar por
  ela. `NULL` mantém o comportamento atual (todas as permitidas / global).

Exceções a tratar como **filtro na consulta**, não em RLS: leituras diretas de tabela no
frontend (Parque, Regularização, Campanhas, Treinamentos, Retornos, Tarefas) — passam a
enviar `filial_id` explicitamente.

## 4. Alterações necessárias

### Banco (todas com filial efetiva validada; `NULL` = comportamento atual)
1. `pops_scope(p_filial_id uuid DEFAULT NULL)` → `filial_id`/`filial_ids` refletem a
   filial efetiva (raiz do problema confirmado no POPS/máquinas).
2. `my_day_scope_v2`, `get_my_day_summary`, `get_my_day_details`,
   `get_my_day_team_summary` → novo parâmetro de filial efetiva.
3. `get_equipment_validation_summary`, `get_equipment_validators` → novo parâmetro.
4. `get_performance_by_filial_v2` e demais RPCs de KPI sem filtro de filial → novo parâmetro.
5. `get_secure_tasks_paginated_filtered` → aceitar filial por ID além do texto atual.
6. Função auxiliar única `assert_filial_allowed(p_filial_id)` reutilizada por todas.
7. **Nenhuma policy de RLS alterada nesta arquitetura.**
8. `get_user_filial_id`, `get_supervisor_filial_id` permanecem intactas (filial principal).

### Frontend
9. `useActiveFilialFilter`/`useUserFiliais` como única fonte da filial efetiva, sempre na
   chave do React Query (evita cache da filial anterior).
10. Telas de leitura: POPS, Parque, Validação, Regularização, CRM, Meu Dia, Retornos,
    Treinamentos, Campanhas, Relatórios/KPIs passam a enviar a filial efetiva.
11. Criação/operação (tarefas, visitas, checklists, condições especiais, férias) usa a
    filial efetiva em vez de `profile.filial_id`.

Etapas sugeridas: **E1** função de validação + POPS; **E2** Parque/Validação/Regularização;
**E3** CRM/Meu Dia/Retornos/Treinamentos; **E4** Campanhas/Relatórios/KPIs;
**E5** criação/operação. Uma aprovação por etapa.

## 5. Plano de testes (`BEGIN/ROLLBACK`, sem vínculo permanente)

1. Filial única (Jhonatan/Canarana): todos os números iguais ao baseline.
2. Diogo com Caiapônia+Planalto Verde, ativa = Caiapônia: igual ao baseline de Caiapônia,
   **sem soma** com Planalto Verde.
3. Ativa = Planalto Verde: dados exclusivamente de Planalto Verde em POPS (clientes,
   máquinas, serviços, contadores, filtros, Excel), Parque, Validação, Regularização,
   CRM, Meu Dia, visitas/retornos, campanhas, KPIs/relatórios.
4. Volta para Caiapônia: valores idênticos ao teste 2.
5. Filial não autorizada enviada pelo frontend: erro `42501` e nenhum dado.
6. Duas abas simultâneas com filiais diferentes: cada aba mantém a própria filial.
7. Admin/manager sem filial ativa: global; com filial ativa: apenas aquela.
8. Vínculo adicional desativado com Planalto Verde ativa: cai para a principal.
9. Nada alterado em cadastro, cargos, matrícula PM, Excel POPS, M1/M2.

Resultados apresentados como `Teste | Obtido | Esperado | Status`.
