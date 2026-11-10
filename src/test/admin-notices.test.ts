import { describe, expect, it } from "vitest";
import {
  buildNotice, coinsNotice, giftNotice, headwearNotice, roleNotice, specialIdNotice, vipGrantNotices, vipHeadwearNotice, vipUpgradeNotice,
} from "@/lib/admin";

describe("official congratulation messages from Voli Helper", () => {
  it("matches the owner's samples exactly", () => {
    expect(roleNotice("admin")).toBe("Congratulations on receiving the official gift of Headwear Super Admin.");
    expect(vipUpgradeNotice(5, 15)).toBe("Congratulations on your upgrade to VIP5 ,valid for 15 days.");
    expect(vipHeadwearNotice(5)).toBe("Congratulations on receiving the official gift of Headwear vip 5.");
  });

  it("VIP for some days sends the upgrade then the headwear, both with the days", () => {
    expect(vipGrantNotices(5, 15)).toEqual([
      "Congratulations on your upgrade to VIP5 ,valid for 15 days.",
      "Congratulations on receiving the official gift of Headwear vip 5 ,valid for 15 days.",
    ]);
  });

  it("permanent VIP has no days", () => {
    expect(vipGrantNotices(3, null)).toEqual([
      "Congratulations on your upgrade to VIP3.",
      "Congratulations on receiving the official gift of Headwear vip 3.",
    ]);
  });

  it("moderator role gets the Moderator headwear", () => {
    expect(roleNotice("moderator")).toBe("Congratulations on receiving the official gift of Headwear Moderator.");
  });

  it("added coins get a message, removed coins do not", () => {
    expect(coinsNotice(5000)).toBe("Congratulations on receiving the official gift of 5000 Coins.");
    expect(coinsNotice(-100)).toBeNull();
  });

  it("special ID message", () => {
    expect(specialIdNotice("777")).toBe("Congratulations on receiving your Special ID: 777.");
  });

  it("custom headwear and gifts, with or without days", () => {
    expect(headwearNotice("Dragon", 7)).toBe("Congratulations on receiving the official gift of Headwear Dragon ,valid for 7 days.");
    expect(giftNotice("Golden Car")).toBe("Congratulations on receiving the official gift of Golden Car.");
  });

  it("hand-sent notice templates", () => {
    expect(buildNotice({ template: "super_admin" })).toBe(roleNotice("admin"));
    expect(buildNotice({ template: "vip_headwear", level: 8, days: 30 })).toBe(
      "Congratulations on receiving the official gift of Headwear vip 8 ,valid for 30 days.");
    expect(buildNotice({ template: "vip_upgrade", level: 2 })).toBe("Congratulations on your upgrade to VIP2.");
    expect(buildNotice({ template: "custom", text: "  Welcome to Voli  " })).toBe("Welcome to Voli");
    expect(buildNotice({ template: "headwear", name: "  " })).toBeNull();
    expect(buildNotice({ template: "vip_upgrade" })).toBeNull();
  });
});
