import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
const memberSupabase = supabase;
import { authErrorMessage } from '@/lib/auth-messages';

/**
 * Management panel (the hidden /admin pages). Every call goes to a database function in
 * supabase/009_admin.sql that checks the admin role first, so the rules stay in the database.
 * The panel uses its own sign-in (adminSupabase), separate from the member app's session.
 */

/** The panel's own session (null = signed out of the panel). */
export function useAdminSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

/** Signs in to the panel only. Returns an Arabic error message, or null on success. */
export async function adminSignIn(email: string, password: string): Promise<string | null> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? authErrorMessage(error) : null;
  } catch {
    return 'تعذّر الاتصال، تحقق من الإنترنت وحاول مجدداً';
  }
}

export const adminSignOut = () => supabase.auth.signOut();

/** Display name of whoever is signed in to the panel. */
export async function getAdminName(authId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('display_name').eq('auth_id', authId).maybeSingle();
  return (data as { display_name?: string } | null)?.display_name ?? null;
}

const missing = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export type AdminAccess = 'admin' | 'denied' | 'missing';
/** Whether the signed-in member may open the panel ('missing' = update 009 not run yet). */
export async function getAdminAccess(): Promise<AdminAccess> {
  const { data, error } = await supabase.rpc('am_i_admin');
  if (error) return missing(error.code) ? 'missing' : 'denied';
  return data ? 'admin' : 'denied';
}

export type MyBan = { until: string | null; reason: string | null };
/** The signed-in member's active ban, if any. Older databases without update 009 never report one. */
export async function getMyBan(): Promise<MyBan | null> {
  const { data, error } = await memberSupabase.rpc('my_ban');
  if (error) return null;
  const row = (data as MyBan[] | null)?.[0];
  return row ?? null;
}

// ---------- Dashboard ----------
export type Dashboard = {
  members: number; members_today: number; members_week: number; live_rooms: number; in_rooms_now: number;
  coins_balance: number; gifts_today: number; gifts_week: number; vip_active: number; agencies: number;
  pending_applications: number; bans_active: number; days: { day: string; signups: number; gifts: number }[];
};
export const getDashboard = () => rpc<Dashboard>('admin_dashboard');

// ---------- Members ----------
export type MemberFilter = 'all' | 'vip' | 'banned' | 'staff' | 'new';
export type AdminMemberRow = {
  auth_id: string; public_id: number; special_id: string | null; display_name: string; avatar_url: string | null;
  email: string | null; coins: number; vip_level: number; vip_expires_at: string | null; charisma_points: number;
  wealth_points: number; created_at: string; roles: string[]; banned: boolean; ban_until: string | null; total: number;
};
export const MEMBERS_PAGE = 30;
export async function getMembers(query: string, filter: MemberFilter, page: number) {
  const rows = await rpc<AdminMemberRow[]>('admin_members', {
    p_query: query.trim() || null, p_filter: filter, p_limit: MEMBERS_PAGE, p_offset: page * MEMBERS_PAGE,
  });
  return { rows: rows.map((r) => ({ ...r, coins: Number(r.coins), total: Number(r.total) })), total: Number(rows[0]?.total ?? 0) };
}

export type VipGrant = { id: string; level: number; source: string; starts_at: string; expires_at: string | null; coins_paid: number; note: string | null; created_at: string };
export type MemberAction = { action: string; details: Record<string, unknown>; created_at: string; admin_name: string | null };
export type AdminMember = {
  profile: {
    auth_id: string; public_id: number; special_id: string | null; display_name: string; avatar_url: string | null; bio: string | null;
    coins: number; vip_level: number; vip_expires_at: string | null; charisma_points: number; wealth_points: number; created_at: string;
  };
  email: string | null; roles: string[];
  ban: { until: string | null; reason: string | null; created_at: string } | null;
  vip_grants: VipGrant[];
  room: { id: string; name: string; is_live: boolean } | null;
  agency_owned: { id: string; code: number; name: string } | null;
  agency_member: { id: string; code: number; name: string; joined_at: string } | null;
  gifts_sent: number; gifts_received: number; actions: MemberAction[];
};
export const getMember = (id: string) => rpc<AdminMember>('admin_member', { p_auth: id });

export const changeCoins = (id: string, amount: number, note?: string) =>
  rpc<number>('admin_member_coins', { p_auth: id, p_amount: amount, p_note: note || null });
