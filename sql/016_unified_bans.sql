-- Voli 016: unified bans, reference codes starting at 200, historical device/account links.
-- OWNER: run in Voli SQL Editor AFTER 009_admin.sql and sql/015_device_bans.sql.
-- Requires the original 009 member_bans/auth helpers. No secret key belongs in the panel.
-- The member app must report a stable device_id via voli_report_device on sign-in/open.
-- Device IDs/carriers are client reports, NOT hardware attestation. IPs depend on trusted proxy headers.
begin;
select pg_catalog.pg_advisory_xact_lock(160016);

create sequence if not exists public.voli_ban_code_seq start with 200 minvalue 200;
revoke all on sequence public.voli_ban_code_seq from public, anon, authenticated;
grant all on sequence public.voli_ban_code_seq to service_role;
create table if not exists public.voli_bans (
  id uuid primary key default gen_random_uuid(),
  code bigint not null unique default nextval('public.voli_ban_code_seq'),
  kind text not null check (kind in ('account', 'ip', 'network', 'device')),
  value text not null,
  target_auth uuid references public.profiles(auth_id) on delete cascade,
  reason text, until timestamptz, created_by uuid,
  created_at timestamptz not null default now(), revoked_at timestamptz,
  check ((kind = 'account') = (target_auth is not null))
);
grant all on public.voli_bans to service_role;
alter table public.voli_bans enable row level security;
create table if not exists public.voli_ban_accounts (
  ban_id uuid not null references public.voli_bans(id) on delete cascade,
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (ban_id, auth_id)
);
grant all on public.voli_ban_accounts to service_role;
alter table public.voli_ban_accounts enable row level security;
create index if not exists voli_ban_accounts_auth on public.voli_ban_accounts(auth_id);
create index if not exists voli_bans_value on public.voli_bans(kind, value);

-- Retain existing UUIDs for old device-ban links. Backfill only once, with deterministic allocation.
insert into public.voli_bans(id, kind, value, reason, created_by, created_at)
select id, kind, value, reason, created_by, created_at from public.device_bans
where not exists (select 1 from public.voli_bans v where v.id = device_bans.id)
order by created_at, id;
insert into public.voli_bans(kind, value, target_auth, reason, until, created_by, created_at)
select 'account', p.public_id::text, b.auth_id, b.reason, b.until, b.banned_by, b.created_at
from public.member_bans b join public.profiles p on p.auth_id = b.auth_id
where not exists (select 1 from public.voli_bans v where v.target_auth = b.auth_id)
order by b.created_at, b.auth_id;
select setval('public.voli_ban_code_seq', greatest(200, coalesce((select max(code) + 1 from public.voli_bans), 200)), false);
insert into public.voli_ban_accounts(ban_id, auth_id)
select id, target_auth from public.voli_bans where kind = 'account'
on conflict do nothing;
insert into public.voli_ban_accounts(ban_id, auth_id)
select distinct b.id, d.auth_id from public.voli_bans b join public.member_devices d on b.kind = 'device' and b.value = d.device_id
join public.profiles p on p.auth_id = d.auth_id
where not public.has_role(d.auth_id, 'admin')
on conflict do nothing;

