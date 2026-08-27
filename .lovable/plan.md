# POPS — Migration corretiva estrutural (final, não aplicada)

Escopo: **somente estrutura**. Não materializa as 5.077 máquinas. RPCs de confirmação e carteira virão em etapa separada para aprovação.

## Ponto de atenção antes de aplicar (identidade do cliente)

A auditoria da base real mostrou que o **Dealer Account Number é único por Dealer Location**: existem apenas **13 códigos distintos** nas 5.077 linhas (1 por filial), enquanto há **1.698 nomes de cliente distintos**.

Consequência prática: agrupar a carteira por `program_id + pops_client_code_norm` produziria **13 "clientes"** (na verdade 13 filiais), não a visão por cliente desejada no item 6 da regra ("CLIENTE A — 12 máquinas...").

Proposta implementada no SQL abaixo, sem perder o que você pediu:

- `pops_client_code_norm` é criado e preenchido pelo trigger, com índice, exatamente como solicitado;
- a chave de agrupamento da carteira é `client_key`, coluna gerada que usa **prioritariamente** o código do cliente quando ele existir e for específico do cliente, e cai para o nome normalizado quando o código não identificar o cliente. Assim a regra "código primeiro, nome só exibição" é respeitada e a visão por cliente continua correta na base atual.

Se você preferir agrupar estritamente por `pops_client_code_norm`, basta remover a coluna `client_key` do SQL e usar o código direto nas RPCs — mas a carteira ficará com 13 grupos.

## SQL final da migration corretiva

