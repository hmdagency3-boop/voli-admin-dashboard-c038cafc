// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

// Explicit opt-in isolated DB, never the application's database credentials.
const enabled = process.env['VOLI_BAN_TEST_DB'] === 'local';
const admin = '00000000-0000-0000-0000-000000000001';
const a = '00000000-0000-0000-0000-000000000002';
const b = '00000000-0000-0000-0000-000000000003';
const c = '00000000-0000-0000-0000-000000000004';
function sql(text: string) {
  return execFileSync('psql', ['-h', '/tmp/voli-pg-socket', '-p', '55432', '-U', 'voli_test', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8' }).trim();
}
function asAdmin(text: string) { return sql(`set test.uid='${admin}'; ${text}`); }
describe.skipIf(!enabled)('unified bans in isolated PostgreSQL', () => {
  beforeAll(() => {
    sql(readFileSync('src/test/fixtures/ban-schema.sql', 'utf8'));
    sql(readFileSync('sql/015_device_bans.sql', 'utf8'));
    sql(readFileSync('sql/016_unified_bans.sql', 'utf8'));
    sql(`set test.uid='${a}'; select public.voli_report_device('shared'); select public.voli_report_device('other-a');
      set test.uid='${b}'; select public.voli_report_device('shared'); select public.voli_report_device('other-b');`);
  });
  describe.each(['015_device_bans', '016_unified_bans'])('%s device IP fallback', (version) => {
    function report(text: string) {
      // Exercise each actual owner script, rolling back all changes so ban fixtures stay intact.
      const script = readFileSync(`sql/${version}.sql`, 'utf8')
        .replace(/^begin;$/m, '').replace(/^commit;$/m, '');
      // Owner scripts also emit setup SELECTs (e.g. setval); assert the final query result only.
      return sql(`begin; ${script} set test.uid='${admin}'; ${text} rollback;`).split('\n').at(-1) ?? '';
    }
    const call = (ip: string) => `select public.voli_report_device('ip-test',null,null,null,null,null,${ip});`;
    const storedIP = "select host(ip) from public.member_devices where device_id='ip-test';";
    it('uses the client IP when request headers are missing', () => {
      expect(report(`set request.headers='{}'; ${call("' 203.0.113.9 '")} ${storedIP}`)).toBe('203.0.113.9');
    });
    it('prefers the server-header IP over the client IP', () => {
      expect(report(`set request.headers='{"x-forwarded-for":"198.51.100.7, 198.51.100.8"}'; ${call("'203.0.113.9'")} ${storedIP}`)).toBe('198.51.100.7');
    });
    it('falls back to a valid IPv6 client IP when the header IP is invalid', () => {
      expect(report(`set request.headers='{"x-real-ip":"invalid"}'; ${call("'2001:db8::9'")} ${storedIP}`)).toBe('2001:db8::9');
    });
    it('ignores invalid client IP without losing the previously stored IP', () => {
      expect(report(`set request.headers='{}'; ${call("'203.0.113.9'")} ${call("'invalid'")} ${storedIP}`)).toBe('203.0.113.9');
    });
    it('accepts null and blank client IPs', () => {
      expect(report(`set request.headers='{}'; ${call('null')} ${call("' '")} select ip is null from public.member_devices where device_id='ip-test';`)).toBe('t');
    });
    it('preserves positional calls with one through six arguments and named legacy calls', () => {
      const calls = Array.from({ length: 6 }, (_, i) => `select public.voli_report_device('legacy-${i}',${Array(i).fill('null').join(',')});`.replace(',);', ');')).join('\n');
      expect(report(`set request.headers='{}'; ${calls}
        select public.voli_report_device(p_device_id=>'legacy-named',p_carrier=>'carrier');
        select count(*) from public.member_devices where device_id like 'legacy-%';`)).toBe('7');
    });
    it('matches IP bans using the fallback client IP', () => {
      const ban = version === '015_device_bans'
        ? "select public.admin_device_ban('ip','203.0.113.9');"
        : "select public.admin_create_ban('ip','203.0.113.9');";
      expect(report(`set request.headers='{}'; do $$ begin ${ban.replace('select ', 'perform ')} end $$;
        select public.voli_report_device('ip-test',null,null,null,null,null,'203.0.113.9')->>'kind';`)).toBe('ip');
    });
    it('retains authenticated-only execution for both overloads', () => {
      expect(report(`select bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')
        and not has_function_privilege('anon', oid, 'EXECUTE'))
        from pg_proc where pronamespace='public'::regnamespace and proname='voli_report_device';`)).toBe('t');
    });
  });
  it('allocates globally unique codes starting at 200', () => {
    expect(asAdmin("select public.admin_create_ban('device','shared');")).toBe('200');
    expect(asAdmin("select public.admin_create_ban('account','101');")).toBe('201');
    expect(asAdmin("select public.admin_create_ban('ip','185.12.4.9');")).toBe('202');
    expect(asAdmin("select public.admin_create_ban('network','185.12.4.0/24');")).toBe('203');
  });
  it('bans all accounts historically used on the device', () => {
    expect(sql(`select count(*) from public.member_bans where auth_id in ('${a}','${b}');`)).toBe('2');
    expect(sql(`select count(*) from auth.users where id in ('${a}','${b}') and banned_until > now();`)).toBe('2');
  });
  it('keeps linked accounts banned on another device', () => {
    expect(sql(`set test.uid='${b}'; select public.voli_report_device('brand-new')->>'code';`)).toBe('200');
    expect(sql(`select banned_until > now() from auth.users where id='${b}';`)).toBe('t');
  });
  it('links accounts newly reported on an actively banned device', () => {
    expect(sql(`set test.uid='${c}'; select public.voli_report_device('shared')->>'code';`)).toBe('200');
    expect(sql(`select count(*) from public.member_bans where auth_id='${c}';`)).toBe('1');
  });
  it('ID search returns all historical devices and same-device accounts', () => {
    const result = JSON.parse(asAdmin("select public.admin_device_connections('101');"));
    expect(result.devices.map((d: { device_id: string }) => d.device_id).sort()).toEqual(['other-a', 'shared']);
    expect(result.accounts.map((r: { public_id: number }) => r.public_id)).toEqual([101, 102, 103]);
  });
  it('revoking device source preserves independent account bans', () => {
    asAdmin('select public.admin_revoke_ban(id) from public.voli_bans where code=200;');
    expect(sql(`select count(*) from public.member_bans where auth_id='${a}';`)).toBe('1');
    expect(sql(`select count(*) from public.member_bans where auth_id in ('${b}','${c}');`)).toBe('0');
    expect(sql(`select banned_until is null from auth.users where id='${b}';`)).toBe('t');
  });
  it('rejects non-administrators', () => {
    expect(() => sql(`set test.uid='${b}'; select public.admin_create_ban('account','101');`)).toThrow();
  });
  it('does not ban management through a shared device', () => {
    sql(`set test.uid='${admin}'; select public.voli_report_device('admin-device');`);
    expect(() => asAdmin("select public.admin_create_ban('device','admin-device');")).toThrow();
  });
  it('can rerun the owner upgrade without resurrecting revoked sources', () => {
    sql(readFileSync('sql/016_unified_bans.sql','utf8'));
    expect(sql('select count(*) from public.voli_bans;')).toBe('4');
    expect(sql(`select count(*) from public.member_bans where auth_id='${b}';`)).toBe('0');
  });
});