-- voli update 014: official congratulation messages from Voli Helper (ID 100) for everything management gives.
-- Run once in the SQL Editor AFTER supabase/010_admin_notices.sql and sql/013_gift_uploads.sql. Safe to run again.
--
-- When top management gives a member something from the panel, the member gets an official English message
-- in their Voli Helper chat, for example:
--   VIP 5 for 15 days -> "Congratulations on your upgrade to VIP5 ,valid for 15 days."
--                        "Congratulations on receiving the official gift of Headwear vip 5 ,valid for 15 days."
--   Top management    -> "Congratulations on receiving the official gift of Headwear Super Admin."
--   Moderator         -> "Congratulations on receiving the official gift of Headwear Moderator."
--   Coins (added)     -> "Congratulations on receiving the official gift of 5000 Coins."
--   Special ID        -> "Congratulations on receiving your Special ID: 777."
-- Management can also send any official notice by hand: public.admin_send_notice(member, text).
begin;

do $$
begin
  if not exists (select 1 from public.profiles where auth_id = '00000000-0000-4000-8000-000000000100' and public_id = 100) then
    raise exception 'Voli Helper (ID 100) is missing: run supabase/010_admin_notices.sql first; nothing was changed';
  end if;
end $$;

-- ---------- 1) Writing a Voli Helper message (internal, not callable from the app) ----------
-- clock_timestamp() keeps two messages sent in the same action in the order they were written.
create or replace function public.voli_helper_notice(p_recipient uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  insert into public.messages(sender_id, recipient_id, body, created_at)
    values ('00000000-0000-4000-8000-000000000100', p_recipient, p_body, clock_timestamp())
    returning id into mid;
  return mid;
end;
$$;
revoke all on function public.voli_helper_notice(uuid, text) from public, anon, authenticated;

-- "... ,valid for N days." or "." when it never ends.
create or replace function public.voli_notice_validity(p_days integer) returns text
language sql immutable set search_path = '' as $$
  select case when p_days is null or p_days <= 0 then '.' else ' ,valid for ' || p_days::text || ' days.' end
$$;
revoke all on function public.voli_notice_validity(integer) from public, anon, authenticated;

create or replace function public.voli_gift_notice_text(p_what text, p_days integer default null) returns text
language sql immutable set search_path = '' as $$
  select 'Congratulations on receiving the official gift of ' || btrim(p_what) || public.voli_notice_validity(p_days)
$$;
revoke all on function public.voli_gift_notice_text(text, integer) from public, anon, authenticated;

-- ---------- 2) Panel: send an official notice by hand ----------
create or replace function public.admin_send_notice(p_recipient uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); b text := btrim(coalesce(p_body, '')); mid uuid;
begin
  perform public.admin_member_exists(p_recipient);
  if p_recipient = '00000000-0000-4000-8000-000000000100' then
    raise exception 'Cannot message Voli Helper' using errcode = 'P0001', hint = 'self';
  end if;
  if char_length(b) not between 1 and 1000 then
    raise exception 'Bad message' using errcode = 'P0001', hint = 'bad_notice';
  end if;
  mid := public.voli_helper_notice(p_recipient, b);
  perform public.admin_log(me, 'notice', p_recipient, jsonb_build_object('body', b));
  return mid;
end;
$$;
revoke all on function public.admin_send_notice(uuid, text) from public, anon;
grant execute on function public.admin_send_notice(uuid, text) to authenticated;

-- ---------- 3) Coins: message when coins are added (not when removed) ----------
create or replace function public.admin_member_coins(p_auth uuid, p_amount bigint, p_note text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); balance bigint;
begin
  perform public.admin_member_exists(p_auth);
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000000000 then
    raise exception 'Bad amount' using errcode = 'P0001', hint = 'bad_amount';
  end if;
  select coins into balance from public.profiles where auth_id = p_auth for update;
  if balance + p_amount < 0 then raise exception 'Balance would be negative' using errcode = 'P0001', hint = 'negative_balance'; end if;
  update public.profiles set coins = coins + p_amount where auth_id = p_auth returning coins into balance;
  perform public.admin_log(me, 'coins', p_auth, jsonb_build_object('amount', p_amount, 'balance', balance,
    'note', nullif(left(btrim(coalesce(p_note, '')), 200), '')));
  if p_amount > 0 then
    perform public.voli_helper_notice(p_auth, public.voli_gift_notice_text(p_amount::text || ' Coins'));
  end if;
  return balance;
