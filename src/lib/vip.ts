export const VIP_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
export function activeVipLevel(p: { vip_level?: number | null; vip_expires_at?: string | null } | null | undefined, now = Date.now()): number {
  const level = Number(p?.vip_level ?? 0);
  if (!Number.isInteger(level) || level < 1 || level > 8) return 0;
  if (p?.vip_expires_at && new Date(p.vip_expires_at).getTime() <= now) return 0;
  return level;
}
