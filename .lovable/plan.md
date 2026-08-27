# POPS — Correção de Regra de Negócio (universo total + escolha pelo RAC)

Nada será aplicado nesta etapa. Abaixo a arquitetura corrigida, o impacto no que já existe e a migration proposta.

## 1. Arquitetura corrigida

Princípios:

- A relação POPS enviada é a **fonte da verdade** do universo do programa. Todas as 5.077 linhas entram como máquinas POPS.
- `client_equipment` (Parque) é apenas **conferência/enriquecimento**. Sem vínculo, a máquina continua no programa.
- **Não há carteira pré-atribuída.** Nenhum cliente/máquina é reservado para um RAC.
- Visibilidade sempre pela **filial da máquina POPS** (filial do Parque quando vinculada; senão a filial derivada do `Dealer Location`).
- Responsável é gravado **no momento da execução** (quem registrou o serviço/OS), nunca antes.
- Meta = 1.000 máquinas **serviçadas** (com OS válida) dentro do período, sobre o universo completo.

```text
BASE POPS (5.077 linhas)
  -> pops_machines (todas, com ou sem equipment_id)
       -> RAC vê CLIENTES da sua filial (agregado)
            -> abre cliente -> lista máquinas (PENDENTE / EM ANDAMENTO / SERVIÇADA)
                 -> escolhe máquina -> executa -> registra serviço + OS
                      -> status SERVIÇADA -> +1 no realizado
```

## 2. Impacto sobre M1 e M2

M1 (programas, serviços, máquinas): estrutura permanece; muda apenas a obrigatoriedade de `equipment_id` e o papel de `responsible_user_id`.

M2 (importação e matching): permanece integralmente útil. O matching deixa de ser um filtro de entrada e passa a ser apenas enriquecimento. A confirmação do lote passa a criar máquina POPS para **todas** as linhas, inclusive `NAO_ENCONTRADA` e `REVISAR`.

Nada de M1/M2 será apagado agora.

## 3. Objetos da M2 que ficam desnecessários

| Objeto | Destino |
|---|---|
| `pops_client_assignments` | sem uso (mantida vazia; remoção somente após o módulo estabilizado) |
| `pops_assign_rac_by_client` | sem uso — remover depois |
| `pops_assign_rac_machines` | sem uso — remover depois |
| `pops_machines.responsible_user_id` | reaproveitado, mas com novo significado: quem executou/assumiu |
| `pops_portfolio_clients` | reaproveitado, reescrito sem depender de RAC atribuído |
| `pops_portfolio_client_machines` | reaproveitado, reescrito por filial da máquina |
| `pops_import_*` + matching | mantidos como estão |

## 4. RPCs que precisam mudar

- `pops_confirm_import_batch`: cria máquina POPS para toda linha do lote (não só MATCH_EXATO), gravando o snapshot da planilha e o `equipment_id` quando houver.
- `pops_portfolio_clients`: agrupa por cliente da BASE POPS, com contagem total/serviçadas/pendentes, filtrando por filial conforme o cargo. Sem `rac_user_id`.
- `pops_portfolio_client_machines`: lista máquinas do cliente com status e dados da planilha + dados do Parque quando vinculado.
- Novas: `pops_goal_summary` (meta/realizado/hoje/semana/mês) e `pops_goal_breakdown` (evolução diária, filial, RAC executor, serviço).
- A ser desenhado na etapa de execução: `pops_register_service` (grava serviço, OS, executor e status).

## 5. Como todas as máquinas entram no POPS

`pops_machines` passa a aceitar `equipment_id` nulo e a guardar o snapshot da linha da planilha. A unicidade passa a ser por **serial normalizado dentro do programa** (`program_id, pops_serial_norm`), o que mantém "uma máquina = um registro" mesmo sem Parque, e a unicidade por `equipment_id` continua válida quando ele existe.

## 6. Máquina da relação sem correspondência no Parque

Entra no programa normalmente, com `equipment_id = NULL` e `link_status = 'sem_vinculo'`. Fica trabalhável pelo RAC, aparece no cliente correspondente, conta para a meta ao ser serviçada, e pode ser vinculada ao Parque depois sem perder histórico. Nunca é substituída por outra máquina nem descartada.

## 7. Visibilidade por filial

`pops_filial_id` na máquina = filial do Parque quando vinculada, senão a filial resolvida do `Dealer Location`. As RPCs de carteira aplicam:

- RAC/CPA/CSA: `pops_filial_id = filial do usuário`
- Supervisor: `pops_filial_id = filial do supervisor` (toda a filial)
- Manager/Admin: global

Nenhum filtro por `responsible_user_id`.

## 8. Registro de quem executou

