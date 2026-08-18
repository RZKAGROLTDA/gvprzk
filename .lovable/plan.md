# Base Mestre de Clientes — modelagem e plano de importação

Auditoria refeita apenas com o arquivo novo (`pasted-2026-08-18T21-23-34-514Z.txt`), cruzando com as 7 tabelas atuais. Nada foi inserido, atualizado ou excluído.

## Alerta importante sobre a Regra B (raiz)

A Regra B foi definida sobre o arquivo ANTIGO, cujos códigos vinham com sufixo de estabelecimento. **O arquivo novo não tem esse formato** e o banco usa exatamente o mesmo padrão do arquivo novo:

| Verificação | Resultado |
|---|---|
| Códigos do banco que casam LITERALMENTE com o arquivo | 4.222 de 4.324 (97,6%) |
| Códigos do banco sem correspondência literal | 102 |
| Códigos únicos válidos no arquivo | 31.407 |
| Raízes (código sem os 4 últimos dígitos) no arquivo | 12.458 |

Aplicar a raiz como identidade agrupa clientes comprovadamente diferentes, porque nesse arquivo os 4 últimos dígitos são parte do código (CPF/CNPJ), não estabelecimento. Exemplos reais de fusão indevida pela raiz:

```text
raiz 7  -> ELETROGERAL GHELLER & BRUM LTDA + VANUBIA CONCEICAO DRAGO
raiz 11 -> CLAUDINEI GALIASSI + IMBE ENGENHARIA + PREFEITURA DE FATIMA + RODRIGO F. DE OLIVEIRA
raiz 39 -> 6 empresas distintas (MINISTERIO DA JUSTICA, INVENTUS POWER, CODEVASF...)
```
Pela raiz, 3.209 raízes apresentam nomes incompatíveis entre si — ou seja, ~19 mil clientes seriam colapsados em registros errados.

**Recomendação:** manter a identidade do cliente no código completo normalizado (`client_code_norm`), e ainda assim gravar `client_code_root` e `estabelecimento` como colunas auxiliares (para compatibilidade futura e para o caso de o ERP voltar a enviar códigos com estabelecimento). Se você confirmar a raiz como identidade, a carga precisa vir com uma coluna de estabelecimento explícita do ERP — hoje ela não existe no arquivo.

## Números da auditoria (identidade = código completo normalizado)

| Métrica | Valor |
|---|---|
| Linhas de dados | 32.716 |
| Linhas descartadas (código não numérico) | 14 |
| Códigos que não são clientes (formas de pagamento, CLIENTE PADRAO) | 65 |
| Códigos únicos válidos no arquivo | 31.407 |
| Já existentes no sistema | 4.222 |
| Novos | 27.185 |
| Clientes atuais que NÃO estão no arquivo (serão preservados) | 102 |
| **Base final prevista** | **31.509** |

### Códigos com mais de um nome: 519
- 411 são apenas variação de grafia/abreviação (ex.: `MUNICIPIO DE SAPUCAIA` vs `PREFEITURA MUNICIPAL DE SAPUCAIA`).
- 108 são conflitos reais (nomes de empresas diferentes no mesmo código). Nenhum nome será escolhido automaticamente nesses casos: eles entram com `name_conflict = true`, o nome mais recente/longo fica em `client_name` e todas as variações ficam em `name_variants`, para revisão na tela.

## Modelagem proposta

`public.clients_master`
- `client_code` — código original como veio do ERP (com zeros)
- `client_code_norm` — código normalizado, **UNIQUE** (identidade)
- `client_code_root` — raiz (código sem os 4 últimos dígitos), indexada
- `estabelecimento` — 4 últimos dígitos quando aplicável, senão nulo
- `client_name` — nome canônico
- `name_variants jsonb` — todas as grafias encontradas
- `name_conflict boolean` — marca os 108 casos para revisão
- `source` — `erp_import` / `legacy_system` / `manual`
- `is_active`, `created_at`, `updated_at` (trigger)

Grants: leitura para `authenticated`, escrita apenas `service_role` (a carga roda por edge function). RLS habilitado.

Índices: `client_code_norm` (unique), `client_code_root`, `name` com trigram para o autocomplete futuro.

## Plano de importação
1. Migration: cria a tabela, grants, RLS, trigger de `updated_at` e índices.
2. Carga em lotes via edge function administrativa (somente admin/service_role), com `import_batch_id` para rollback.
3. Semeia primeiro os 4.324 códigos legados (origem `legacy_system`), garantindo que os 102 fora do arquivo não sejam perdidos.
4. Insere os 31.407 códigos do arquivo com `ON CONFLICT (client_code_norm) DO NOTHING` — nada existente é sobrescrito.
5. Descarta os 65 códigos de forma de pagamento/CLIENTE PADRAO e as 14 linhas inválidas.
6. Validação final: contagem esperada 31.509 e relatório dos 108 conflitos de nome.

Nenhuma alteração em `client_equipment`, `tasks`, `task_followups`, `campaign_clients`, `campaign_clients_master`, `visit_schedules`, `special_conditions`, `search_clients` ou no frontend.

## Decisão necessária
- Confirmar identidade: **código completo normalizado** (recomendado, 31.509 clientes) ou **raiz** (15.540, com fusão comprovada de clientes distintos).
