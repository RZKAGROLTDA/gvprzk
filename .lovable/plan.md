# M3 / E1 — Revisão final antes de aplicar (POPS + Filial Ativa)

Nada foi aplicado. Resultado da revisão e versão final abaixo.

## 1. Achados da revisão

| # | Ponto verificado | Achado | Correção na versão final |
| --- | --- | --- | --- |
| 1 | `effective_filial_ids` para admin/manager | Aceitava qualquer UUID informado | Passa a exigir que a filial exista no cadastro de filiais (`public.filiais`), senão erro `42501`. `NULL` continua = visão global |
| 2 | `pops_goal_summary` (`usePopsGoalSummary`) | Enviava `p_filial_id: filialId ?? undefined` — a chave é **omitida** e o banco assume `NULL` | Passa a enviar `?? null` explicitamente |
| 3 | `pops_executor_results` (`usePopsExecutorResults`) | Mesmo problema do item 2 | Passa a enviar `?? null` |
| 4 | `pops_portfolio_clients` (`usePopsClients`) | Já envia `filialId` explicitamente | Sem mudança |
| 5 | `pops_portfolio_client_machines` (`usePopsClientMachines`) | **Não recebia filial nenhuma**; usava a filial principal do cadastro (`pops_scope`) — este é o problema confirmado nas máquinas | Ganha parâmetro de filial efetiva e o frontend passa a enviá-lo |
| 6 | Excel “Serviçadas” (`popsServicedExcel.ts`) | Leitura direta de `pops_machines` já filtra por `pops_filial_id` quando há filial; mas a busca de nomes dos executores usava `?? undefined` | `?? null` explícito. Com Planalto Verde ativa, nenhuma máquina de Caiapônia entra no arquivo |
| 7 | Dependência de `NULL` | Usuário multi-filial podia escolher “Todas as permitidas” no filtro local, o que **misturaria** as duas filiais | Para quem não é admin/manager: (a) o filtro local do POPS deixa de oferecer “Todas”; (b) no banco, `NULL` de usuário não-global passa a significar **somente a filial principal**, nunca a união |
| 8 | Outras consultas da tela POPS | `pops_programs` e `pops_services` não dependem de filial; `pops_client_assignments` não é consultada pelo frontend; `pops_complete_machine` é escrita de uma máquina já listada e continua protegida pela RLS | Sem mudança nesta etapa |
| 9 | RLS | Continua sendo o teto de permissão (escopo autorizado M2) | **Nenhuma das 33 policies alterada** |
| 10 | `pops_scope`, `get_user_filial_id`, `get_supervisor_filial_id` | Usadas pela RLS e por outros módulos | Mantidas intactas |

Observação: o cadastro de filiais (`public.filiais`) não possui coluna de “ativa”; a
validação possível é de existência da filial, o que já impede filial inválida.

## 2. Versão final — banco

Nova função de segurança (única fonte da filial efetiva):

```sql
CREATE OR REPLACE FUNCTION public.effective_filial_ids(p_filial_id uuid DEFAULT NULL)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_global boolean;
  v_allowed uuid[];
  v_primary uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;

  v_global := public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager');

  IF p_filial_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.filiais f WHERE f.id = p_filial_id) THEN
    RAISE EXCEPTION 'Filial inexistente' USING ERRCODE='42501';
  END IF;

  IF v_global THEN
    RETURN CASE WHEN p_filial_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_filial_id] END;
  END IF;

  v_allowed := public.get_user_filial_ids_internal(v_uid);
  IF coalesce(array_length(v_allowed,1),0) = 0 THEN
    RAISE EXCEPTION 'Acesso negado: usuário sem filial autorizada' USING ERRCODE='42501';
  END IF;

  IF p_filial_id IS NOT NULL THEN
    IF NOT (p_filial_id = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'Acesso negado: filial não autorizada' USING ERRCODE='42501';
    END IF;
    RETURN ARRAY[p_filial_id];
  END IF;

  -- Sem Filial Ativa: filial principal do cadastro (nunca a união de filiais)
  SELECT p.filial_id INTO v_primary FROM public.profiles p
   WHERE p.user_id = v_uid AND p.approval_status='approved' AND p.employment_status='active';
  RETURN CASE WHEN v_primary IS NULL THEN v_allowed ELSE ARRAY[v_primary] END;
END $$;
REVOKE EXECUTE ON FUNCTION public.effective_filial_ids(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.effective_filial_ids(uuid) TO authenticated;
```

Nas 4 RPCs do POPS (`pops_goal_summary`, `pops_portfolio_clients`,
`pops_executor_results`, `pops_portfolio_client_machines`), a única mudança de lógica é
trocar a filial derivada do cadastro por:

```sql
v_filiais := public.effective_filial_ids(p_filial_id);
...  AND (cardinality(v_filiais) = 0 OR m.pops_filial_id = ANY(v_filiais))
```

e devolver `filial_id` = a filial efetiva (ou `NULL` na visão global).
`pops_portfolio_client_machines` é recriada com a assinatura
`(p_program_id uuid, p_client_key text, p_filial_id uuid DEFAULT NULL)` — sem
sobrecarga — com `GRANT EXECUTE` para `authenticated`. Todo o resto (filtros, busca,
paginação, ordenação e formato de retorno) permanece idêntico.

## 3. Versão final — frontend

- `src/hooks/usePops.ts`: `?? null` em vez de `?? undefined` nas 3 RPCs; `usePopsClientMachines(programId, clientKey, filialId)` com a filial na chave de cache.
- `src/pages/Pops.tsx`: envia `filialId` também para as máquinas do cliente; filtro local sem opção “Todas” para quem não é admin/manager.
- `src/lib/popsServicedExcel.ts`: `?? null` na busca de executores (o filtro por filial na leitura das máquinas já existe).

## 4. Plano de testes (`Teste | Filial Ativa | Obtido | Esperado | Status`)

1. Contagens reais de POPS em Caiapônia e Planalto Verde (baseline direto na base).
2. Diogo, Caiapônia ativa: carteira, máquinas, foco/pendentes, serviçadas, contadores, indicadores, serviços, executores, filtros, busca, detalhes e Excel = apenas Caiapônia.
3. Diogo, Planalto Verde ativa: os mesmos itens = apenas Planalto Verde.
4. Volta para Caiapônia: valores idênticos ao teste 2.
5. Terceira filial enviada na RPC: `42501`, nenhum dado.
6. Filial inexistente enviada por admin/manager: `42501`.
7. Usuário de filial única (Jhonatan/Canarana): idêntico ao baseline atual.
8. Admin/manager sem filial: visão global; com filial: apenas aquela.
9. Excel Serviçadas com Planalto Verde ativa: nenhuma máquina de Caiapônia, Matrícula PM preservada.
10. Nada alterado em RLS, cadastro, cargos, matrículas ou vínculos.

Tudo reversível (`BEGIN/ROLLBACK`); o vínculo do Diogo é temporário no teste.
