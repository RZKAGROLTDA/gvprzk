set -e; D=/tmp/pgt; rm -rf $D; initdb -D $D -U postgres >/dev/null; pg_ctl -D $D -o "-p 55433 -k /tmp" -l /tmp/pgt.log start >/dev/null; sleep 2
P="psql -h /tmp -p 55433 -U postgres -v ON_ERROR_STOP=1 -q"
$P <<'EOF'
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('t.uid',true),'')::uuid$$;
create table filiais(id uuid primary key, nome text); create table profiles(user_id uuid unique, name text);
create table projection_filial_divisional(filial_id uuid, divisional text); create table projection_goals(filial_id uuid, ano int, mes int, meta numeric);
create table projection_goal_history(filial_id uuid,ano int,mes int,meta_anterior numeric,meta_nova numeric,origem text,changed_by uuid,changed_at timestamptz);
create table projection_entries(id uuid primary key default gen_random_uuid(), filial_id uuid not null references filiais(id) on delete cascade, ano int not null, mes int not null, semana int not null, sem_risco numeric not null, com_risco numeric not null, observacao text, created_by uuid, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(filial_id,ano,mes,semana));
create table projection_entry_history(id uuid primary key default gen_random_uuid(), entry_id uuid not null references projection_entries(id) on delete cascade, filial_id uuid not null, ano int not null, mes int not null, semana int not null, sem_risco numeric not null, com_risco numeric not null, observacao text, acao text not null, changed_by uuid, changed_at timestamptz not null default now());
create function projection_validate() returns trigger language plpgsql as $$begin NEW.updated_at:=now(); return NEW; end$$;
create trigger trg_pe_validate before insert or update on projection_entries for each row execute function projection_validate();
create function projection_is_admin() returns bool language sql as $$select current_setting('t.role',true)='admin'$$;
create function projection_role_ok() returns bool language sql as $$select true$$;
create function has_role(uuid,text) returns bool language sql as $$select current_setting('t.role',true)=$2$$;
create function projection_scope(uuid) returns uuid[] language sql as $$select array_agg(id) from filiais$$;
create function projection_filial_in(uuid) returns bool language sql as $$select true$$;
create function projection_save_entry(uuid,uuid,int,int,int,numeric,numeric,text) returns uuid language sql as $$select null::uuid$$;
insert into filiais values('11111111-1111-1111-1111-111111111111','A');
insert into profiles values('22222222-2222-2222-2222-222222222222','Admin');
insert into projection_entries(filial_id,ano,mes,semana,sem_risco,com_risco) values('11111111-1111-1111-1111-111111111111',2026,11,1,10,9);
insert into projection_entry_history(entry_id,filial_id,ano,mes,semana,sem_risco,com_risco,acao) select id,filial_id,ano,mes,semana,10,9,'criado' from projection_entries;
EOF
$P -f /tmp/ex.sql && echo "MIGRAÇÃO APLICADA OK"
F=11111111-1111-1111-1111-111111111111
T(){ r=$($P -tA -c "set t.role='admin'; set t.uid='22222222-2222-2222-2222-222222222222'; $2" 2>&1 | tail -1); echo "$1 => $r"; }
T "registro legado recebe versão 1" "select version from projection_entries"
T "histórico legado preservado" "select count(*) from projection_entry_history"
T "editar sem versão" "select projection_save_entry('$F','$F',2026,11,1,20,18,null)"
T "editar com versão certa" "select projection_save_entry('$F','$F',2026,11,1,20,18,null,1) is not null"
T "versão após edição" "select version from projection_entries"
T "editar com versão antiga" "select projection_save_entry('$F','$F',2026,11,1,30,28,null,1)"
T "criar S2 normal" "select projection_save_entry('$F','$F',2026,11,2,5,4,null) is not null"
T "excluir S1" "select projection_delete_entry('$F',(select id from projection_entries where semana=1),2,'erro de digitação') is not null"
T "salvar S1 sobre versão excluída" "select projection_save_entry('$F','$F',2026,11,1,1,1,null,2)"
T "relançar S1" "select projection_save_entry('$F','$F',2026,11,1,7,6,null) is not null"
T "ativos / total" "select count(*) filter (where deleted_at is null)||'/'||count(*) from projection_entries"
T "histórico ações" "select string_agg(acao,',' order by changed_at) from projection_entry_history"
T "painel usa só ativos (S1)" "select s1_sem from get_projection_panel('$F',2026,11)"
T "delete direto" "delete from projection_entries"
T "alterar histórico" "update projection_entry_history set observacao='x'"
T "remover filial (cascata existente)" "delete from filiais; select count(*) from projection_entries"
pg_ctl -D $D stop >/dev/null
