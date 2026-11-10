-- voli update 013: gifts are added from the management panel (لوحة الإدارة), with their own picture.
-- Run once in the SQL Editor after update 009. Safe to run again.
--
-- 1) Each gift can carry a picture uploaded from the panel (art_url). The 8 original gifts keep
--    the pictures built into the app until a new picture is uploaded for them.
-- 2) Pictures live in the public "gift-art" bucket: everyone can see them, only top management can upload.
-- 3) New panel functions: admin_create_gift (new gift) and admin_set_gift_art (change a picture).
--    admin_gifts now also returns the picture.

-- ---------- 1) Picture column ----------
alter table public.room_gift_catalog add column if not exists art_url text;

-- Only pictures from our own bucket are accepted.
create or replace function public.gift_art_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select p_url ~ '^https://[^/]+/storage/v1/object/public/gift-art/[A-Za-z0-9._/-]+$'
$$;
revoke all on function public.gift_art_ok(text) from public, anon, authenticated;

-- ---------- 2) Picture storage ----------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('gift-art', 'gift-art', true, 5242880, array['image/png', 'image/webp', 'image/gif', 'image/jpeg'])
      on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
    execute 'drop policy if exists gift_art_read on storage.objects';
    execute $p$create policy gift_art_read on storage.objects for select to public using (bucket_id = 'gift-art')$p$;
    execute 'drop policy if exists gift_art_add on storage.objects';
    execute $p$create policy gift_art_add on storage.objects for insert to authenticated
      with check (bucket_id = 'gift-art' and public.am_i_admin())$p$;
    execute 'drop policy if exists gift_art_edit on storage.objects';
    execute $p$create policy gift_art_edit on storage.objects for update to authenticated
      using (bucket_id = 'gift-art' and public.am_i_admin())$p$;
    execute 'drop policy if exists gift_art_remove on storage.objects';
    execute $p$create policy gift_art_remove on storage.objects for delete to authenticated
      using (bucket_id = 'gift-art' and public.am_i_admin())$p$;
  end if;
end;
$$;

-- ---------- 3) Panel: gift list with pictures ----------
drop function if exists public.admin_gifts();
create function public.admin_gifts()
returns table(key text, name text, price bigint, sort integer, active boolean, art_url text, sent_count bigint, sent_value bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select g.key, g.name, g.price, g.sort, g.active, g.art_url,
      (select coalesce(sum(coalesce(c.quantity, 1)), 0)::bigint from public.room_coins c where c.gift_key = g.key),
      (select coalesce(sum(c.amount), 0)::bigint from public.room_coins c where c.gift_key = g.key)
    from public.room_gift_catalog g order by g.sort, g.key;
end;
$$;
revoke all on function public.admin_gifts() from public, anon;
grant execute on function public.admin_gifts() to authenticated;

-- ---------- 4) Panel: add a new gift (shown in the app right away) ----------
-- Sort null = after the last gift. Returns the new gift's key.
create or replace function public.admin_create_gift(p_name text, p_price bigint, p_sort integer, p_art_url text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text := btrim(coalesce(p_name, '')); k text; s integer;
begin
  if char_length(n) not between 1 and 40 then raise exception 'Bad name' using errcode = 'P0001', hint = 'bad_name'; end if;
  if p_price is null or p_price <= 0 or p_price > 100000000000 then raise exception 'Bad price' using errcode = 'P0001', hint = 'bad_price'; end if;
  if p_art_url is null or not public.gift_art_ok(p_art_url) then raise exception 'Bad picture' using errcode = 'P0001', hint = 'bad_art'; end if;
  s := coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from public.room_gift_catalog));
  loop
    k := 'g' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    exit when not exists (select 1 from public.room_gift_catalog where key = k);
  end loop;
  insert into public.room_gift_catalog(key, name, price, sort, active, art_url) values (k, n, p_price, s, true, p_art_url);
  perform public.admin_log(me, 'gift_create', null, jsonb_build_object('key', k, 'name', n, 'price', p_price));
  return k;
end;
$$;
revoke all on function public.admin_create_gift(text, bigint, integer, text) from public, anon;
grant execute on function public.admin_create_gift(text, bigint, integer, text) to authenticated;

-- ---------- 5) Panel: change a gift's picture ----------
create or replace function public.admin_set_gift_art(p_key text, p_art_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  if not exists (select 1 from public.room_gift_catalog where key = p_key) then
    raise exception 'No such gift' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_art_url is null or not public.gift_art_ok(p_art_url) then raise exception 'Bad picture' using errcode = 'P0001', hint = 'bad_art'; end if;
  update public.room_gift_catalog set art_url = p_art_url where key = p_key;
  perform public.admin_log(me, 'gift_art', null, jsonb_build_object('key', p_key));
end;
$$;
revoke all on function public.admin_set_gift_art(text, text) from public, anon;
grant execute on function public.admin_set_gift_art(text, text) to authenticated;