end;
$$;
revoke all on function public.admin_member_coins(uuid, bigint, text) from public, anon;
grant execute on function public.admin_member_coins(uuid, bigint, text) to authenticated;

-- ---------- 4) VIP: upgrade message + VIP headwear message ----------
create or replace function public.admin_member_vip(p_auth uuid, p_level integer, p_days integer default null,
  p_source text default 'admin', p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); gid uuid;
begin
  perform public.admin_member_exists(p_auth);
  if p_source not in ('admin', 'gift', 'event') then raise exception 'Bad source' using errcode = 'P0001', hint = 'bad_source'; end if;
  if not exists (select 1 from public.vip_tiers where level = p_level) then
    raise exception 'Unknown VIP level' using errcode = 'P0001', hint = 'bad_level';
  end if;
  if p_days is not null and (p_days <= 0 or p_days > 36500) then raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days'; end if;
  insert into public.vip_grants(auth_id, level, source, expires_at, note)
    values (p_auth, p_level, p_source, case when p_days is null then null else now() + make_interval(days => p_days) end,
            nullif(left(btrim(coalesce(p_note, '')), 200), ''))
    returning id into gid;
  perform public.admin_log(me, 'vip_grant', p_auth, jsonb_build_object('level', p_level, 'days', p_days, 'source', p_source));
  perform public.voli_helper_notice(p_auth,
    'Congratulations on your upgrade to VIP' || p_level::text || public.voli_notice_validity(p_days));
  perform public.voli_helper_notice(p_auth, public.voli_gift_notice_text('Headwear vip ' || p_level::text, p_days));
  return gid;
end;
$$;
revoke all on function public.admin_member_vip(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.admin_member_vip(uuid, integer, integer, text, text) to authenticated;

-- ---------- 5) Special ID: message when a new special ID is set ----------
create or replace function public.admin_member_special_id(p_auth uuid, p_special text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); v text := nullif(btrim(coalesce(p_special, '')), ''); old text;
begin
  perform public.admin_member_exists(p_auth);
  if v is not null and v !~ '^[1-9][0-9]{0,9}$' then
    raise exception 'Bad special ID' using errcode = 'P0001', hint = 'bad_special_id';
  end if;
  select special_id into old from public.profiles where auth_id = p_auth;
  begin
    update public.profiles set special_id = v where auth_id = p_auth;
  exception when unique_violation then
    raise exception 'Special ID taken' using errcode = 'P0001', hint = 'special_id_taken';
  end;
  perform public.admin_log(me, 'special_id', p_auth, jsonb_build_object('from', old, 'to', v));
  if v is not null and v is distinct from old then
    perform public.voli_helper_notice(p_auth, 'Congratulations on receiving your Special ID: ' || v || '.');
  end if;
end;
$$;
revoke all on function public.admin_member_special_id(uuid, text) from public, anon;
grant execute on function public.admin_member_special_id(uuid, text) to authenticated;

-- ---------- 6) Roles: headwear message when a role is newly given ----------
create or replace function public.admin_member_role(p_auth uuid, p_role public.app_role, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); added integer := 0;
begin
  perform public.admin_member_exists(p_auth);
  if p_auth = me and p_role = 'admin' and not p_enabled then
    raise exception 'Cannot remove your own admin role' using errcode = 'P0001', hint = 'self';
  end if;
  if p_enabled then
    insert into public.user_roles(user_id, role) values (p_auth, p_role) on conflict (user_id, role) do nothing;
    get diagnostics added = row_count;
  else
    delete from public.user_roles where user_id = p_auth and role = p_role;
  end if;
  perform public.admin_log(me, 'role', p_auth, jsonb_build_object('role', p_role, 'enabled', p_enabled));
  if added > 0 and p_role::text in ('admin', 'moderator') then
    perform public.voli_helper_notice(p_auth, public.voli_gift_notice_text(
      'Headwear ' || case when p_role::text = 'admin' then 'Super Admin' else 'Moderator' end));
  end if;
end;
$$;
revoke all on function public.admin_member_role(uuid, public.app_role, boolean) from public, anon;
grant execute on function public.admin_member_role(uuid, public.app_role, boolean) to authenticated;

commit;