Na execução: `responsible_user_id = auth.uid()` no momento em que o RAC assume, e a OS/serviço registra `executed_by` + `executed_at` + `service_id` + número da OS. O indicador "por RAC" usa o executor do serviço, não uma atribuição prévia.

## 9. Realizado x meta de 1.000

- `META` = `pops_programs.goal_machines` (1.000)
- `SERVIÇADAS` = máquinas ativas do programa com `status = 'servicada'` e OS válida
- `FALTAM` = META − SERVIÇADAS; `ATINGIMENTO` = SERVIÇADAS / META
- Cortes hoje / semana (Seg–Dom) / mês em `America/Sao_Paulo`, pela data da OS

## 10. Migration corretiva proposta (não aplicada)

```sql
-- 1) Máquina POPS pode existir sem vínculo no Parque
ALTER TABLE public.pops_machines
  ALTER COLUMN equipment_id DROP NOT NULL,
  ADD COLUMN pops_serial            text,
  ADD COLUMN pops_serial_norm       text,
  ADD COLUMN pops_client_code       text,
  ADD COLUMN pops_client_code_norm  text,
  ADD COLUMN pops_client_name       text,
  ADD COLUMN pops_model             text,
  ADD COLUMN pops_product_series    text,
  ADD COLUMN pops_manufacture_year  text,
  ADD COLUMN pops_platform          text,
  ADD COLUMN pops_dealer_location   text,
  ADD COLUMN pops_filial_id         uuid REFERENCES public.filiais(id),
  ADD COLUMN link_status            text NOT NULL DEFAULT 'sem_vinculo',
  ADD COLUMN import_row_id          uuid REFERENCES public.pops_import_rows(id);

-- 2) Unicidade: por serial da base POPS e, quando houver, por equipamento
CREATE UNIQUE INDEX pops_machines_program_serial_uidx
  ON public.pops_machines (program_id, pops_serial_norm)
  WHERE pops_serial_norm IS NOT NULL AND active;

-- índice antigo por equipment_id passa a ser parcial (só quando vinculado)
DROP INDEX IF EXISTS pops_machines_program_equipment_uidx;
CREATE UNIQUE INDEX pops_machines_program_equipment_uidx
  ON public.pops_machines (program_id, equipment_id)
  WHERE equipment_id IS NOT NULL AND active;

-- 3) Trigger de consistência: serial ou equipamento obrigatório; link_status derivado
CREATE OR REPLACE FUNCTION public.pops_machines_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pops_serial IS NOT NULL THEN
    NEW.pops_serial_norm := public.pops_norm_serial(NEW.pops_serial);
  END IF;
  IF NEW.pops_client_code IS NOT NULL THEN
    NEW.pops_client_code_norm := public.pops_norm_code(NEW.pops_client_code);
  END IF;
  IF NEW.equipment_id IS NULL AND NEW.pops_serial_norm IS NULL THEN
    RAISE EXCEPTION 'Maquina POPS exige vinculo no Parque ou serial da base POPS';
  END IF;
  NEW.link_status := CASE WHEN NEW.equipment_id IS NULL THEN 'sem_vinculo' ELSE 'vinculado' END;
  IF NEW.equipment_id IS NOT NULL THEN
    SELECT e.filial_id INTO NEW.pops_filial_id FROM public.client_equipment e WHERE e.id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pops_machines_normalize_trg
  BEFORE INSERT OR UPDATE ON public.pops_machines
  FOR EACH ROW EXECUTE FUNCTION public.pops_machines_normalize();

-- 4) Leitura/RLS por filial da máquina, sem depender de responsável
CREATE OR REPLACE FUNCTION public.pops_can_read_machine(p_machine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.pops_is_manager() THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.pops_machines m
       WHERE m.id = p_machine_id
         AND m.pops_filial_id = public.get_user_filial_id()
    )
  END
$$;

-- 5) Confirmação do lote passa a materializar TODAS as linhas
--    (reescrita completa de pops_confirm_import_batch, sem filtrar match_status)
--    + reescrita de pops_portfolio_clients / pops_portfolio_client_machines
--    sem rac_user_id, filtrando por pops_filial_id.

-- 6) Objetos que deixam de ser usados (mantidos por ora, sem DROP):
--    pops_client_assignments, pops_assign_rac_by_client, pops_assign_rac_machines.
```

Ordem sugerida de execução, após sua aprovação:

1. Migration corretiva de estrutura (itens 1–4).
2. Reescrita de `pops_confirm_import_batch` e das RPCs de carteira (item 5).
3. Confirmação do lote real já importado, materializando as 5.077 máquinas.
4. RPCs de meta e, depois, a etapa de execução (serviço + OS).