-- member_bans remains the effective projection consumed by original my_ban/admin_member/admin_members.
-- One source can never erase another. Sign-in is blocked independently of the current phone.
create or replace function public.voli_sync_account_ban(p_auth uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare effective_until timestamptz; chosen record; rid uuid;
begin
  select b.* into chosen from public.voli_bans b join public.voli_ban_accounts a on a.ban_id = b.id
  where a.auth_id = p_auth and b.revoked_at is null and (b.until is null or b.until > now())
  order by b.until desc nulls first, b.code limit 1;
  if chosen.id is null then
    delete from public.member_bans where auth_id = p_auth;
    if not public.set_signin_ban(p_auth, null) then raise exception 'Sign-in ban could not be updated' using hint = 'signin_ban_failed'; end if;
    return;
  end if;
  effective_until := chosen.until;
  insert into public.member_bans(auth_id, until, reason, banned_by, created_at)
  values (p_auth, effective_until, left('[' || chosen.code || '] ' || coalesce(chosen.reason, 'Banned'), 200), chosen.created_by, chosen.created_at)
  on conflict (auth_id) do update set until = excluded.until, reason = excluded.reason,
    banned_by = excluded.banned_by, created_at = excluded.created_at;
  if not public.set_signin_ban(p_auth, coalesce(effective_until, now() + interval '100 years')) then
    raise exception 'Sign-in ban could not be updated' using hint = 'signin_ban_failed';
  end if;
  for rid in select id from public.rooms where owner_id = p_auth and is_live loop perform public.room_shutdown(rid); end loop;
  delete from public.room_members where auth_id = p_auth;
  delete from public.room_seats where auth_id = p_auth;
end; $$;
revoke all on function public.voli_sync_account_ban(uuid) from public, anon, authenticated;

create or replace function public.admin_create_ban(p_kind text, p_value text, p_days integer default null, p_reason text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); v text := btrim(coalesce(p_value, '')); target uuid; bid uuid; ref bigint; aid uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(160016);
  if p_kind is null or p_kind not in ('account','ip','network','device') then raise exception 'Bad kind' using hint = 'bad_kind'; end if;
  if v = '' or length(v) > 200 then raise exception 'Missing/long value' using hint = 'bad_value'; end if;
  if p_days is not null and (p_days < 1 or p_days > 36500) then raise exception 'Bad days' using hint = 'bad_days'; end if;
  if p_kind = 'account' then
    select auth_id into target from public.profiles where public_id::text = v or special_id = v or auth_id::text = v
    order by (public_id::text = v) desc limit 1;
    if target is null then raise exception 'Member not found' using hint = 'not_found'; end if;
    select public_id::text into v from public.profiles where auth_id = target;
  elsif p_kind = 'ip' or (p_kind = 'network' and v like '%/%') then
    begin v := case when p_kind = 'ip' then host(v::inet) else (v::cidr)::text end;
    exception when others then raise exception 'Bad address' using hint = 'bad_address'; end;
  elsif p_kind = 'network' then v := lower(v);
  end if;
  if target = me or (p_kind = 'device' and exists(select 1 from public.member_devices where device_id = v and auth_id = me)) then
    raise exception 'Cannot ban yourself' using hint = 'self';
  end if;
  if (target is not null and public.has_role(target, 'admin')) or (p_kind = 'device' and exists(
    select 1 from public.member_devices where device_id = v and public.has_role(auth_id, 'admin'))) then
    raise exception 'Cannot ban admin' using hint = 'target_admin';
  end if;
  insert into public.voli_bans(kind, value, target_auth, reason, until, created_by)
  values(p_kind, v, target, nullif(left(btrim(coalesce(p_reason,'')),200),''),
    case when p_days is null then null else now() + make_interval(days => p_days) end, me)
  returning id, code into bid, ref;
  insert into public.voli_ban_accounts(ban_id, auth_id)
  select bid, target where target is not null
  union select bid, d.auth_id from public.member_devices d join public.profiles p on p.auth_id = d.auth_id
    where p_kind = 'device' and d.device_id = v;
  for aid in select auth_id from public.voli_ban_accounts where ban_id = bid order by auth_id loop
    perform public.voli_sync_account_ban(aid);
  end loop;
  perform public.admin_log(me, 'device_ban', target, jsonb_build_object('code',ref,'kind',p_kind,'value',v,'days',p_days));
  return ref;
end; $$;
revoke all on function public.admin_create_ban(text,text,integer,text) from public, anon;
grant execute on function public.admin_create_ban(text,text,integer,text) to authenticated;

create or replace function public.admin_revoke_ban(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); b record; aid uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(160016);
  update public.voli_bans set revoked_at = now() where id = p_id and revoked_at is null returning * into b;
  if b.id is null then return; end if;
  for aid in select auth_id from public.voli_ban_accounts where ban_id = p_id order by auth_id loop perform public.voli_sync_account_ban(aid); end loop;
  perform public.admin_log(me,'device_unban',b.target_auth,jsonb_build_object('code',b.code,'kind',b.kind,'value',b.value));
end; $$;
revoke all on function public.admin_revoke_ban(uuid) from public, anon;
grant execute on function public.admin_revoke_ban(uuid) to authenticated;

-- Preserve all legacy mutation entry points, but route them through the registry.
create or replace function public.admin_member_ban(p_auth uuid, p_days integer default null, p_reason text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin perform public.admin_create_ban('account', p_auth::text, p_days, p_reason); return true; end; $$;
create or replace function public.admin_member_unban(p_auth uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); bid uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(160016);
  for bid in select id from public.voli_bans where target_auth = p_auth and revoked_at is null loop perform public.admin_revoke_ban(bid); end loop;
  -- Device-source restrictions are intentionally not revoked by account-only unban.
end; $$;
create or replace function public.admin_device_ban(p_kind text,p_value text,p_reason text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ref bigint; bid uuid;
begin
  if p_kind = 'account' then raise exception 'Bad kind' using hint = 'bad_kind'; end if;
  ref := public.admin_create_ban(p_kind,p_value,null,p_reason);
  select id into bid from public.voli_bans where code = ref; return bid;
end; $$;
create or replace function public.admin_device_unban(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin perform public.admin_revoke_ban(p_id); end; $$;

create or replace function public.voli_find_device_ban(p_ip inet,p_device text,p_carrier text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('kind',b.kind,'value',b.value,'reason',b.reason,'code',b.code,'until',b.until)
  from public.voli_bans b where b.revoked_at is null and (b.until is null or b.until > now()) and (
    (b.kind = 'ip' and b.value = host(p_ip)) or (b.kind = 'device' and b.value = p_device)
    or (b.kind = 'network' and case when b.value like '%/%' then p_ip <<= b.value::cidr else lower(b.value) = lower(p_carrier) end))
  order by b.code limit 1;
$$;

create or replace function public.voli_account_ban_json(p_auth uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('kind',b.kind,'value',b.value,'reason',b.reason,'code',b.code,'until',b.until)
  from public.voli_ban_accounts a join public.voli_bans b on b.id = a.ban_id where a.auth_id = p_auth
  and b.revoked_at is null and (b.until is null or b.until > now()) order by b.until desc nulls first,b.code limit 1;
$$;
revoke all on function public.voli_account_ban_json(uuid) from public, anon, authenticated;

create or replace function public.admin_list_devices(p_q text default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); q text := nullif(btrim(coalesce(p_q,'')),''); result jsonb;
begin
  with filtered as (
    select d.*,p.display_name,p.public_id,
      coalesce(public.voli_account_ban_json(d.auth_id),public.voli_find_device_ban(d.ip,d.device_id,d.carrier)) as ban
    from public.member_devices d left join public.profiles p on p.auth_id = d.auth_id
    where q is null or host(d.ip) like q || '%' or d.device_id ilike '%' || q || '%' or d.model ilike '%' || q || '%'
      or d.brand ilike '%' || q || '%' or d.carrier ilike '%' || q || '%' or p.display_name ilike '%' || q || '%'
      or p.public_id::text = q or p.special_id = q
  ) select jsonb_build_object('total',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(to_jsonb(x) - 'ip' || jsonb_build_object('ip',host(x.ip)) order by x.last_seen desc)
    from (select * from filtered order by last_seen desc limit least(greatest(p_limit,1),200) offset greatest(p_offset,0)) x),'[]')) into result;
  return result;
end; $$;

-- Serialize device registration with bans/unbans; future reports add accounts to active device sources.
create or replace function public.voli_link_reported_device() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(160016);
  if public.has_role(new.auth_id,'admin') then return new; end if;
  insert into public.voli_ban_accounts(ban_id,auth_id)
  select id,new.auth_id from public.voli_bans where kind = 'device' and value = new.device_id
    and revoked_at is null and (until is null or until > now()) on conflict do nothing;
  if exists(select 1 from public.voli_ban_accounts where auth_id = new.auth_id) then perform public.voli_sync_account_ban(new.auth_id); end if;
  return new;
end; $$;
revoke all on function public.voli_link_reported_device() from public, anon, authenticated;
drop trigger if exists voli_device_ban_link on public.member_devices;
create trigger voli_device_ban_link after insert or update on public.member_devices for each row execute function public.voli_link_reported_device();

-- Header IP takes priority; client fallback is untrusted. No defaults here: a default seventh
-- argument would make calls to the preserved six-argument overload ambiguous in PostgreSQL.
create or replace function public.voli_report_device(p_device_id text,p_brand text,p_model text,
  p_os text,p_network text,p_carrier text,p_client_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); ip inet := public.voli_request_ip(); d text := left(btrim(coalesce(p_device_id,'')),200); account_ban jsonb;
begin
  if me is null then raise exception 'Not signed in' using hint = 'not_signed_in'; end if;
  if d = '' then raise exception 'Missing device' using hint = 'bad_device'; end if;
  if ip is null then
    begin ip := nullif(btrim(p_client_ip), '')::inet;
    exception when invalid_text_representation then ip := null; end;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(160016);
  insert into public.member_devices(auth_id,device_id,ip,brand,model,os,network,carrier)
  values(me,d,ip,left(p_brand,80),left(p_model,80),left(p_os,80),left(p_network,40),left(p_carrier,80))
  on conflict(auth_id,device_id) do update set ip = coalesce(excluded.ip,member_devices.ip),
    brand = coalesce(excluded.brand,member_devices.brand),model = coalesce(excluded.model,member_devices.model),
    os = coalesce(excluded.os,member_devices.os),network = coalesce(excluded.network,member_devices.network),
    carrier = coalesce(excluded.carrier,member_devices.carrier),last_seen = now();
  account_ban := public.voli_account_ban_json(me);
  return coalesce(account_ban,public.voli_find_device_ban(ip,d,p_carrier));
end; $$;
revoke all on function public.voli_report_device(text,text,text,text,text,text,text) from public, anon;
grant execute on function public.voli_report_device(text,text,text,text,text,text,text) to authenticated;

-- Existing callers retain the original signature, defaults, and unified-ban enforcement.
create or replace function public.voli_report_device(p_device_id text,p_brand text default null,p_model text default null,
  p_os text default null,p_network text default null,p_carrier text default null) returns jsonb
language sql security definer set search_path = '' as $$
  select public.voli_report_device(p_device_id,p_brand,p_model,p_os,p_network,p_carrier,null::text);
$$;
revoke all on function public.voli_report_device(text,text,text,text,text,text) from public, anon;
grant execute on function public.voli_report_device(text,text,text,text,text,text) to authenticated;

create or replace function public.admin_list_bans(p_q text default null,p_kind text default null,p_status text default 'active',p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); result jsonb;
begin
  with all_rows as (
    select b.*, (b.revoked_at is null and (b.until is null or b.until > now())) as active,p.display_name as by_name,
      (select count(*) from public.voli_ban_accounts a where a.ban_id = b.id) as affected_accounts
    from public.voli_bans b left join public.profiles p on p.auth_id = b.created_by
  ), filtered as (
    select * from all_rows b where (p_kind is null or b.kind = p_kind)
    and (p_status = 'all' or (p_status = 'active' and b.active) or (p_status = 'inactive' and not b.active))
    and (nullif(btrim(p_q),'') is null or b.code::text = btrim(p_q) or b.value ilike '%' || btrim(p_q) || '%'
      or exists(select 1 from public.voli_ban_accounts a join public.profiles p on p.auth_id = a.auth_id
        where a.ban_id = b.id and (p.public_id::text = btrim(p_q) or p.special_id = btrim(p_q))))
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.code desc)
    from (select * from filtered order by code desc limit least(greatest(p_limit,1),200) offset greatest(p_offset,0)) x),'[]'::jsonb)) into result;
  return result;
end; $$;
revoke all on function public.admin_list_bans(text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_list_bans(text,text,text,integer,integer) to authenticated;

create or replace function public.admin_device_connections(p_member text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); target uuid; result jsonb;
begin
  select auth_id into target from public.profiles where public_id::text = btrim(p_member) or special_id = btrim(p_member) or auth_id::text = btrim(p_member)
  order by (public_id::text = btrim(p_member)) desc limit 1;
  if target is null then raise exception 'Member not found' using hint = 'not_found'; end if;
  with own_devices as (select * from public.member_devices where auth_id = target),
  accounts as (
    select p.auth_id,p.public_id,p.special_id,p.display_name,
      coalesce((select jsonb_agg(distinct d.device_id) from public.member_devices d where d.auth_id = p.auth_id and d.device_id in (select device_id from own_devices)),'[]') as devices,
      coalesce((select jsonb_agg(b.code order by b.code) from public.voli_ban_accounts a join public.voli_bans b on b.id = a.ban_id
        where a.auth_id = p.auth_id and b.revoked_at is null and (b.until is null or b.until > now())),'[]') as ban_codes
    from public.profiles p where p.auth_id = target or exists(select 1 from public.member_devices d where d.auth_id = p.auth_id and d.device_id in (select device_id from own_devices))
  ) select jsonb_build_object('member',(select to_jsonb(a) from accounts a where auth_id = target),
    'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.public_id) from accounts a),'[]'),
    'devices',coalesce((select jsonb_agg(to_jsonb(d) - 'ip' || jsonb_build_object('ip',host(d.ip),'display_name',p.display_name,'public_id',p.public_id,
      'ban',coalesce(public.voli_account_ban_json(d.auth_id),public.voli_find_device_ban(d.ip,d.device_id,d.carrier))) order by d.last_seen desc)
      from own_devices d join public.profiles p on p.auth_id = d.auth_id),'[]')) into result;
  return result;
end; $$;
revoke all on function public.admin_device_connections(text) from public, anon;
grant execute on function public.admin_device_connections(text) to authenticated;

-- Keep the legacy list usable for older panels, including preserved UUIDs and codes.
create or replace function public.admin_list_device_bans() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin return coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object('by_name',p.display_name) order by b.code desc)
  from public.voli_bans b left join public.profiles p on p.auth_id = b.created_by
  where b.kind <> 'account' and b.revoked_at is null and (b.until is null or b.until > now())),'[]'); end; $$;

-- Existing accounts on already-banned devices get the same persisted sign-in restriction at upgrade.
do $$ declare aid uuid; begin
  for aid in select distinct auth_id from public.voli_ban_accounts order by auth_id loop perform public.voli_sync_account_ban(aid); end loop;
end; $$;
notify pgrst, 'reload schema';
commit;