export const grantVip = (id: string, level: number, days: number | null, source: 'admin' | 'gift' | 'event', note?: string) =>
  rpc<string>('admin_member_vip', { p_auth: id, p_level: level, p_days: days, p_source: source, p_note: note || null });
export const revokeVip = (id: string) => rpc<number>('admin_member_vip_revoke', { p_auth: id });
export const setSpecialId = (id: string, special: string | null) => rpc<void>('admin_member_special_id', { p_auth: id, p_special: special });
export const setRole = (id: string, role: 'admin' | 'moderator', enabled: boolean) =>
  rpc<void>('admin_member_role', { p_auth: id, p_role: role, p_enabled: enabled });
export const editProfile = (id: string, p: { name?: string; clearAvatar?: boolean; clearBio?: boolean }) =>
  rpc<void>('admin_member_profile', { p_auth: id, p_display_name: p.name || null, p_clear_avatar: !!p.clearAvatar, p_clear_bio: !!p.clearBio });
// ---------- Rule-breaking name / picture (sql/017) ----------
export type ProfileField = 'name' | 'avatar';
export type ProfileLocks = { name_until: string | null; avatar_until: string | null };
export const violationName = (publicId: number | string) => `voli${publicId}`;
/** Mirrors the warning written by admin_profile_violation (preview only). */
export function violationNotice(field: ProfileField, days: number | null, forever: boolean): string {
  const what = field === 'name' ? 'name' : 'profile picture';
  const lock = forever ? ' You can no longer change it.' : days && days > 0 ? ` You cannot change it for ${days} days.` : '';
  return `Warning: your ${what} violates Voli community rules and has been removed.${lock}`;
}
async function rpc017<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw missing(error.code) ? { hint: 'moderation_missing' } : error;
  return data as T;
}
export const removeViolation = (id: string, field: ProfileField, days: number | null, forever: boolean) =>
  rpc017<string>('admin_profile_violation', { p_auth: id, p_field: field, p_days: days, p_forever: forever });
export const setProfileLock = (id: string, field: ProfileField, days: number | null, forever: boolean) =>
  rpc017<string | null>('admin_profile_lock', { p_auth: id, p_field: field, p_days: days, p_forever: forever });
export const getProfileLocks = (id: string) =>
  rpc017<ProfileLocks>('admin_profile_locks', { p_auth: id }).catch(() => null);

/** Returns whether new sign-ins are blocked too. */
export const banMember = (id: string, days: number | null, reason?: string) =>
  rpc<boolean>('admin_member_ban', { p_auth: id, p_days: days, p_reason: reason || null });
export const unbanMember = (id: string) => rpc<void>('admin_member_unban', { p_auth: id });

// ---------- Rooms ----------
export type AdminRoom = {
  id: string; name: string; owner_id: string; owner_public_id: number; owner_name: string; owner_avatar: string | null;
  is_live: boolean; locked: boolean; mode: string; seat_count: number; present: number; coins_total: number; created_at: string; updated_at: string;
};
export async function getRooms(query: string, liveOnly: boolean) {
  const rows = await rpc<AdminRoom[]>('admin_rooms', { p_query: query.trim() || null, p_live_only: liveOnly });
  return rows.map((r) => ({ ...r, present: Number(r.present), coins_total: Number(r.coins_total) }));
}
export const closeRoom = (id: string) => rpc<void>('admin_close_room', { p_room: id });
export const clearRoomChat = (id: string) => rpc<void>('admin_clear_room_chat', { p_room: id });

// ---------- Gifts and VIP prices ----------
export type AdminGift = {
  key: string; name: string; price: number; sort: number; active: boolean;
  /** Picture uploaded from the panel; null = the picture built into the app (original 8 gifts, or before update 013). */
  art_url: string | null;
  /** Video played in the app after the gift is sent; null = normal gift (or before update 019). */
  video_url: string | null;
  sent_count: number; sent_value: number;
};
export async function getGifts() {
  const rows = await rpc<AdminGift[]>('admin_gifts');
  return rows.map((g) => ({ ...g, art_url: g.art_url ?? null, video_url: g.video_url ?? null, price: Number(g.price), sent_count: Number(g.sent_count), sent_value: Number(g.sent_value) }));
}
export const updateGift = (g: Pick<AdminGift, 'key' | 'name' | 'price' | 'sort' | 'active'>) =>
  rpc<void>('admin_update_gift', { p_key: g.key, p_name: g.name, p_price: g.price, p_sort: g.sort, p_active: g.active });

