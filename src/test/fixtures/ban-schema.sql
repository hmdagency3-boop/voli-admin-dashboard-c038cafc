-- Minimal isolated fixture mirroring Voli 009 contracts; NEVER run against production.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table auth.users(id uuid primary key,banned_until timestamptz);
create table public.profiles(auth_id uuid primary key,public_id bigint unique,special_id text,display_name text);
create table public.test_roles(auth_id uuid,role text);
create function public.has_role(p_auth uuid,p_role text) returns boolean language sql as $$ select exists(select 1 from public.test_roles where auth_id=p_auth and role=p_role) $$;
create function public.admin_guard() returns uuid language plpgsql as $$ begin
if not public.has_role(auth.uid(),'admin') then raise exception 'Not admin'; end if; return auth.uid(); end $$;
create function public.admin_member_exists(p_auth uuid) returns void language plpgsql as $$ begin
if not exists(select 1 from public.profiles where auth_id=p_auth) then raise exception 'Missing'; end if; end $$;
create table public.member_bans(auth_id uuid primary key references public.profiles(auth_id),until timestamptz,reason text,banned_by uuid,created_at timestamptz default now());
create function public.set_signin_ban(p_auth uuid,p_until timestamptz) returns boolean language plpgsql as $$ begin update auth.users set banned_until=p_until where id=p_auth; return true; end $$;
create table public.rooms(id uuid,owner_id uuid,is_live boolean);
create table public.room_members(room_id uuid,auth_id uuid);
create table public.room_seats(room_id uuid,auth_id uuid);
create function public.room_shutdown(p_room uuid) returns void language sql as $$ update public.rooms set is_live=false where id=p_room $$;
create table public.test_log(admin_id uuid,action text,target_id uuid,details jsonb);
create function public.admin_log(p_admin uuid,p_action text,p_target uuid,p_details jsonb) returns void language sql as $$ insert into public.test_log values(p_admin,p_action,p_target,p_details) $$;
create function public.admin_member_ban(p_auth uuid,p_days integer default null,p_reason text default null) returns boolean language sql as $$ select true $$;
create function public.admin_member_unban(p_auth uuid) returns void language sql as $$ delete from public.member_bans where auth_id=p_auth $$;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into public.profiles values
('00000000-0000-0000-0000-000000000001',100,null,'Admin'),
('00000000-0000-0000-0000-000000000002',101,null,'Account A'),
('00000000-0000-0000-0000-000000000003',102,null,'Account B'),
('00000000-0000-0000-0000-000000000004',103,null,'Account C');
insert into public.test_roles values('00000000-0000-0000-0000-000000000001','admin');