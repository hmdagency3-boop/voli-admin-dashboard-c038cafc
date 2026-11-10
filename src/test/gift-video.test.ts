import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  adminErrorMessage, cloudFileName, createGift, giftVideoProblem, giftVideoUrlOk, normalizeGiftVideoUrl, uploadStatusText,
} from "@/lib/admin";

describe("gift videos uploaded from the panel", () => {
  it("accepts MP4, WebM and MOV up to 50 MB", () => {
    for (const type of ["video/mp4", "video/webm", "video/quicktime"]) {
      expect(giftVideoProblem({ type, size: 50 * 1024 * 1024 })).toBeNull();
    }
  });
  it("rejects other file types", () => {
    expect(giftVideoProblem({ type: "image/gif", size: 1000 })).not.toBeNull();
    expect(giftVideoProblem({ type: "video/x-msvideo", size: 1000 })).not.toBeNull();
  });
  it("rejects videos bigger than 50 MB", () => {
    expect(giftVideoProblem({ type: "video/mp4", size: 50 * 1024 * 1024 + 1 })).not.toBeNull();
  });
  it("only accepts video links from Voli's Cloudinary cloud", () => {
    expect(giftVideoUrlOk("https://res.cloudinary.com/zsxxjkqg/video/upload/v1731170000/voli/gift-videos/rose.mp4")).toBe(true);
    expect(giftVideoUrlOk("https://res.cloudinary.com/othercloud/video/upload/v1/x.mp4")).toBe(false);
    expect(giftVideoUrlOk("https://res.cloudinary.com/zsxxjkqg/image/upload/v1/x.png")).toBe(false);
    expect(giftVideoUrlOk("https://example.com/video.mp4")).toBe(false);
  });
  it("accepts Cloudinary video links whose file name has spaces, special letters or %-encoding", () => {
    expect(giftVideoUrlOk("https://res.cloudinary.com/zsxxjkqg/video/upload/v1/voli/gift-videos/my%20rose%20(1).mp4")).toBe(true);
    expect(giftVideoUrlOk("https://res.cloudinary.com/zsxxjkqg/video/upload/v1/voli/gift-videos/وردة حمراء_1.mp4")).toBe(true);
    expect(giftVideoUrlOk('https://res.cloudinary.com/zsxxjkqg/video/upload/v1/a"b.mp4')).toBe(false);
  });
  it("saves raw spaces in a pasted link as %20", () => {
    expect(normalizeGiftVideoUrl("  https://res.cloudinary.com/zsxxjkqg/video/upload/v1/my rose.mp4 "))
      .toBe("https://res.cloudinary.com/zsxxjkqg/video/upload/v1/my%20rose.mp4");
  });
  it("names uploaded files with clean letters only", () => {
    expect(cloudFileName("My Rose (final).MP4", "gift-video", 123)).toBe("gift-video-my-rose-final-123.mp4");
    expect(cloudFileName("وردة.mov", "gift-video", 123)).toBe("gift-video-123.mov");
  });
});

describe("upload progress messages", () => {
  it("shows the exact percent while sending", () => {
    expect(uploadStatusText({ stage: "uploading", percent: 42, loaded: 21 * 1024 * 1024, total: 50 * 1024 * 1024 }))
      .toBe("جارٍ رفع الفيديو… 42% (21.0 من 50.0 ميجا)");
  });
  it("says the video is being processed once 100% is sent", () => {
    const text = "تم الإرسال (100%)، جارٍ المعالجة في السحابة وحفظ الهدية…";
    expect(uploadStatusText({ stage: "uploading", percent: 100, loaded: 1, total: 1 })).toBe(text);
    expect(uploadStatusText({ stage: "processing" })).toBe(text);
  });
});

/** Fake Cloudinary: every upload succeeds and returns a link in the right folder. */
class FakeXhr {
  status = 200; responseText = ""; upload: { onprogress?: (e: unknown) => void; onload?: () => void } = {};
  onload?: () => void; onerror?: () => void; private kind = "image";
  open(_m: string, url: string) { this.kind = url.includes("/video/") ? "video" : "image"; }
  send() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
    this.upload.onprogress?.({ lengthComputable: true, loaded: 10, total: 10 });
    this.upload.onload?.();
    this.responseText = JSON.stringify({ secure_url: `https://res.cloudinary.com/zsxxjkqg/${this.kind}/upload/v1/f.${this.kind === "video" ? "mp4" : "png"}` });
    queueMicrotask(() => this.onload?.());
  }
}

describe("adding a gift with a video", () => {
  beforeEach(() => { rpc.mockReset(); vi.stubGlobal("XMLHttpRequest", FakeXhr); });
  afterEach(() => vi.unstubAllGlobals());
  const files = () => ({
    file: new File(["x"], "rose.png", { type: "image/png" }),
    video: new File(["x"], "rose.mp4", { type: "video/mp4" }),
  });

  it("creates the gift with the 4-argument function, then attaches the video", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "admin_create_gift" ? "gNEW" : null, error: null }));
    const key = await createGift({ name: "Rose", price: 10, ...files() });
    expect(key).toBe("gNEW");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["admin_create_gift", "admin_set_gift_video"]);
    expect(Object.keys(rpc.mock.calls[0]?.[1]).sort()).toEqual(["p_art_url", "p_name", "p_price", "p_sort"]);
    expect(rpc.mock.calls[1]?.[1]).toEqual({ p_key: "gNEW", p_video_url: "https://res.cloudinary.com/zsxxjkqg/video/upload/v1/f.mp4" });
  });

  it("reports 'processing' after 100% and 'saving' before the gift is saved", async () => {
    rpc.mockResolvedValue({ data: "gNEW", error: null });
    const stages: string[] = [];
    await createGift({ name: "Rose", price: 10, ...files() }, (s) => stages.push(s.stage === "uploading" ? `${s.percent}` : s.stage));
    expect(stages.slice(-4)).toEqual(["50", "100", "processing", "saving"]);
  });

  it("says the gift was added but the video could not be attached when that step fails", async () => {
    rpc.mockImplementation(async (fn: string) => fn === "admin_create_gift"
      ? { data: "gNEW", error: null }
      : { data: null, error: { code: "PGRST202", message: "Could not find the function public.admin_set_gift_video" } });
    const err = await createGift({ name: "Rose", price: 10, ...files() }).catch((e) => e);
    expect(err.hint).toBe("video_link_failed");
    expect(err.key).toBe("gNEW");
    expect(adminErrorMessage(err)).toContain("أُضيفت الهدية");
  });
});
