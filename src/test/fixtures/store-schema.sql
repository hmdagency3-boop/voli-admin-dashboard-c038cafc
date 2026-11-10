-- Minimal isolated fixture mirroring Voli 009 contracts for the store (sql/023); NEVER run against production.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
grant usage on schema auth to authenticated, anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, anon;
create table public.profiles(auth_id uuid primary key, public_id bigint unique, display_name text, coins bigint not null default 0);
create table public.test_roles(auth_id uuid, role text);
create function public.has_role(p_auth uuid, p_role text) returns boolean language sql stable as
  $$ select exists(select 1 from public.test_roles where auth_id = p_auth and role = p_role) $$;
create function public.admin_guard() returns uuid language plpgsql stable as $$ begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Management only' using errcode = 'P0001', hint = 'not_admin'; end if;
  return auth.uid(); end $$;
create function public.admin_member_exists(p_auth uuid) returns void language plpgsql stable as $$ begin
  if not exists(select 1 from public.profiles where auth_id = p_auth) then
    raise exception 'No such member' using errcode = 'P0001', hint = 'not_found'; end if; end $$;
create table public.admin_actions(admin_id uuid, action text, target_id uuid, details jsonb);
create function public.admin_log(p_admin uuid, p_action text, p_target uuid, p_details jsonb default '{}'::jsonb) returns void
  language sql as $$ insert into public.admin_actions values (p_admin, p_action, p_target, p_details) $$;
-- Runs a statement and returns 'ok' or the error hint, so tests can check refusals.
create function public.t_try(q text) returns text language plpgsql as $$
declare h text; begin execute q; return 'ok';
exception when others then get stacked diagnostics h = pg_exception_hint; return coalesce(nullif(h, ''), sqlerrm); end $$;
grant execute on function public.t_try(text) to authenticated;
insert into public.profiles values
  ('00000000-0000-0000-0000-000000000001', 100, 'Admin', 0),
  ('00000000-0000-0000-0000-000000000002', 1000002, 'Member A', 500000),
  ('00000000-0000-0000-0000-000000000003', 1000003, 'Member B', 10);
insert into public.test_roles values ('00000000-0000-0000-0000-000000000001', 'admin');