/** Gift pictures: PNG / WebP / GIF / JPEG up to 5 MB (same limits as the gift-art bucket in sql/013_gift_uploads.sql). */
export const GIFT_ART_TYPES = ['image/png', 'image/webp', 'image/gif', 'image/jpeg'];
export const GIFT_ART_MAX = 5 * 1024 * 1024;
export function giftArtProblem(file: { type: string; size: number }): string | null {
  if (!GIFT_ART_TYPES.includes(file.type)) return 'الصورة لازم تكون PNG أو WebP أو GIF أو JPG';
  if (file.size > GIFT_ART_MAX) return 'حجم الصورة أكبر من 5 ميجا';
  return null;
}

/** Cloudinary (unsigned upload preset — public by design, no secret in the browser). */
export const CLOUDINARY_CLOUD = 'zsxxjkqg';
export const CLOUDINARY_PRESET = 'voli_uploads';
export const CLOUDINARY_GIFT_FOLDER = 'voli/gifts';

export const CLOUDINARY_VIDEO_FOLDER = 'voli/gift-videos';

/** Gift videos (played in the app after the gift is sent): MP4 / WebM / MOV up to 50 MB. */
export const GIFT_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const GIFT_VIDEO_MAX = 50 * 1024 * 1024;
export function giftVideoProblem(file: { type: string; size: number }): string | null {
  if (!GIFT_VIDEO_TYPES.includes(file.type)) return 'الفيديو لازم يكون MP4 أو WebM أو MOV';
  if (file.size > GIFT_VIDEO_MAX) return 'حجم الفيديو أكبر من 50 ميجا';
  return null;
}
/**
 * Only video links from Voli's Cloudinary cloud (same rule as gift_video_ok in sql/019_gift_videos.sql).
 * File names may contain spaces, Arabic or other special letters and %-encoding; only control
 * characters, quotes, <, > and backslashes are refused.
 */
