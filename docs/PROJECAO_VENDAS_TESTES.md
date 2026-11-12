# Testes de permissão — Projeção (executados em BEGIN/ROLLBACK após aprovação)
Cada cenário simula o usuário via set_config('request.jwt.claims') com usuários reais do perfil; nada é gravado.

| # | Perfil | Ação | Esperado |
|---|---|---|---|
| 1 | Admin, sem filial | painel | todas as filiais (exceto Tele Vendas) |
| 2 | Admin | lançar em qualquer filial | aceito; histórico com o admin |
| 3 | Admin | importar metas (lote) + alterar 1 meta | histórico: 1 criado por meta, 1 alteração com valor anterior |
| 4 | Admin | reimportar mesmos valores | 0 novos históricos |
| 5 | Gerente, filial autorizada | painel | só aquela filial |
| 6 | Gerente, filial não autorizada | painel | 42501 |
| 7 | Gerente, sem filial ativa | painel | só filial principal; nunca global |
| 8 | Gerente | lançar | 42501 (somente visualiza) |
| 9 | Gerente | ler tabelas direto | só linhas das filiais autorizadas |
| 10 | Supervisor, Filial Ativa principal/adicional | painel e lançar | aceito só nela |
| 11 | Supervisor | lançar em outra filial | 42501 |
| 12 | Supervisor | metas/divisional | 42501 |
| 13 | Supervisor | Tele Vendas | 'Filial fora da Projeção' |
| 14 | Supervisor, Semana 2 depois da Semana 1 | painel | última = S2; S1 preservada; nada somado |
| 15 | Supervisor altera Semana 2 | histórico | 2 registros (criado, alterado) |
| 16 | RAC / CPA / CSA / Consultor | painel, lançar, ler tabelas | 42501 / 0 linhas |
| 17 | Reprovado ou inativo (qualquer cargo) | tudo | 42501 / 0 linhas |
| 18 | Qualquer um | gravar direto nas tabelas | negado (sem permissão de gravação) |
| 19 | Filial sem lançamento | painel | última semana vazia → PENDENTE |
| 20 | Semana 5, valor negativo, mês 13 | lançar | recusado pela validação |
