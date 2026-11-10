import { describe, expect, it } from "vitest";
import { giftArtProblem } from "@/lib/admin";

describe("gift pictures uploaded from the panel", () => {
  it("accepts PNG, WebP, GIF and JPG up to 5 MB", () => {
    for (const type of ["image/png", "image/webp", "image/gif", "image/jpeg"]) {
      expect(giftArtProblem({ type, size: 5 * 1024 * 1024 })).toBeNull();
    }
  });
  it("rejects other file types", () => {
    expect(giftArtProblem({ type: "image/svg+xml", size: 1000 })).not.toBeNull();
    expect(giftArtProblem({ type: "video/mp4", size: 1000 })).not.toBeNull();
  });
  it("rejects pictures bigger than 5 MB", () => {
    expect(giftArtProblem({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
  });
});