// eslint-disable-next-line no-control-regex
const GIFT_VIDEO_URL = /^https:\/\/res\.cloudinary\.com\/zsxxjkqg\/video\/upload\/[^\u0000-\u001f\u007f"'<>\\]+$/;
export const giftVideoUrlOk = (url: string) => GIFT_VIDEO_URL.test(url);
/** Link as it is saved: trimmed, with raw spaces written as %20 so the app can play it. */
export const normalizeGiftVideoUrl = (url: string) => url.trim().replace(/ /g, '%20');

/** Clean ASCII file name for Cloudinary, so names with spaces or special letters never end up in the link. */
export function cloudFileName(original: string, prefix: string, now = Date.now()): string {
  const dot = original.lastIndexOf('.');
  const ext = dot > 0 ? original.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = (dot > 0 ? original.slice(0, dot) : original)
    .normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
  return `${prefix}-${base ? `${base}-` : ''}${now}${ext ? `.${ext}` : ''}`;
}

/** Upload stages: sending bytes, Cloudinary processing after 100%, then saving in Voli's database. */
export type UploadStatus =
  | { stage: 'uploading'; percent: number; loaded: number; total: number; what?: string }
  | { stage: 'processing' }
  | { stage: 'saving' };
export type UploadProgress = (status: UploadStatus) => void;

const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
/** Text shown to the admin for each upload stage. */
export function uploadStatusText(s: UploadStatus): string {
  if (s.stage === 'uploading') {
    if (s.percent >= 100) return 'تم الإرسال (100%)، جارٍ المعالجة في السحابة وحفظ الهدية…';
    return `جارٍ رفع ${s.what ?? 'الفيديو'}… ${s.percent}% (${mb(s.loaded)} من ${mb(s.total)} ميجا)`;
  }
  if (s.stage === 'processing') return 'تم الإرسال (100%)، جارٍ المعالجة في السحابة وحفظ الهدية…';
  return 'جارٍ حفظ الهدية في فولي…';
}

/** Unsigned upload to Cloudinary with progress; returns the https link. */
function cloudinaryUpload(file: File, kind: 'image' | 'video', folder: string, onProgress?: UploadProgress): Promise<string> {
  const what = kind === 'video' ? 'الفيديو' : 'الصورة';
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, cloudFileName(file.name, kind === 'video' ? 'gift-video' : 'gift'));
    form.append('upload_preset', CLOUDINARY_PRESET);
    form.append('folder', folder);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${kind}/upload`);
    let sent = false;
    xhr.upload.onprogress = (e) => {
      if (sent || !e.lengthComputable || !e.total) return;
      // floor: 100% only once every byte has really been sent
      const percent = Math.min(100, Math.floor((e.loaded / e.total) * 100));
      onProgress?.({ stage: 'uploading', percent, loaded: e.loaded, total: e.total, what });
    };
    xhr.upload.onload = () => { sent = true; onProgress?.({ stage: 'processing' }); };
    const fail = (msg: string) => reject(Object.assign(new Error(`فشل رفع ${what} إلى Cloudinary: ${msg}`), { hint: 'upload_failed', kind }));
    xhr.onerror = () => fail('تعذّر الاتصال');
    xhr.onload = () => {
      let body: { secure_url?: string; error?: { message?: string } } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) resolve(body.secure_url);
      else fail(body.error?.message ?? `HTTP ${xhr.status}`);
    };
    xhr.send(form);
  });
}

/** Uploads a gift picture to Cloudinary (folder voli/gifts) and returns its https link. */
export async function uploadGiftArt(file: File, onProgress?: UploadProgress): Promise<string> {
  const problem = giftArtProblem(file);
  if (problem) throw Object.assign(new Error(problem), { hint: 'bad_art_file' });
  return cloudinaryUpload(file, 'image', CLOUDINARY_GIFT_FOLDER, onProgress);
}

/** Uploads a gift video to Cloudinary (folder voli/gift-videos) and returns its https link. */
export async function uploadGiftVideo(file: File, onProgress?: UploadProgress): Promise<string> {
  const problem = giftVideoProblem(file);
  if (problem) throw Object.assign(new Error(problem), { hint: 'bad_video_file' });
  return normalizeGiftVideoUrl(await cloudinaryUpload(file, 'video', CLOUDINARY_VIDEO_FOLDER, onProgress));
}

/**
 * True only when PostgREST says the function itself is unknown (not run yet, or its schema cache is stale) —
 * not for other errors raised while the function runs.
 */
export function isMissingFunction(e: unknown, fn: string): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === 'PGRST202') return true;
  return err?.code === '42883' && (err.message ?? '').includes(fn);
}

/** Video calls need update 019; turn "function not found" into a clear message. */
async function videoRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  try { return await rpc<T>(fn, args); }
  catch (e) {
    console.error(`[gifts] ${fn} failed`, e);
    if (isMissingFunction(e, fn)) throw Object.assign(new Error('video_missing'), { hint: 'video_missing', cause: e });
    throw e;
  }
}

/**
 * Adds a new gift (shown in the app right away), optionally with a video. Returns its key.
 * Files are uploaded first; the gift is then created with the original 4-argument admin_create_gift
 * and the video attached with admin_set_gift_video, so it works whichever admin_create_gift versions exist.
 */
export async function createGift(g: { name: string; price: number; sort?: number | null; file: File; video?: File | null }, onProgress?: UploadProgress) {
  // picture progress is shown only while sending; its processing step is quick
  const art = await uploadGiftArt(g.file, (st) => { if (st.stage === 'uploading' && st.percent < 100) onProgress?.(st); });
  const video = g.video ? await uploadGiftVideo(g.video, onProgress) : null;
  onProgress?.({ stage: 'saving' });
  const key = await rpc<string>('admin_create_gift', { p_name: g.name, p_price: g.price, p_sort: g.sort ?? null, p_art_url: art });
  if (!video) return key;
  try {
    await videoRpc<void>('admin_set_gift_video', { p_key: key, p_video_url: video });
  } catch (e) {
    const reason = adminErrorMessage(e);
    throw Object.assign(new Error('video_link_failed'), { hint: 'video_link_failed', reason, key, video, cause: e });
  }
  return key;
}
export async function changeGiftArt(key: string, file: File) {
  const art = await uploadGiftArt(file);
  return rpc<void>('admin_set_gift_art', { p_key: key, p_art_url: art });
}
/** Adds or replaces a gift's video. */
export async function changeGiftVideo(key: string, file: File, onProgress?: UploadProgress) {
  const video = await uploadGiftVideo(file, onProgress);
  onProgress?.({ stage: 'saving' });
  return videoRpc<void>('admin_set_gift_video', { p_key: key, p_video_url: video });
}
/** Uses a video already in Voli's Cloudinary (pasted link). */
export async function setGiftVideoUrl(key: string, url: string) {
  const u = normalizeGiftVideoUrl(url);
  if (!giftVideoUrlOk(u)) throw Object.assign(new Error('bad_video'), { hint: 'bad_video' });
  return videoRpc<void>('admin_set_gift_video', { p_key: key, p_video_url: u });
}
/** Removes the video from the gift (it goes back to a normal gift). The file stays in Cloudinary. */
export const removeGiftVideo = (key: string) => videoRpc<void>('admin_set_gift_video', { p_key: key, p_video_url: null });

export type VipTierPrice = { level: number; name_ar: string; price_coins: number | null; duration_days: number; monthly_salary_coins: number | null };
export async function getVipPrices(): Promise<VipTierPrice[]> {
  const { data, error } = await supabase.from('vip_tiers').select('level, name_ar, price_coins, duration_days, monthly_salary_coins').order('level');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    level: Number(t['level']), name_ar: String(t['name_ar']), duration_days: Number(t['duration_days']),
    price_coins: t['price_coins'] == null ? null : Number(t['price_coins']),
    monthly_salary_coins: t['monthly_salary_coins'] == null ? null : Number(t['monthly_salary_coins']),
  }));
}
export const updateVipPrice = (t: VipTierPrice) => rpc<void>('admin_update_vip_tier', {
  p_level: t.level, p_price_coins: t.price_coins, p_duration_days: t.duration_days, p_monthly_salary_coins: t.monthly_salary_coins,
});

// ---------- Agencies ----------
export type AdminAgency = {
  id: string; code: number; name: string; owner_id: string; owner_public_id: number; owner_name: string; owner_avatar: string | null;
  commission_percent: number | null; members: number; income_week: number; created_at: string;
};
export async function getAgencies(query: string) {
  const rows = await rpc<AdminAgency[]>('admin_agencies', { p_query: query.trim() || null });
  return rows.map((a) => ({ ...a, members: Number(a.members), income_week: Number(a.income_week),
    commission_percent: a.commission_percent == null ? null : Number(a.commission_percent) }));
}
export const updateAgency = (id: string, name: string, commission: number | null) =>
  rpc<void>('admin_update_agency', { p_id: id, p_name: name, p_commission: commission });
export type AgencyHost = { host_id: string; public_id: number; display_name: string; avatar_url: string | null; joined_at: string; income_week: number };
export async function getAgencyHosts(agency: string) {
  const rows = await rpc<AgencyHost[]>('admin_agency_members', { p_agency: agency });
  return rows.map((h) => ({ ...h, income_week: Number(h.income_week) }));
}
export const removeAgencyHost = (agency: string, host: string) => rpc<void>('admin_remove_agency_host', { p_agency: agency, p_host: host });

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export type AgencyApplication = {
  id: string; applicant_id: string; agency_name: string; full_name: string; phone: string; country: string; note: string | null;
  status: ApplicationStatus; reject_reason: string | null; created_at: string; code: number | null;
};
export const getApplications = (status: ApplicationStatus) => rpc<AgencyApplication[]>('admin_agency_applications', { p_status: status });
export const reviewApplication = (id: string, approve: boolean, reason?: string) =>
  rpc<number | null>('admin_review_application', { p_id: id, p_approve: approve, p_reason: reason || null });

// ---------- Official notices (Voli Helper chat, ID 100 — sql/014_admin_grant_notices.sql) ----------
// The database sends these automatically when VIP, a role, coins or a special ID is given;
// the same wording is built here for previews and for notices sent by hand.
const GIFT_PREFIX = 'Congratulations on receiving the official gift of ';
const validity = (days?: number | null) => (days && days > 0 ? ` ,valid for ${days} days.` : '.');

/** "Congratulations on receiving the official gift of {what}[ ,valid for N days]." */
export const giftNotice = (what: string, days?: number | null) => `${GIFT_PREFIX}${what.trim()}${validity(days)}`;
export const headwearNotice = (name: string, days?: number | null) => giftNotice(`Headwear ${name.trim()}`, days);
export const vipHeadwearNotice = (level: number, days?: number | null) => headwearNotice(`vip ${level}`, days);
export const vipUpgradeNotice = (level: number, days?: number | null) => `Congratulations on your upgrade to VIP${level}${validity(days)}`;
/** Both messages a member receives when given VIP, in the order they arrive. */
export const vipGrantNotices = (level: number, days?: number | null) => [vipUpgradeNotice(level, days), vipHeadwearNotice(level, days)];
export const roleNotice = (role: 'admin' | 'moderator') => headwearNotice(role === 'admin' ? 'Super Admin' : 'Moderator');
/** Only added coins get a message (removing coins sends nothing). */
export const coinsNotice = (amount: number) => (amount > 0 ? giftNotice(`${Math.trunc(amount)} Coins`) : null);
export const specialIdNotice = (id: string) => `Congratulations on receiving your Special ID: ${id.trim()}.`;

export type NoticeTemplate = 'super_admin' | 'moderator' | 'vip_headwear' | 'vip_upgrade' | 'headwear' | 'gift' | 'custom';
export type NoticeInput = { template?: NoticeTemplate; level?: number; days?: number | null; name?: string; text?: string };
/** The message a hand-sent notice will carry, or null while the form is incomplete. */
export function buildNotice(v: NoticeInput): string | null {
  const days = v.days ?? null, name = v.name?.trim() ?? '';
  switch (v.template) {
    case 'super_admin': return roleNotice('admin');
    case 'moderator': return roleNotice('moderator');
    case 'vip_headwear': return v.level ? vipHeadwearNotice(v.level, days) : null;
    case 'vip_upgrade': return v.level ? vipUpgradeNotice(v.level, days) : null;
    case 'headwear': return name ? headwearNotice(name, days) : null;
    case 'gift': return name ? giftNotice(name, days) : null;
    case 'custom': return v.text?.trim() || null;
    default: return null;
  }
}

/** Sends an official notice from Voli Helper to the member's chat. */
export async function sendAdminNotice(authId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_send_notice', { p_recipient: authId, p_body: body });
  if (error) throw missing(error.code) ? { hint: 'notice_missing' } : error;
  return data as string;
}

// ---------- Log ----------
export type LogRow = {
  id: string; created_at: string; action: string; details: Record<string, unknown>;
  admin_name: string | null; admin_public_id: number | null; target_id: string | null; target_name: string | null; target_public_id: number | null;
};
export const LOG_PAGE = 50;
export type BanKind = 'ip' | 'network' | 'device';
export const BAN_KIND_LABELS: Record<BanKind, string> = { ip: 'IP', network: 'شبكة', device: 'جهاز' };
export type DeviceRow = {
  id: string; auth_id: string; device_id: string; ip: string | null; brand: string | null; model: string | null;
  os: string | null; network: string | null; carrier: string | null; first_seen: string; last_seen: string;
  display_name: string | null; public_id: number | null; ban: { kind: BanKind | 'account'; value: string; reason: string | null; code?: number } | null;
};
export type DeviceBanRow = { id: string; kind: BanKind; value: string; reason: string | null; created_at: string; by_name: string | null };
export const DEVICES_PAGE = 50;
/** Device functions come from sql/015_device_bans.sql. */
async function deviceRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw missing(error.code) ? { hint: 'devices_missing' } : error;
  return data as T;
}
export const getDevices = (q: string, page: number) =>
  deviceRpc<{ total: number; rows: DeviceRow[] }>('admin_list_devices', { p_q: q || null, p_limit: DEVICES_PAGE, p_offset: page * DEVICES_PAGE });
export const getDeviceBans = () => deviceRpc<DeviceBanRow[]>('admin_list_device_bans');
export const banDevice = (kind: BanKind, value: string, reason?: string) =>
  deviceRpc<string>('admin_device_ban', { p_kind: kind, p_value: value, p_reason: reason || null });
export const unbanDevice = (id: string) => deviceRpc<void>('admin_device_unban', { p_id: id });
export type UnifiedBanKind = BanKind | 'account';
export const ALL_BAN_LABELS: Record<UnifiedBanKind, string> = { ...BAN_KIND_LABELS, account: 'حساب' };
export type UnifiedBan = {
  id: string; code: number; kind: UnifiedBanKind; value: string; reason: string | null;
  created_at: string; until: string | null; revoked_at: string | null; active: boolean;
  by_name: string | null; affected_accounts: number;
};
export type LinkedAccount = {
  auth_id: string; public_id: number; special_id: string | null; display_name: string | null;
  devices: string[]; ban_codes: number[];
};
export type DeviceConnections = { member: LinkedAccount | null; devices: DeviceRow[]; accounts: LinkedAccount[] };
async function bansRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw missing(error.code) ? { hint: 'bans_missing' } : error;
  return data as T;
}
export const getBans = (q: string, kind: string, status: string, page: number) =>
  bansRpc<{ rows: UnifiedBan[]; total: number }>('admin_list_bans', {
    p_q: q.trim() || null, p_kind: kind === 'all' ? null : kind, p_status: status,
    p_limit: DEVICES_PAGE, p_offset: page * DEVICES_PAGE,
  });
export const createBan = (kind: UnifiedBanKind, value: string, days?: number, reason?: string) =>
  bansRpc<number>('admin_create_ban', { p_kind: kind, p_value: value.trim(), p_days: days ?? null, p_reason: reason?.trim() || null });
export const revokeBan = (id: string) => bansRpc<void>('admin_revoke_ban', { p_id: id });
export const getDeviceConnections = (member: string) =>
  bansRpc<DeviceConnections>('admin_device_connections', { p_member: member.trim() });
/** Default network range for an IP: the /24 block (IPv4) or /48 (IPv6). */
export function networkOf(ip: string): string {
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::/48';
  const p = ip.split('.'); return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0/24` : ip;
}

