# Roadmap

## Acesso Multi-Filial (em aprovação)
- [x] M1: tabela `user_filiais` + funções centrais + `set_user_filiais` (migration aplicada)
- [x] M1-testes: bateria de validação executada (rollback total, 8/8 OK)
- [x] M2: migration aplicada (`user_same_filial`, `pops_scope`, `can_insert_vacation`, `my_day_scope_v2` + RLS de escopo)
- [ ] M2-testes: bateria corrigida (T9 com colunas reais, admin e manager separados, cobertura de todas as RLS alteradas) em BEGIN/ROLLBACK — aguardando autorização
- [ ] M2.1: lacuna antiga de `admin` nas policies de `clients` (tratar separadamente)
- [ ] M3: adaptar RPCs de escopo (métricas, gestão, tarefas, CRM, POPS, Meu Dia, Regularização)
- [ ] F1: hook `useUserFiliais` + tela administrativa em Gerenciar Usuários (com invalidação ampla de cache)
- [ ] F2: filtros multi-filial nas telas afetadas
- [ ] V1: aplicar caso Diogo (RAC, principal Caiapônia, adicional Planalto Verde)

## Débito técnico
- [ ] Migrar `tasks.filial` (texto) para `tasks.filial_id` (uuid)
- [ ] Consolidação das duas contas do Diogo preservando histórico

## Restaurar acesso Diogo corporativo (prioridade)
- [x] Desbanir auth diogo.silva@rzkagro.com.br (Admin Auth API via edge function `reactivate-user`)
- [ ] Reativar profile SEM desabilitar triggers globais (executar update com JWT de manager/admin dentro da edge function)
- [ ] Profile approved/active, deactivated_at null, filial Caiaponia
- [ ] Garantir role RAC em user_roles
- [ ] Validar estado final
