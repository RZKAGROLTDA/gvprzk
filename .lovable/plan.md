# POPS — Ajustes críticos antes da migration corretiva

Nada foi aplicado. Abaixo as duas auditorias pedidas e o SQL corrigido.

## 1. Auditoria Dealer Location → Filial (5.077 linhas)

Comparação por nome normalizado (maiúsculas, sem acento, sem espaços nas pontas):

| Dealer Location | Máquinas | Filial encontrada | Situação |
|---|---:|---|---|
| MINEIROS | 1.033 | Mineiros | segura |
| QUERENCIA | 921 | Querência | segura |
| CANARANA | 438 | Canarana | segura |
| BARRA DO GARCAS | 434 | Barra do Garças | segura |
| AGUA BOA | 423 | Água Boa | segura |
| ALTO TAQUARI | 382 | Alto Taquari | segura |
| PLANALTO VERDE | 374 | Planalto Verde | segura |
| SAO FELIX DO ARAGUAIA | 306 | — | **NÃO ENCONTRADA** |
| PORTO ALEGRE DO NORTE | 239 | Porto Alegre do Norte | segura |
| GAUCHA DO NORTE | 186 | Gaúcha do Norte | segura |
| SAO JOSE DO XINGU | 181 | São José do Xingu | segura |
| VILA RICA | 141 | Vila Rica | segura |
| CAIAPONIA | 19 | Caiapônia | segura |

- 13 valores distintos, nenhum vazio, nenhum ambíguo (todo match tem exatamente 1 filial).
- **4.771 máquinas** com filial segura; **306 máquinas** ficam com pendência de filial (São Félix do Araguaia não existe em `public.filiais`).
- Nenhum matching por aproximação/similaridade será usado: apenas igualdade do nome normalizado.

Decisão necessária sua: cadastrar a filial "São Félix do Araguaia" em `public.filiais`, ou manter as 306 máquinas com `pops_filial_pendente = true` até definição. Em ambos os casos elas entram no POPS e ficam visíveis para gestão (manager/admin), sem desaparecer.

Observação relevante encontrada na base: o **Dealer Account Number é único por Dealer Location** (1 código por filial), portanto ele **não identifica o cliente**. A identidade do cliente na BASE POPS é o **Nome Cliente** — 1.698 clientes distintos. A visão por cliente será agrupada por nome de cliente normalizado, não pelo Dealer Account Number.

## 2. Auditoria de seriais duplicados

| Métrica | Valor |
|---|---:|
| Total de linhas | 5.077 |
| Seriais normalizados únicos | 5.077 |
| Seriais repetidos | 0 |
| Grupos duplicados | 0 |
| Grupos com conflito (cliente/modelo/filial divergentes) | 0 |
| Seriais ausentes ou curtos (<6) | 0 |

Não há duplicidade na base real. A `UNIQUE (program_id, pops_serial_norm)` é segura e nenhuma linha será perdida por ela. Ainda assim a regra de tratamento fica implementada para importações futuras (item 4).

## 3. Regra final de materialização de `pops_machines`

Para cada serial normalizado distinto do lote, cria-se **1** máquina POPS:

- `pops_serial_norm` como identidade física dentro do programa;
- `equipment_id` preenchido quando o matching apontou vínculo (MATCH_EXATO ou revisão aprovada); nulo caso contrário;
- snapshot da planilha gravado na máquina (serial, cliente, modelo, série, ano, plataforma, dealer location);
- `import_row_id` aponta para a linha de origem escolhida (menor `row_number` do grupo);
- linhas restantes do mesmo serial permanecem em `pops_import_rows` e recebem `confirmed_machine_id` da mesma máquina — auditáveis, sem gerar segundo realizado.

## 4. Linhas duplicadas da planilha (regra para o futuro)

- Mesmo serial + mesmo cliente/modelo/filial → 1 máquina, todas as linhas vinculadas a ela.
- Mesmo serial com divergência de cliente, modelo ou filial → **nenhuma decisão automática**: as linhas ficam `match_status = 'REVISAR'` com motivo "Serial repetido com dados divergentes" e **não** geram máquina até resolução gerencial.

## 5. Máquinas sem vínculo no Parque

Entram no programa com `equipment_id = NULL`, `link_status = 'sem_vinculo'`, filial resolvida pelo Dealer Location. São trabalháveis, contam para a meta quando serviçadas e podem ser vinculadas ao Parque depois sem perder histórico. Nunca substituídas nem descartadas.

## 6. Modelagem corrigida de `pops_filial_id`

```text
equipment_id IS NOT NULL  -> pops_filial_id = client_equipment.filial_id
equipment_id IS NULL      -> pops_filial_id = filial cujo nome normalizado
                             = normalização(pops_dealer_location)
sem correspondência       -> pops_filial_id = NULL
                             e pops_filial_pendente = true (visível à gestão)
```

## 7. SQL corrigido (não aplicado)

