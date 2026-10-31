# Auditoria de Duplicidade de Chassis — Campanha JD

## Objetivo
Cruzar a base de chassis já enviados à John Deere com **todos** os checklists do GVPS (2.587 checklists, 2.582 com chassi na ficha), classificando cada um como "Já enviado à JD", "Disponível" ou "Sem chassi" — na tela e no Excel — sem alterar checklists, vínculos ou regras de acesso.

## Banco de dados (migração apresentada para aprovação antes de aplicar)

**1. Tabela `public.jd_chassis_import_batches`** (histórico de importações)
- Campos: nome do arquivo, quem importou, data, total de linhas, chassis novos, duplicados ignorados.
- Nunca apaga registros: cada atualização da base gera um novo lote, preservando o histórico.

**2. Tabela `public.jd_chassis_base`** (base consolidada de chassis enviados à JD)
- Campos: chassi normalizado (único), chassi original, lote de origem, data.
- Normalização no servidor: maiúsculas + remoção de espaços, ignorando diferenças de caixa/espaços.
- `ON CONFLICT DO NOTHING`: duplicidades dentro do arquivo ou já existentes na base são ignoradas e contadas.
- GRANTs: leitura para usuários autenticados; escrita apenas via função de importação.
- RLS: leitura autenticada; nenhuma escrita direta por usuários.

**3. Função `import_jd_chassis(chassis text[], filename text)`** (SECURITY DEFINER)
- Valida `has_role(auth.uid(), 'admin')` — somente administradores importam/atualizam.
- Normaliza, deduplica, insere novos, registra o lote e retorna o resumo (novos/duplicados).

**4. Classificação dinâmica (sem campo novo em `tasks`)**
- A situação JD é calculada por cruzamento no banco (join com o chassi normalizado de `tasks.checklist_machine->>'chassi_serie'`).
- Por ser calculada, vale automaticamente para registros históricos e para novos checklists — nenhuma atualização em massa, nenhum checklist é alterado.

## Como é garantida a auditoria de 100% dos checklists
- O cruzamento acontece **no banco de dados**, não na tela: não depende de paginação, período, filial ou vendedor.
- As RPCs existentes (`get_service_opportunities_details` e `get_management_activity_export`) passam a incluir a coluna `jd_status` calculada por join.
- A auditoria abrange todos os checklists, mas cada usuário continua recebendo **somente os registros que seu perfil e filial já permitem** — os filtros atuais das RPCs permanecem intactos.
- Sem chassi na ficha → "Sem chassi" (não depende de vínculo com o Parque de Máquinas).

## Interface

**Importação (somente administradores)**
- Nova opção administrativa (em Configurações/Administração): upload de Excel/CSV, pré-visualização com resumo (total, novos, duplicados, inválidos) e confirmação antes de gravar.

**Relatório de Oportunidades (Análise Gerencial → Oportunidades de Serviço)**
- Nova coluna "Situação JD" apenas nos registros do tipo Checklist:
  - Vermelho: "Já enviado à JD"
  - Verde: "Disponível"
  - Amarelo: "Sem chassi"
- Novo filtro por Situação JD.
- Demais tipos de oportunidade sem classificação JD.

**Exportação Excel de Checklists (Análise Gerencial → Relatório)**
- Nova coluna "Situação JD" na aba principal, com a mesma classificação da tela.

## Validações previstas (somente leitura)
- Testes unitários: normalização (caixa/espaços), deduplicação, classificação nos três estados.
- Simulação com base de teste em transação reversível: cruzamento cobre 100% dos 2.587 checklists.
- Excel gerado e reaberto conferindo a coluna.
- Verificação de que usuário não-admin não consegue importar (erro de permissão).

## Fora de escopo
- Nenhuma alteração em checklists, vínculos de máquinas, RLS existente, fluxo de aprovação ou outras funcionalidades.
- Nenhuma publicação sem autorização final.
