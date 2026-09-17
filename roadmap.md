# Roadmap

## M3 — Acesso Multi-Filial

- [x] Etapa 1 — Base de filiais do usuário (useUserFiliais, estado por sessão)
- [x] Etapa 2 — Seletor de filial ativa no cabeçalho
- [x] Etapa 3A — POPS, Agenda, Programação (listagem), Retornos
- [x] Etapa 3B — Carteira (RPC get_clients_overview_v2 multi-filial validado 12/12), Treinamentos, listas de consultores
- [ ] M3 Gestão Administrativa de Filiais Adicionais — interface em Gerenciar Usuários
  - Implementar campo Filiais Adicionais (dialog + hook), salvar via set_user_filiais
  - Bateria de testes reversível (inclui validação temporária Diogo Caiapônia+Planalto Verde, sem gravar permanente)
- [ ] Aguardando autorização: primeiro acesso multi-filial real (Diogo)

- [ ] M3 Filial Ativa efetiva: revisar arquitetura A (user_active_filial no banco) x B (sessão + parâmetro validado) e minimizar alterações de RLS antes de implementar E1