```sql
-- Normalização de nome de filial/local
CREATE OR REPLACE FUNCTION public.pops_norm_place(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(upper(btrim(regexp_replace(
    translate(p,'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC'),
    '\s+',' ','g'))),'')
$$;

-- Estrutura: máquina POPS pode existir sem vínculo no Parque
ALTER TABLE public.pops_machines
  ALTER COLUMN equipment_id DROP NOT NULL,
  ADD COLUMN pops_serial            text,
  ADD COLUMN pops_serial_norm       text,
  ADD COLUMN pops_client_code       text,
  ADD COLUMN pops_client_name       text,
  ADD COLUMN pops_client_name_norm  text,
  ADD COLUMN pops_model             text,
  ADD COLUMN pops_product_series    text,
  ADD COLUMN pops_manufacture_year  text,
  ADD COLUMN pops_platform          text,
  ADD COLUMN pops_dealer_location   text,
  ADD COLUMN pops_filial_id         uuid REFERENCES public.filiais(id),
  ADD COLUMN pops_filial_pendente   boolean NOT NULL DEFAULT false,
  ADD COLUMN link_status            text NOT NULL DEFAULT 'sem_vinculo',
  ADD COLUMN import_row_id          uuid REFERENCES public.pops_import_rows(id);

CREATE UNIQUE INDEX pops_machines_program_serial_uidx
  ON public.pops_machines (program_id, pops_serial_norm)
  WHERE pops_serial_norm IS NOT NULL AND active;

DROP INDEX IF EXISTS pops_machines_program_equipment_uidx;
CREATE UNIQUE INDEX pops_machines_program_equipment_uidx
  ON public.pops_machines (program_id, equipment_id)
  WHERE equipment_id IS NOT NULL AND active;

CREATE INDEX pops_machines_filial_idx  ON public.pops_machines (program_id, pops_filial_id) WHERE active;
CREATE INDEX pops_machines_cliente_idx ON public.pops_machines (program_id, pops_client_name_norm) WHERE active;

-- Trigger: identidade, filial e link_status derivados
CREATE OR REPLACE FUNCTION public.pops_machines_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_filial uuid; v_n int;
BEGIN
  NEW.pops_serial_norm      := public.pops_norm_serial(NEW.pops_serial);
  NEW.pops_client_name_norm := public.pops_norm_place(NEW.pops_client_name);

  IF NEW.equipment_id IS NULL AND NEW.pops_serial_norm IS NULL THEN
    RAISE EXCEPTION 'Maquina POPS exige vinculo no Parque ou serial da base POPS';
  END IF;

  NEW.link_status := CASE WHEN NEW.equipment_id IS NULL THEN 'sem_vinculo' ELSE 'vinculado' END;

  IF NEW.equipment_id IS NOT NULL THEN
    SELECT e.filial_id INTO NEW.pops_filial_id
      FROM public.client_equipment e WHERE e.id = NEW.equipment_id;
  ELSE
    SELECT count(*), min(f.id) INTO v_n, v_filial
      FROM public.filiais f
     WHERE public.pops_norm_place(f.nome) = public.pops_norm_place(NEW.pops_dealer_location);
    NEW.pops_filial_id := CASE WHEN v_n = 1 THEN v_filial ELSE NULL END;  -- só correspondência única
  END IF;

  NEW.pops_filial_pendente := (NEW.pops_filial_id IS NULL);
  RETURN NEW;
END $$;

CREATE TRIGGER pops_machines_normalize_trg
  BEFORE INSERT OR UPDATE ON public.pops_machines
  FOR EACH ROW EXECUTE FUNCTION public.pops_machines_normalize();

-- Visibilidade pela filial da máquina, sem depender de responsável
CREATE OR REPLACE FUNCTION public.pops_can_read_machine(p_machine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.pops_is_manager() THEN true
    ELSE EXISTS (SELECT 1 FROM public.pops_machines m
                  WHERE m.id = p_machine_id
                    AND m.pops_filial_id = public.get_user_filial_id())
  END
$$;
```

## 8. Responsável / executor

`responsible_user_id` **não** será usado como carteira e permanece sem uso nesta etapa. O executor será registrado na tabela de execução/OS (`pops_services_done.executed_by`, a desenhar na próxima etapa), que é a fonte dos indicadores "por RAC" e do realizado da meta. Isso evita reinterpretar uma coluna existente e mantém histórico de múltiplos serviços por máquina.

## 9. Confirmação: nenhuma máquina perdida

- 5.077 linhas → 5.077 máquinas POPS (0 duplicidades, 0 seriais inválidos).
- `equipment_id` nulo é permitido: máquinas sem vínculo no Parque entram normalmente.
- 306 máquinas de São Félix do Araguaia entram com pendência de filial (não desaparecem; visíveis à gestão até a filial ser definida).
- Nenhuma linha é ignorada, substituída ou descartada automaticamente.

## Próximo passo (após sua aprovação)

1. Decisão sobre a filial "São Félix do Araguaia".
2. Migration corretiva de estrutura (item 7).
3. Reescrita de `pops_confirm_import_batch` e das RPCs de carteira por cliente/filial.
4. Materialização das 5.077 máquinas e, depois, etapa de execução (serviço + OS + meta).
