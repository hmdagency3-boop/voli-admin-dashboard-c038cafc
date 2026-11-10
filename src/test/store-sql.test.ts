// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

// Explicit opt-in isolated DB (VOLI_STORE_TEST_DB=local), never the application's database.
const enabled = process.env['VOLI_STORE_TEST_DB'] === 'local';
const admin = '00000000-0000-0000-0000-000000000001';
const a = '00000000-0000-0000-0000-000000000002';
const b = '00000000-0000-0000-0000-000000000003';
const ART = 'https://res.cloudinary.com/zsxxjkqg/image/upload/v1/voli/store/frame.png';
const VIDEO = 'https://res.cloudinary.com/zsxxjkqg/video/upload/v1/voli/store-videos/car.mp4';
const psql = (db: string, text: string) => execFileSync('psql',
  ['-h', '/tmp/voli-pg-socket', '-p', '55432', '-U', 'voli_test', '-d', db, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
  { input: text, encoding: 'utf8' }).trim();
const sql = (text: string) => psql('voli_store', text);
/** Runs as a signed-in app user (role authenticated, RLS on). */
const as = (uid: string, text: string) => sql(`set test.uid='${uid}'; set role authenticated; ${text}`);
const tryAs = (uid: string, stmt: string) => as(uid, `select public.t_try($q$${stmt}$q$);`);
const coins = (uid: string) => Number(sql(`select coins from public.profiles where auth_id='${uid}'`));
const daysLeft = (uid: string, item: string) =>
  Number(sql(`select round(extract(epoch from expires_at - now()) / 86400) from public.member_items where auth_id='${uid}' and item_id='${item}'`));
const create = (kind: string, name: string, price: number, days: number, video = 'null') =>
  as(admin, `select public.admin_create_store_item('${kind}','simple','${name}',${price},${days},null,'${ART}',${video});`);

describe.skipIf(!enabled)('store and backpack (sql/023) in isolated PostgreSQL', () => {
  let ghost: string, goose: string, car: string, hidden: string;
  beforeAll(() => {
    psql('postgres', 'drop database if exists voli_store; create database voli_store;');
    sql(readFileSync('src/test/fixtures/store-schema.sql', 'utf8'));
    sql(readFileSync('sql/023_store.sql', 'utf8'));
    sql(readFileSync('sql/023_store.sql', 'utf8')); // safe to run again
    ghost = create('frame', 'Ghost Cemetery', 15999, 30);
    goose = create('frame', 'Cool Goose', 20000, 7);
    car = create('ride', 'Halloween Rush', 89999, 15, `'${VIDEO}'`);
    hidden = create('frame', 'Old Frame', 10, 7);
    as(admin, `select public.admin_update_store_item('${hidden}','Old Frame','simple',10,7,null,false);`);
  });

  it('buying takes exactly the price from the coins and adds the item for its days', () => {
    expect(tryAs(a, `select public.store_buy('${ghost}')`)).toBe('ok');
    expect(coins(a)).toBe(500000 - 15999);
    expect(daysLeft(a, ghost)).toBe(30);
  });
  it('buying the same item again adds its days on top of what is left', () => {
    sql(`update public.member_items set expires_at = now() + interval '13 days' where auth_id='${a}' and item_id='${ghost}'`);
    expect(tryAs(a, `select public.store_buy('${ghost}')`)).toBe('ok');
    expect(daysLeft(a, ghost)).toBe(43);
  });
  it('refuses when the coins are not enough and keeps the balance', () => {
    expect(tryAs(b, `select public.store_buy('${ghost}')`)).toBe('not_enough_coins');
    expect(coins(b)).toBe(10);
    expect(sql(`select count(*) from public.member_items where auth_id='${b}'`)).toBe('0');
  });
  it('hidden items cannot be bought', () => {
    expect(tryAs(a, `select public.store_buy('${hidden}')`)).toBe('not_for_sale');
  });
  it('wears one item per kind: a new frame takes off the old frame, not the ride', () => {
    as(a, `select public.store_buy('${goose}'); select public.store_buy('${car}');`);
    as(a, `select public.store_equip('${ghost}', true); select public.store_equip('${car}', true); select public.store_equip('${goose}', true);`);
    expect(sql(`select string_agg(i.name, ',' order by i.name) from public.member_items m join public.store_items i on i.id=m.item_id where m.auth_id='${a}' and m.equipped`))
      .toBe('Cool Goose,Halloween Rush');
  });
  it('cannot wear an item that is not in the backpack or whose days ended', () => {
    expect(tryAs(b, `select public.store_equip('${ghost}', true)`)).toBe('not_owned');
    sql(`update public.member_items set expires_at = now() - interval '1 minute' where auth_id='${a}' and item_id='${ghost}'`);
    expect(tryAs(a, `select public.store_equip('${ghost}', true)`)).toBe('not_owned');
  });
  it('members see their own backpack and only what others are wearing now', () => {
    expect(as(a, 'select count(*) from public.member_items')).toBe('3');
    expect(as(b, 'select count(*) from public.member_items')).toBe('2'); // A's worn frame and ride
    sql(`update public.member_items set expires_at = now() - interval '1 minute' where auth_id='${a}' and item_id='${goose}'`);
    expect(as(b, 'select count(*) from public.member_items')).toBe('1'); // ended frame no longer shows
  });
  it('members cannot change coins-related tables directly', () => {
    expect(tryAs(b, `insert into public.member_items(auth_id,item_id,kind,expires_at) values ('${b}','${ghost}','frame',now()+interval '9 days')`)).not.toBe('ok');
    expect(tryAs(b, `update public.store_items set price=1`)).not.toBe('ok');
    expect(tryAs(b, `select count(*) from public.store_purchases`)).not.toBe('ok');
  });
  it('management functions refuse non-admins', () => {
    expect(tryAs(a, `select public.admin_store_items()`)).toBe('not_admin');
    expect(tryAs(a, `select public.admin_grant_store_item('${a}','${car}',null)`)).toBe('not_admin');
  });
  it('a management grant is free, uses the item days by default and works for hidden items', () => {
    const before = coins(b);
    expect(tryAs(admin, `select public.admin_grant_store_item('${b}','${hidden}',null)`)).toBe('ok');
    expect(coins(b)).toBe(before);
    expect(daysLeft(b, hidden)).toBe(7);
    expect(tryAs(admin, `select public.admin_grant_store_item('${b}','${car}',3)`)).toBe('ok');
    expect(daysLeft(b, car)).toBe(3);
  });
  it('the panel list counts only paid sales and their value', () => {
    expect(as(admin, `select sold_count || '/' || sold_value from public.admin_store_items() where id='${ghost}'`)).toBe(`2/${2 * 15999}`);
    expect(as(admin, `select sold_count from public.admin_store_items() where id='${car}'`)).toBe('1');
  });
  it('revoking takes the item out of the backpack', () => {
    expect(tryAs(admin, `select public.admin_revoke_store_item('${b}','${car}')`)).toBe('ok');
    expect(sql(`select count(*) from public.member_items where auth_id='${b}' and item_id='${car}'`)).toBe('0');
  });
  it("only accepts pictures and videos from Voli's Cloudinary", () => {
    const bad = (art: string, video = 'null') =>
      tryAs(admin, `select public.admin_create_store_item('frame','simple','X',1,1,null,'${art}',${video})`);
    expect(bad('https://example.com/x.png')).toBe('bad_item_art');
    expect(bad('https://res.cloudinary.com/othercloud/image/upload/v1/x.png')).toBe('bad_item_art');
    expect(bad(ART, "'https://example.com/x.mp4'")).toBe('bad_video');
  });
  it('rejects bad prices, durations and kinds', () => {
    expect(tryAs(admin, `select public.admin_create_store_item('frame','simple','X',0,7,null,'${ART}',null)`)).toBe('bad_price');
    expect(tryAs(admin, `select public.admin_create_store_item('frame','simple','X',5,0,null,'${ART}',null)`)).toBe('bad_days');
    expect(tryAs(admin, `select public.admin_create_store_item('hat','simple','X',5,7,null,'${ART}',null)`)).toBe('bad_item_kind');
    expect(tryAs(admin, `select public.admin_create_store_item('frame','fancy','X',5,7,null,'${ART}',null)`)).toBe('bad_style');
  });
});
