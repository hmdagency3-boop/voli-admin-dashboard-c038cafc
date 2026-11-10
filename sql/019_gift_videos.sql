-- voli update 019: video gifts (هدايا الفيديو).
-- Run once in the SQL Editor after updates 013 and 018. Safe to run again.
--
-- 1) Each gift can carry a video (video_url) that the app plays after the gift is sent.
--    A gift without a video behaves exactly as before.
-- 2) Videos are uploaded from the panel to Cloudinary (cloud "zsxxjkqg", folder voli/gift-videos);
--    only video links from that cloud are accepted.
-- 3) New panel functions: admin_set_gift_video (add / change / remove a video) and a 5-argument
--    admin_create_gift that can save the video together with the new gift.
--    admin_gifts now also returns the video.
-- 4) The app reads video_url from room_gift_catalog like the other gift columns.
-- 5) Links are accepted even when the file name has spaces, Arabic or other special letters, or %-encoding.
-- 6) The last line refreshes the API's function list right away (NOTIFY pgrst), so the panel
--    sees the new functions without waiting.
--
-- The panel creates a new gift with the original 4-argument admin_create_gift and then attaches
-- the video with admin_set_gift_video, so it works even if only the old version is visible.

-- ---------- 1) Video column ----------
alter table public.room_gift_catalog add column if not exists video_url text;

-- Only videos from our own Cloudinary cloud are accepted. File names may contain spaces, special
-- letters and %-encoding; only control characters, quotes, < > and backslashes are refused.
create or replace function public.gift_video_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_url ~ '^https://res\.cloudinary\.com/zsxxjkqg/video/upload/[^[:cntrl:]"''<>\\]+$', false)
$$;
revoke all on function public.gift_video_ok(text) from public, anon, authenticated;

-- Same relaxed rule for Cloudinary gift pictures (old gift-art bucket links keep working).
create or replace function public.gift_art_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
       p_url ~ '^https://[^/]+/storage/v1/object/public/gift-art/[A-Za-z0-9._/-]+$'
    or p_url ~ '^https://res\.cloudinary\.com/zsxxjkqg/[^[:cntrl:]"''<>\\]+$', false)
$$;
revoke all on function public.gift_art_ok(text) from public, anon, authenticated;

-- ---------- 2) Panel: gift list with pictures and videos ----------
drop function if exists public.admin_gifts();
create function public.admin_gifts()
returns table(key text, name text, price bigint, sort integer, active boolean, art_url text, video_url text, sent_count bigint, sent_value bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select g.key, g.name, g.price, g.sort, g.active, g.art_url, g.video_url,
      (select coalesce(sum(coalesce(c.quantity, 1)), 0)::bigint from public.room_coins c where c.gift_key = g.key),
      (select coalesce(sum(c.amount), 0)::bigint from public.room_coins c where c.gift_key = g.key)
    from public.room_gift_catalog g order by g.sort, g.key;
end;
$$;
revoke all on function public.admin_gifts() from public, anon;
grant execute on function public.admin_gifts() to authenticated;

-- ---------- 3) Panel: add a new gift ----------
-- 3a) The original 4-argument version (same as update 013) — the panel uses this one, then attaches the video.
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

-- 3b) 5-argument version with an optional video (kept for compatibility).
-- No defaults on either version, so calls are never ambiguous.
create or replace function public.admin_create_gift(p_name text, p_price bigint, p_sort integer, p_art_url text, p_video_url text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text := btrim(coalesce(p_name, '')); k text; s integer;
begin
  if char_length(n) not between 1 and 40 then raise exception 'Bad name' using errcode = 'P0001', hint = 'bad_name'; end if;
  if p_price is null or p_price <= 0 or p_price > 100000000000 then raise exception 'Bad price' using errcode = 'P0001', hint = 'bad_price'; end if;
  if p_art_url is null or not public.gift_art_ok(p_art_url) then raise exception 'Bad picture' using errcode = 'P0001', hint = 'bad_art'; end if;
  if p_video_url is not null and not public.gift_video_ok(p_video_url) then raise exception 'Bad video' using errcode = 'P0001', hint = 'bad_video'; end if;
  s := coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from public.room_gift_catalog));
  loop
    k := 'g' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    exit when not exists (select 1 from public.room_gift_catalog where key = k);
  end loop;
  insert into public.room_gift_catalog(key, name, price, sort, active, art_url, video_url) values (k, n, p_price, s, true, p_art_url, p_video_url);
  perform public.admin_log(me, 'gift_create', null, jsonb_build_object('key', k, 'name', n, 'price', p_price, 'video', p_video_url is not null));
  return k;
end;
$$;
revoke all on function public.admin_create_gift(text, bigint, integer, text, text) from public, anon;
grant execute on function public.admin_create_gift(text, bigint, integer, text, text) to authenticated;

-- ---------- 4) Panel: add, change or remove a gift's video (null = remove) ----------
create or replace function public.admin_set_gift_video(p_key text, p_video_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  if not exists (select 1 from public.room_gift_catalog where key = p_key) then
    raise exception 'No such gift' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_video_url is not null and not public.gift_video_ok(p_video_url) then
    raise exception 'Bad video' using errcode = 'P0001', hint = 'bad_video';
  end if;
  update public.room_gift_catalog set video_url = p_video_url where key = p_key;
  perform public.admin_log(me, 'gift_video', null, jsonb_build_object('key', p_key, 'removed', p_video_url is null));
end;
$$;
revoke all on function public.admin_set_gift_video(text, text) from public, anon;
grant execute on function public.admin_set_gift_video(text, text) to authenticated;

-- ---------- 5) Refresh the API's function list right away ----------
notify pgrst, 'reload schema';
