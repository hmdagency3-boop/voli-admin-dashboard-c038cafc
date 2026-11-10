import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { adminErrorMessage, describeAction } from "@/lib/admin";
import { daysLeft, getStoreItems, grantStoreItem } from "@/lib/store";

describe("store backpack days", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  it("shows whole days left, rounding a part day up like the app's '13 days'", () => {
    expect(daysLeft("2026-11-23T12:00:00Z", now)).toBe(13);
    expect(daysLeft("2026-11-23T11:00:00Z", now)).toBe(13);
    expect(daysLeft("2026-11-10T13:00:00Z", now)).toBe(1);
  });
  it("shows 0 once the item has ended", () => {
    expect(daysLeft("2026-11-10T12:00:00Z", now)).toBe(0);
    expect(daysLeft("2026-11-01T00:00:00Z", now)).toBe(0);
  });
});

describe("store panel calls", () => {
  it("says to run update 023 when the store functions are missing", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find admin_store_items" } });
    const e = await getStoreItems().catch((x) => x);
    expect(adminErrorMessage(e)).toBe("يجب تشغيل ملف المتجر 023 في قاعدة بيانات فولي أولاً");
  });
  it("a grant with no days sends null so the item's own duration is used", async () => {
    rpc.mockResolvedValueOnce({ data: "2026-12-10T00:00:00Z", error: null });
    await grantStoreItem("u1", "i1", null);
    expect(rpc).toHaveBeenLastCalledWith("admin_grant_store_item", { p_auth: "u1", p_item: "i1", p_days: null });
  });
  it("explains a purchase refused for low coins", () => {
    expect(adminErrorMessage({ hint: "not_enough_coins" })).toBe("الرصيد غير كافٍ");
  });
  it("describes store grants in the operations log", () => {
    expect(describeAction("store_grant", { kind: "ride", name: "Halloween Rush", days: 15 })).toBe("دخولية Halloween Rush — 15 يوم");
  });
});
