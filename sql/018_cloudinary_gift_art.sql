-- voli update 018: gift pictures are now uploaded to Cloudinary (cloud "zsxxjkqg", folder voli/gifts).
-- Run once in the SQL Editor after update 013. Safe to run again.
-- Old links from the gift-art bucket keep working.
create or replace function public.gift_art_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select p_url ~ '^https://[^/]+/storage/v1/object/public/gift-art/[A-Za-z0-9._/-]+$'
      or p_url ~ '^https://res\.cloudinary\.com/zsxxjkqg/[A-Za-z0-9._/,:-]+$'
$$;
revoke all on function public.gift_art_ok(text) from public, anon, authenticated;