export const getLog = (page: number) => rpc<LogRow[]>('admin_actions_log', { p_limit: LOG_PAGE, p_offset: page * LOG_PAGE });

export const ACTION_LABELS: Record<string, string> = {
  coins: 'عملات', vip_grant: 'منح VIP', vip_revoke: 'سحب VIP', special_id: 'ID مميز', role: 'صلاحية',
  profile: 'تعديل بيانات', ban: 'حظر', unban: 'فك حظر', room_close: 'إغلاق غرفة', room_chat_clear: 'مسح محادثة غرفة',
  gift_update: 'تعديل هدية', gift_create: 'إضافة هدية', gift_art: 'صورة هدية', gift_video: 'فيديو هدية', vip_tier_update: 'سعر VIP', agency_update: 'تعديل وكالة', agency_remove_host: 'إزالة مضيف من وكالة',
  agency_approve: 'قبول وكالة', agency_reject: 'رفض وكالة', notice: 'إشعار رسمي',
  profile_violation: 'إزالة مخالفة', profile_lock: 'منع تغيير الاسم/الصورة',
  device_ban: 'حظر جهاز/شبكة', device_unban: 'فك حظر جهاز/شبكة',
};

/** One-line Arabic summary of what an action changed. */
export function describeAction(action: string, d: Record<string, unknown>): string {
  const n = (k: string) => Number(d[k] ?? 0).toLocaleString('en');
  switch (action) {
    case 'coins': return `${Number(d['amount']) > 0 ? '+' : ''}${n('amount')} (الرصيد ${n('balance')})${d['note'] ? ` — ${d['note']}` : ''}`;
    case 'vip_grant': return `VIP ${d['level']} ${d['days'] ? `لمدة ${d['days']} يوم` : 'دائم'}`;
    case 'vip_revoke': return `انتهى ${n('ended')}`;
    case 'special_id': return d['to'] ? `أصبح ${d['to']}` : 'أُزيل';
    case 'role': return `${d['role'] === 'admin' ? 'إدارة عليا' : 'مشرف'}: ${d['enabled'] ? 'أُضيف' : 'أُزيل'}`;
    case 'ban': return `${d['days'] ? `${d['days']} يوم` : 'نهائي'}${d['reason'] ? ` — ${d['reason']}` : ''}`;
    case 'gift_update': return `${d['key']}: ${n('price')}${d['active'] === false ? ' (مخفية)' : ''}`;
    case 'gift_create': return `${d['name']}: ${n('price')}${d['video'] ? ' (هدية فيديو)' : ''}`;
    case 'gift_art': return String(d['key'] ?? '');
    case 'gift_video': return `${d['key'] ?? ''}${d['removed'] ? ' — حُذف الفيديو' : ''}`;
    case 'vip_tier_update': return `VIP ${d['level']}: ${d['price'] == null ? 'غير معروض للبيع' : n('price')} / ${d['days']} يوم`;
    case 'agency_update': return `${d['name']}${d['commission'] != null ? ` — ${d['commission']}%` : ''}`;
    case 'agency_approve': return `كود ${d['code']}`;
    case 'agency_reject': return d['reason'] ? String(d['reason']) : '';
    case 'profile_violation': case 'profile_lock': return `${d['field'] === 'name' ? 'الاسم' : 'الصورة'}${d['forever'] ? ' — منع نهائي' : d['days'] ? ` — منع ${d['days']} يوم` : action === 'profile_lock' ? ' — رفع المنع' : ''}`;
    case 'notice': return String(d['body'] ?? '');
    case 'device_ban': case 'device_unban': return `${BAN_KIND_LABELS[String(d['kind']) as BanKind] ?? ''}: ${d['value'] ?? ''}`;
    default: return '';
  }
}

