# POPS — Migration corretiva revisada (não aplicada)

## 1. `public.pops_location_mapping`

Mapeamento próprio do POPS. `public.filiais` **não** é alterada.

```sql
CREATE TABLE public.pops_location_mapping (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_location     text NOT NULL,
  dealer_location_norm text NOT NULL,
  filial_id           uuid REFERENCES public.filiais(id),
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pops_location_mapping_norm_uidx ON public.pops_location_mapping (dealer_location_norm);

GRANT SELECT ON public.pops_location_mapping TO authenticated;
GRANT ALL    ON public.pops_location_mapping TO service_role;
ALTER TABLE public.pops_location_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY pops_location_mapping_select ON public.pops_location_mapping
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pops_location_mapping_write ON public.pops_location_mapping
  FOR ALL TO authenticated USING (public.pops_is_manager()) WITH CHECK (public.pops_is_manager());
```

Seed: os 12 Dealer Locations com correspondência exata recebem `filial_id`; `SAO FELIX DO ARAGUAIA` entra com `filial_id = NULL` (pendente da sua decisão). As 306 máquinas ficam com `pops_filial_id = NULL` e `pops_filial_pendente = true`, visíveis a manager/admin. Ao definir a filial no mapping, a função `pops_recalc_filiais(program_id)` recalcula essas máquinas.

## 2. Auditoria da unicidade atual de `pops_machines`

| Nome | Tipo | Definição |
|---|---|---|
| `pops_machines_program_equipment_key` | **UNIQUE CONSTRAINT** (com índice de mesmo nome) | `UNIQUE (program_id, equipment_id)` |

Não existe `pops_machines_program_equipment_uidx`. Portanto a remoção é via `ALTER TABLE ... DROP CONSTRAINT`, não `DROP INDEX`.

## 3. SQL correto para a mudança de unicidade

```sql
ALTER TABLE public.pops_machines DROP CONSTRAINT pops_machines_program_equipment_key;

CREATE UNIQUE INDEX pops_machines_program_equipment_uidx
  ON public.pops_machines (program_id, equipment_id)
  WHERE equipment_id IS NOT NULL AND active;

CREATE UNIQUE INDEX pops_machines_program_serial_uidx
  ON public.pops_machines (program_id, pops_serial_norm)
  WHERE pops_serial_norm IS NOT NULL AND active;
```

## 4. Policies de `pops_machines`

Atuais (M1):

| Policy | Comando | Regra atual |
|---|---|---|
| `pops_machines_select_scope` | SELECT | global / filial via `client_equipment.filial_id` / **self via `responsible_user_id`** |
| `pops_machines_insert_manager` | INSERT | `pops_is_manager()` e `created_by = auth.uid()` |
| `pops_machines_update_manager` | UPDATE | `pops_is_manager()` |

Problemas: o ramo `self` usa carteira prévia e o ramo `filial` depende de `equipment_id` (exclui máquinas sem vínculo).

Propostas:

```sql
DROP POLICY pops_machines_select_scope ON public.pops_machines;

-- RAC/CPA/CSA e Supervisor: filial da MÁQUINA POPS. Manager/Admin: global.
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

`pops_machines_insert_manager` e `pops_machines_update_manager` permanecem como estão nesta etapa (a etapa de execução adicionará um UPDATE controlado por RPC `SECURITY DEFINER`, sem abrir UPDATE direto ao RAC). `responsible_user_id` deixa de participar de qualquer autorização.

## 5. Regra final de serviço + OS (imutável)

```text
1 MÁQUINA = 1 SERVIÇO FINAL = 1 OS = 1 REALIZADO
```

- Serviços disponíveis: Análise de Óleo, Análise de Arrefecimento, Higienização de Ar.
- O RAC pode avaliar os 3, mas conclui com **1 serviço final** e **1 OS**.
- Estrutura da execução (próxima etapa): `pops_machines.final_service_id`, `os_number`, `executed_by`, `executed_at`, com `UNIQUE (program_id, os_number)` e unicidade natural garantida por ser 1 linha por máquina — impossível gerar 2 OS POPS ou 2 realizados para a mesma máquina.
- Serviços apenas avaliados/ofertados poderão ser guardados como registro auxiliar, sem efeito na meta.
- `SERVIÇADA` exige `final_service_id` e `os_number` preenchidos.

## 6. Migration corretiva completa revisada

```sql
-- A) Normalização de nomes de local
CREATE OR REPLACE FUNCTION public.pops_norm_place(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(upper(btrim(regexp_replace(
    translate(p,'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC'),
    '\s+',' ','g'))),'')
$$;

-- B) Tabela de mapeamento (bloco do item 1) + seed
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

-- C) pops_machines: máquina POPS sem vínculo no Parque + snapshot da base
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

-- D) Unicidade (item 3)
ALTER TABLE public.pops_machines DROP CONSTRAINT pops_machines_program_equipment_key;
CREATE UNIQUE INDEX pops_machines_program_equipment_uidx
  ON public.pops_machines (program_id, equipment_id) WHERE equipment_id IS NOT NULL AND active;
CREATE UNIQUE INDEX pops_machines_program_serial_uidx
  ON public.pops_machines (program_id, pops_serial_norm) WHERE pops_serial_norm IS NOT NULL AND active;
CREATE INDEX pops_machines_filial_idx  ON public.pops_machines (program_id, pops_filial_id) WHERE active;
CREATE INDEX pops_machines_cliente_idx ON public.pops_machines (program_id, pops_client_name_norm) WHERE active;

-- E) Trigger de normalização/derivação
CREATE OR REPLACE FUNCTION public.pops_machines_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_filial uuid;
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
    SELECT m.filial_id INTO NEW.pops_filial_id
      FROM public.pops_location_mapping m
     WHERE m.active
       AND m.dealer_location_norm = public.pops_norm_place(NEW.pops_dealer_location);
  END IF;

  NEW.pops_filial_pendente := (NEW.pops_filial_id IS NULL);
  RETURN NEW;
END $$;

CREATE TRIGGER pops_machines_normalize_trg
  BEFORE INSERT OR UPDATE ON public.pops_machines
  FOR EACH ROW EXECUTE FUNCTION public.pops_machines_normalize();

-- F) Recálculo após você definir a filial de um Dealer Location
CREATE OR REPLACE FUNCTION public.pops_recalc_filiais(p_program_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.pops_is_manager() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;
  UPDATE public.pops_machines SET updated_at = now()
   WHERE program_id = p_program_id AND active;   -- trigger recalcula filial/pendencia
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- G) Leitura por filial da máquina
CREATE OR REPLACE FUNCTION public.pops_can_read_machine(p_machine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.pops_is_manager() THEN true
              ELSE EXISTS (SELECT 1 FROM public.pops_machines m
                            WHERE m.id = p_machine_id
                              AND m.pops_filial_id = public.get_user_filial_id())
         END
$$;

-- H) Policy de SELECT (item 4)
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

Objetos da M2 sem uso a partir daqui (mantidos, sem DROP): `pops_client_assignments`, `pops_assign_rac_by_client`, `pops_assign_rac_machines`, `pops_machines.responsible_user_id`.

## Base confirmada

5.077 linhas · 5.077 seriais únicos · 0 duplicidades · 0 seriais inválidos · todas formam o universo POPS · nenhuma depende de MATCH_EXATO · `client_equipment` é apenas vínculo/enriquecimento · meta = 1.000 máquinas **serviçadas**.
