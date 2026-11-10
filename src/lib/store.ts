import { supabase } from '@/lib/supabase';
import { cloudinaryUpload, giftArtProblem, giftVideoProblem, giftVideoUrlOk, isMissingFunction, normalizeGiftVideoUrl, type UploadProgress, type UploadStatus } from '@/lib/admin';

/**
 * The Store (المتجر) and members' Backpack (الحقيبة). Every call goes to a role-checked database
 * function in sql/023_store.sql; the limits below mirror those checks for the forms only.
 */
export type StoreKind = 'frame' | 'ride';
export type StoreStyle = 'simple' | 'romantic' | 'luxury' | 'theme';
export const STORE_KINDS: { value: StoreKind; label: string; hint: string }[] = [
  { value: 'frame', label: 'الإطارات', hint: 'Headwear — إطار حول صورة العضو' },
  { value: 'ride', label: 'الدخوليات', hint: 'Ride — تظهر عند دخول العضو الغرفة' },
];
export const KIND_LABEL: Record<StoreKind, string> = { frame: 'إطار', ride: 'دخولية' };
export const STORE_STYLES: { value: StoreStyle; label: string }[] = [
  { value: 'simple', label: 'Simple — بسيط' },
  { value: 'romantic', label: 'Romantic — رومانسي' },
  { value: 'luxury', label: 'Luxury — فاخر' },
  { value: 'theme', label: 'Theme — مناسبات' },
];
export const STORE_DAYS_MAX = 3650;
export const STORE_ART_FOLDER = 'voli/store';
export const STORE_VIDEO_FOLDER = 'voli/store-videos';

export type StoreItem = {
  id: string; kind: StoreKind; style: StoreStyle; name: string; price: number; days: number;
  art_url: string; video_url: string | null; sort: number; active: boolean; created_at: string;
  sold_count: number; sold_value: number; owners_now: number;
};
export type BackpackItem = { item_id: string; kind: StoreKind; name: string; art_url: string; expires_at: string; equipped: boolean };

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isMissingFunction(error, fn) || error.code === '42P01') throw Object.assign(new Error('store_missing'), { hint: 'store_missing', cause: error });
    throw error;
  }
  return data as T;
}

export async function getStoreItems(): Promise<StoreItem[]> {
  const rows = await call<StoreItem[]>('admin_store_items');
  return (rows ?? []).map((r) => ({
    ...r, price: Number(r.price), days: Number(r.days), sort: Number(r.sort), video_url: r.video_url ?? null,
    sold_count: Number(r.sold_count), sold_value: Number(r.sold_value), owners_now: Number(r.owners_now),
  }));
}

/** Whole days left, as the app's backpack shows them ("13 days"); 0 once ended. */
export function daysLeft(expiresAt: string, now = Date.now()): number {
  const ms = new Date(expiresAt).getTime() - now;
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

const uploadArt = (file: File, onProgress?: UploadProgress) => {
  const problem = giftArtProblem(file);
  if (problem) throw Object.assign(new Error(problem), { hint: 'bad_art_file' });
  return cloudinaryUpload(file, 'image', STORE_ART_FOLDER, onProgress, 'store');
};
const uploadVideo = async (file: File, onProgress?: UploadProgress) => {
  const problem = giftVideoProblem(file);
  if (problem) throw Object.assign(new Error(problem), { hint: 'bad_video_file' });
  return normalizeGiftVideoUrl(await cloudinaryUpload(file, 'video', STORE_VIDEO_FOLDER, onProgress, 'store-video'));
};

/** Text for each upload stage of a store item. */
export function storeUploadText(s: UploadStatus): string {
  if (s.stage === 'uploading' && s.percent < 100) return `جارٍ رفع ${s.what ?? 'الملف'}… ${s.percent}%`;
  if (s.stage === 'saving') return 'جارٍ حفظ المنتج في فولي…';
  return 'تم الإرسال، جارٍ المعالجة في السحابة…';
}

export async function createStoreItem(v: {
  kind: StoreKind; style: StoreStyle; name: string; price: number; days: number; sort?: number | null; art: File; video?: File | null;
}, onProgress?: UploadProgress): Promise<string> {
  const art = await uploadArt(v.art, onProgress);
  const video = v.video ? await uploadVideo(v.video, onProgress) : null;
  onProgress?.({ stage: 'saving' });
  return call<string>('admin_create_store_item', {
    p_kind: v.kind, p_style: v.style, p_name: v.name.trim(), p_price: v.price, p_days: v.days,
    p_sort: v.sort ?? null, p_art_url: art, p_video_url: video,
  });
}
export const updateStoreItem = (r: Pick<StoreItem, 'id' | 'name' | 'style' | 'price' | 'days' | 'sort' | 'active'>) =>
  call<void>('admin_update_store_item', {
    p_id: r.id, p_name: r.name, p_style: r.style, p_price: r.price, p_days: r.days, p_sort: r.sort ?? null, p_active: r.active,
  });
export async function changeStoreArt(id: string, file: File) {
  return call<void>('admin_set_store_item_art', { p_id: id, p_art_url: await uploadArt(file) });
}
export async function changeStoreVideo(id: string, file: File, onProgress?: UploadProgress) {
  const url = await uploadVideo(file, onProgress);
  onProgress?.({ stage: 'saving' });
  return call<void>('admin_set_store_item_video', { p_id: id, p_video_url: url });
}
export async function setStoreVideoUrl(id: string, url: string) {
  const u = normalizeGiftVideoUrl(url);
  if (!giftVideoUrlOk(u)) throw Object.assign(new Error('bad_video'), { hint: 'bad_video' });
  return call<void>('admin_set_store_item_video', { p_id: id, p_video_url: u });
}
export const removeStoreVideo = (id: string) => call<void>('admin_set_store_item_video', { p_id: id, p_video_url: null });

export async function getBackpack(authId: string): Promise<BackpackItem[]> {
  return (await call<BackpackItem[]>('admin_member_items', { p_auth: authId })) ?? [];
}
/** Days null = the item's own duration. */
export const grantStoreItem = (authId: string, itemId: string, days: number | null) =>
  call<string>('admin_grant_store_item', { p_auth: authId, p_item: itemId, p_days: days });
export const revokeStoreItem = (authId: string, itemId: string) =>
  call<void>('admin_revoke_store_item', { p_auth: authId, p_item: itemId });