export const adminErrorMessage = (e: unknown) => {
  const err = e as { hint?: string; code?: string; message?: string } | null;
  if (err?.hint === 'bans_missing') return 'يجب تشغيل تحديث الحظر الموحد 016 في قاعدة بيانات فولي أولاً';
  if (err?.hint === 'devices_missing') return 'يجب تشغيل ملف الأجهزة 015 في قاعدة البيانات أولاً';
  if (err?.hint === 'moderation_missing') return 'يجب تشغيل ملف المخالفات 017 في قاعدة بيانات فولي أولاً';
  if (err?.hint === 'notice_missing') return 'يجب تشغيل ملف الإشعارات 014 في قاعدة البيانات أولاً';
  if (err?.hint === 'video_missing') return 'دوال هدايا الفيديو غير ظاهرة في قاعدة بيانات فولي: شغّل ملف 019 (المحدّث) مرة أخرى في محرر SQL، فهو يحدّث كاش الدوال فوراً';
  if (err?.hint === 'video_link_failed') return `أُضيفت الهدية والفيديو اترفع على Cloudinary، لكن تعذّر ربطه بالهدية (${(err as { reason?: string }).reason ?? 'خطأ غير معروف'}). استخدم «ربط فيديو موجود برابط» في سطر الهدية`;
  if (missing(err?.code)) return 'يجب تشغيل ملف الإدارة 009 في قاعدة البيانات أولاً';
  if (err?.hint === 'bad_art_file' || err?.hint === 'bad_video_file') return err.message ?? 'الملف غير صالح';
  if (err?.hint === 'upload_failed') {
    if ((err as { kind?: string }).kind === 'video') return /size|large/i.test(err.message ?? '')
      ? 'الفيديو أكبر من المسموح في حساب Cloudinary' : 'تعذّر رفع الفيديو، تحقق من الإنترنت وحاول مجدداً';
    return /bucket/i.test(err.message ?? '') ? 'يجب تشغيل ملف الهدايا 013 في قاعدة البيانات أولاً' : 'تعذّر رفع الصورة، حاول مجدداً';
  }
  return ({
    not_admin: 'هذا الإجراء متاح للإدارة العليا فقط',
    not_found: 'العنصر غير موجود',
    bad_amount: 'المبلغ غير صحيح',
    negative_balance: 'لا يمكن أن يقل الرصيد عن الصفر',
    bad_level: 'مستوى VIP غير صحيح',
    bad_kind: 'نوع الحظر غير صحيح',
    bad_value: 'قيمة الحظر مطلوبة',
    bad_address: 'عنوان IP أو نطاق الشبكة غير صحيح (مثال 185.12.0.0/16)',
    bad_days: 'عدد الأيام غير صحيح',
    signin_ban_failed: 'تعذّر تطبيق منع الدخول؛ لم يُحفظ الحظر. تحقق من صلاحيات وظائف الحظر في قاعدة بيانات فولي',
    bad_source: 'نوع المنح غير صحيح',
    bad_special_id: 'ID المميز أرقام فقط ولا يبدأ بصفر (حتى 10 أرقام)',
    special_id_taken: 'هذا الرقم مستخدم ID لعضو آخر',
    self: 'لا يمكنك تنفيذ هذا الإجراء على نفسك',
    target_admin: 'لا يمكن حظر أحد أعضاء الإدارة العليا',
    bad_name: 'الاسم غير صحيح',
    bad_notice: 'نص الإشعار مطلوب (حتى 1000 حرف)',
    bad_price: 'السعر غير صحيح',
    bad_art: 'صورة الهدية غير صحيحة، ارفع الصورة من اللوحة',
    bad_video: 'رابط الفيديو غير مقبول — لازم يكون فيديو مرفوع على Cloudinary الخاص بفولي',
    bad_percent: 'يجب أن تكون النسبة بين 0 و100',
    is_agent: 'لا يمكن إزالة الوكيل من وكالته',
    not_pending: 'تمت معالجة هذا الطلب مسبقاً',
    already_agent: 'صاحب الطلب وكيل بالفعل',
    in_agency: 'انضم صاحب الطلب إلى وكالة أخرى',
  } as Record<string, string>)[err?.hint ?? ''] ?? 'حدث خطأ، يُرجى المحاولة مرة أخرى';
};

export const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en'));
export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtDay = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('ar-EG', { dateStyle: 'medium' }) : '—');
