-- ============================================================
-- M1: infraestrutura multi-filial (zero mudança de comportamento)
-- ============================================================

-- 1) Tabela
create table public.user_filiais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filial_id uuid not null references public.filiais(id) on delete cascade,
  active boolean not null default true,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by uuid,
  unique (user_id, filial_id)
);

-- 2) Grants
grant select on public.user_filiais to authenticated;
grant all on public.user_filiais to service_role;

-- 3) RLS
alter table public.user_filiais enable row level security;

create policy user_filiais_select_self_or_admin on public.user_filiais
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'manager')
    or public.has_role((select auth.uid()), 'admin')
  );

create policy user_filiais_write_admin on public.user_filiais
  for all to authenticated
  using (
    public.has_role((select auth.uid()), 'manager')
    or public.has_role((select auth.uid()), 'admin')
  )
  with check (
    public.has_role((select auth.uid()), 'manager')
    or public.has_role((select auth.uid()), 'admin')
  );

-- 4) Índices de vínculos ativos
create index user_filiais_user_active_idx on public.user_filiais (user_id) where active;
create index user_filiais_filial_idx on public.user_filiais (filial_id) where active;

-- 5) Trigger de proteção/auditoria
create or replace function public.user_filiais_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary uuid;
begin
  select filial_id into v_primary from public.profiles where user_id = new.user_id;

  if new.active and v_primary is not null and new.filial_id = v_primary then
    raise exception 'Filial principal nao pode ser cadastrada como adicional' using errcode = '23514';
  end if;

  new.updated_at := now();

  if tg_op = 'UPDATE' then
    if old.active and not new.active then
      new.deactivated_at := now();
      new.deactivated_by := auth.uid();
    elsif not old.active and new.active then
      new.deactivated_at := null;
      new.deactivated_by := null;
      new.created_at := old.created_at;
      new.created_by := old.created_by;
    end if;
  end if;

  return new;
end;
$$;

create trigger user_filiais_guard_trg
  before insert or update on public.user_filiais
  for each row execute function public.user_filiais_guard();

-- 6) Sincronização da filial principal
create or replace function public.profiles_sync_primary_filial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.filial_id is not null and new.filial_id is distinct from old.filial_id then
    update public.user_filiais
       set active = false
     where user_id = new.user_id
       and filial_id = new.filial_id
       and active;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_primary_filial_trg
  after update of filial_id on public.profiles
  for each row execute function public.profiles_sync_primary_filial();

-- 7) Funções centrais
create or replace function public.get_user_filial_ids(p_user_id uuid default auth.uid())
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if p_user_id is null then
    return '{}'::uuid[];
  end if;

  if p_user_id is distinct from auth.uid()
     and not (public.has_role(auth.uid(), 'manager') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select array_remove(array_agg(distinct fid), null) into v_ids
  from (
    select p.filial_id as fid
      from public.profiles p
     where p.user_id = p_user_id
       and p.approval_status = 'approved'
       and p.employment_status = 'active'
    union
    select uf.filial_id
      from public.user_filiais uf
      join public.profiles p2 on p2.user_id = uf.user_id
     where uf.user_id = p_user_id
       and uf.active
       and p2.approval_status = 'approved'
       and p2.employment_status = 'active'
  ) s;

  return coalesce(v_ids, '{}'::uuid[]);
end;
$$;

create or replace function public.user_can_access_filial(p_filial_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_filial_id is not null
     and p_filial_id = any (public.get_user_filial_ids(p_user_id));
$$;

create or replace function public.user_can_access_filial_nome(p_nome text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int;
begin
  if p_nome is null or btrim(p_nome) = '' then
    return false;
  end if;

  select count(*) into v_count
    from public.filiais f
   where lower(btrim(f.nome)) = lower(btrim(p_nome));

  if v_count <> 1 then
    return false;
  end if;

  select f.id into v_id
    from public.filiais f
   where lower(btrim(f.nome)) = lower(btrim(p_nome))
   limit 1;

  return public.user_can_access_filial(v_id);
end;
$$;

-- 8) RPC administrativa
create or replace function public.set_user_filiais(target_user_id uuid, filial_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary uuid;
  v_exists boolean;
  v_requested uuid[];
  v_effective uuid[];
begin
  if not (public.has_role(auth.uid(), 'manager') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'Usuario alvo obrigatorio' using errcode = '22004';
  end if;

  select exists (select 1 from public.profiles where user_id = target_user_id) into v_exists;
  if not v_exists then
    raise exception 'Usuario alvo nao encontrado' using errcode = 'P0002';
  end if;

  select filial_id into v_primary from public.profiles where user_id = target_user_id;

  v_requested := coalesce(filial_ids, '{}'::uuid[]);

  select coalesce(array_agg(distinct fid), '{}'::uuid[])
    into v_effective
    from unnest(coalesce(filial_ids, '{}'::uuid[])) fid
   where fid is not null
     and fid is distinct from v_primary;

  update public.user_filiais
     set active = false
   where user_id = target_user_id
     and active
     and filial_id <> all (v_effective);

  insert into public.user_filiais (user_id, filial_id, active, created_by)
  select target_user_id, fid, true, auth.uid()
    from unnest(v_effective) fid
  on conflict (user_id, filial_id)
    do update set active = true, updated_at = now();

  insert into public.security_audit_log (event_type, user_id, target_user_id, metadata)
  values (
    'user_filiais_updated',
    auth.uid(),
    target_user_id,
    jsonb_build_object(
      'requested_filial_ids', to_jsonb(v_requested),
      'effective_additional_filial_ids', to_jsonb(v_effective),
      'primary_filial_id', v_primary
    )
  );

  return jsonb_build_object(
    'success', true,
    'primary_filial_id', v_primary,
    'effective_additional_filial_ids', to_jsonb(v_effective),
    'filial_ids', to_jsonb(public.get_user_filial_ids(target_user_id))
  );
end;
$$;

-- 9) Endurecimento de permissões de execução
revoke execute on function public.get_user_filial_ids(uuid) from public;
revoke execute on function public.user_can_access_filial(uuid, uuid) from public;
revoke execute on function public.user_can_access_filial_nome(text) from public;
revoke execute on function public.set_user_filiais(uuid, uuid[]) from public;

grant execute on function public.get_user_filial_ids(uuid) to authenticated;
grant execute on function public.user_can_access_filial(uuid, uuid) to authenticated;
grant execute on function public.user_can_access_filial_nome(text) to authenticated;
grant execute on function public.set_user_filiais(uuid, uuid[]) to authenticated;