```sql
-- A) Normalização de nomes de local/cliente
CREATE OR REPLACE FUNCTION public.pops_norm_place(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(upper(btrim(regexp_replace(
    translate(p,'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC'),
    '\s+',' ','g'))),'')
$$;

-- B) Mapeamento Dealer Location -> filial operacional (POPS não altera public.filiais)
CREATE TABLE public.pops_location_mapping (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_location      text NOT NULL,
  dealer_location_norm text NOT NULL,
  filial_id            uuid REFERENCES public.filiais(id),
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pops_location_mapping_norm_uidx
  ON public.pops_location_mapping (dealer_location_norm);

GRANT SELECT ON public.pops_location_mapping TO authenticated;
GRANT ALL    ON public.pops_location_mapping TO service_role;
ALTER TABLE public.pops_location_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY pops_location_mapping_select ON public.pops_location_mapping
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pops_location_mapping_write ON public.pops_location_mapping
  FOR ALL TO authenticated
  USING (public.pops_is_manager()) WITH CHECK (public.pops_is_manager());

CREATE TRIGGER pops_location_mapping_updated_at
  BEFORE UPDATE ON public.pops_location_mapping
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: 12 locais com correspondência exata; SAO FELIX DO ARAGUAIA fica com filial_id NULL
INSERT INTO public.pops_location_mapping (dealer_location, dealer_location_norm, filial_id)
SELECT DISTINCT ON (public.pops_norm_place(r.dealer_location))
       btrim(r.dealer_location),
       public.pops_norm_place(r.dealer_location),
       (SELECT f.id FROM public.filiais f
         WHERE public.pops_norm_place(f.nome) = public.pops_norm_place(r.dealer_location)
         LIMIT 1)
  FROM public.pops_import_rows r
 WHERE r.dealer_location IS NOT NULL
 ON CONFLICT (dealer_location_norm) DO NOTHING;

-- C) pops_machines: máquina POPS pode existir sem vínculo no Parque + snapshot da base
ALTER TABLE public.pops_machines
  ALTER COLUMN equipment_id DROP NOT NULL,
  ADD COLUMN pops_serial            text,
  ADD COLUMN pops_serial_norm       text,
  ADD COLUMN pops_client_code       text,
  ADD COLUMN pops_client_code_norm  text,
  ADD COLUMN pops_client_name       text,
  ADD COLUMN pops_client_name_norm  text,
  ADD COLUMN client_key             text,
  ADD COLUMN pops_model             text,
  ADD COLUMN pops_product_series    text,
  ADD COLUMN pops_manufacture_year  text,
  ADD COLUMN pops_platform          text,
  ADD COLUMN pops_dealer_location   text,
  ADD COLUMN pops_filial_id         uuid REFERENCES public.filiais(id),
  ADD COLUMN pops_filial_pendente   boolean NOT NULL DEFAULT false,
  ADD COLUMN link_status            text NOT NULL DEFAULT 'sem_vinculo',
  ADD COLUMN import_row_id          uuid REFERENCES public.pops_import_rows(id);

-- D) Unicidade vitalícia (independe de active): 1 máquina física = 1 registro POPS
ALTER TABLE public.pops_machines DROP CONSTRAINT pops_machines_program_equipment_key;

CREATE UNIQUE INDEX pops_machines_program_equipment_uidx
  ON public.pops_machines (program_id, equipment_id)
  WHERE equipment_id IS NOT NULL;

CREATE UNIQUE INDEX pops_machines_program_serial_uidx
  ON public.pops_machines (program_id, pops_serial_norm)
  WHERE pops_serial_norm IS NOT NULL;

CREATE INDEX pops_machines_filial_idx
  ON public.pops_machines (program_id, pops_filial_id) WHERE active;
CREATE INDEX pops_machines_client_code_idx
  ON public.pops_machines (program_id, pops_client_code_norm) WHERE active;
CREATE INDEX pops_machines_client_key_idx
  ON public.pops_machines (program_id, client_key) WHERE active;
CREATE INDEX pops_machines_cliente_nome_idx
  ON public.pops_machines (program_id, pops_client_name_norm) WHERE active;

-- E) Trigger: identidade, filial e link_status derivados
CREATE OR REPLACE FUNCTION public.pops_machines_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_code_clientes int;
BEGIN
  NEW.pops_serial_norm      := public.pops_norm_serial(NEW.pops_serial);
  NEW.pops_client_code_norm := public.pops_norm_code(NEW.pops_client_code);
  NEW.pops_client_name_norm := public.pops_norm_place(NEW.pops_client_name);

  IF NEW.equipment_id IS NULL AND NEW.pops_serial_norm IS NULL THEN
    RAISE EXCEPTION 'Maquina POPS exige vinculo no Parque ou serial da base POPS';
  END IF;

  NEW.link_status := CASE WHEN NEW.equipment_id IS NULL THEN 'sem_vinculo' ELSE 'vinculado' END;

  -- Filial: Parque quando vinculada; senão mapping do Dealer Location
  IF NEW.equipment_id IS NOT NULL THEN
    SELECT e.filial_id INTO NEW.pops_filial_id
      FROM public.client_equipment e WHERE e.id = NEW.equipment_id;
  ELSE
    SELECT m.filial_id INTO NEW.pops_filial_id
      FROM public.pops_location_mapping m
     WHERE m.active
       AND m.dealer_location_norm = public.pops_norm_place(NEW.pops_dealer_location);
  END IF;
  NEW.pops_filial_pendente := (NEW.pops_filial_id IS NULL);

  -- Chave de agrupamento da carteira: código do cliente tem prioridade;
  -- fallback para o nome quando o código não identifica o cliente (código de dealer)
  SELECT count(DISTINCT r.client_name) INTO v_code_clientes
    FROM public.pops_import_rows r
    JOIN public.pops_import_batches b ON b.id = r.batch_id
   WHERE b.program_id = NEW.program_id
     AND r.pops_client_code_norm = NEW.pops_client_code_norm;

  NEW.client_key := CASE
    WHEN NEW.pops_client_code_norm IS NOT NULL AND coalesce(v_code_clientes,0) <= 1
      THEN 'C:'||NEW.pops_client_code_norm
    WHEN NEW.pops_client_name_norm IS NOT NULL
      THEN 'N:'||NEW.pops_client_name_norm
    ELSE 'C:'||coalesce(NEW.pops_client_code_norm,'SEM_CLIENTE')
  END;

  RETURN NEW;
END $$;

CREATE TRIGGER pops_machines_normalize_trg
  BEFORE INSERT OR UPDATE ON public.pops_machines
  FOR EACH ROW EXECUTE FUNCTION public.pops_machines_normalize();

-- F) Recálculo de filial após você definir o mapping (ex.: São Félix do Araguaia)
CREATE OR REPLACE FUNCTION public.pops_recalc_filiais(p_program_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;
  UPDATE public.pops_machines SET updated_at = now()
   WHERE program_id = p_program_id;   -- trigger recalcula filial/pendência
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- G) Leitura por filial da máquina POPS (sem responsible_user_id)
CREATE OR REPLACE FUNCTION public.pops_can_read_machine(p_machine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.pops_is_manager() THEN true
              ELSE EXISTS (SELECT 1 FROM public.pops_machines m
                            WHERE m.id = p_machine_id
                              AND m.pops_filial_id = public.get_user_filial_id())
         END
$$;

-- H) Policy de SELECT por filial da máquina
DROP POLICY pops_machines_select_scope ON public.pops_machines;
CREATE POLICY pops_machines_select_scope ON public.pops_machines
FOR SELECT TO authenticated
USING (
  CASE public.pops_scope() ->> 'scope'
    WHEN 'global' THEN true
    ELSE pops_filial_id IS NOT NULL
         AND pops_filial_id = ((public.pops_scope() ->> 'filial_id'))::uuid
  END
);
```

## O que esta migration NÃO faz

- Não materializa nenhuma máquina (0 registros em `pops_machines`).
- Não confirma o lote real, não resolve divergências, não atribui ninguém.
- Não altera `public.filiais`, não define a filial de São Félix do Araguaia (306 máquinas ficarão pendentes ao materializar).
- Não remove `pops_client_assignments`, `pops_assign_rac_by_client`, `pops_assign_rac_machines` nem `responsible_user_id` — ficam sem uso.

## Próxima etapa (após esta migration, com aprovação separada)

1. `pops_confirm_import_batch` — materializa todas as linhas do lote, sem exigir MATCH_EXATO.
2. `pops_portfolio_clients` — clientes por filial da máquina, com total/serviçadas/pendentes.
3. `pops_portfolio_client_machines` — máquinas do cliente com status e dados da base + Parque.
4. Execução: `final_service_id`, `os_number`, `executed_by`, `executed_at` (1 máquina = 1 serviço = 1 OS = 1 realizado).
