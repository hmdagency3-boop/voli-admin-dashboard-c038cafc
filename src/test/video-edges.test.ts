import { describe, expect, it } from "vitest";
import { edgeAlpha, outputSize } from "@/lib/video-edges";

const W = 400, H = 300;
describe("soft video edges", () => {
  it("all four edges become fully transparent", () => {
    const s = { feather: 12, shape: "rect" as const };
    expect(edgeAlpha(0, H / 2, W, H, s)).toBe(0);
    expect(edgeAlpha(W, H / 2, W, H, s)).toBe(0);
    expect(edgeAlpha(W / 2, 0, W, H, s)).toBe(0);
    expect(edgeAlpha(W / 2, H, W, H, s)).toBe(0);
  });
  it("the middle of the video stays fully visible", () => {
    expect(edgeAlpha(W / 2, H / 2, W, H, { feather: 45, shape: "rect" })).toBe(1);
    expect(edgeAlpha(W / 2, H / 2, W, H, { feather: 45, shape: "oval" })).toBe(1);
  });
  it("fades gradually, not with a sharp cut", () => {
    const s = { feather: 20, shape: "rect" as const }; // band = 60 px
    const [a0, a1, a2] = [10, 30, 50].map((x) => edgeAlpha(x, H / 2, W, H, s)) as [number, number, number];
    expect(a0).toBeGreaterThan(0);
    expect(a0).toBeLessThan(a1);
    expect(a1).toBeLessThan(a2);
    expect(a2).toBeLessThan(1);
  });
  it("softness 0 leaves the video unchanged", () => {
    expect(edgeAlpha(0, 0, W, H, { feather: 0, shape: "rect" })).toBe(1);
  });
  it("keeps the shape and caps the long side at 1080 with even sizes", () => {
    expect(outputSize(1920, 1080)).toEqual({ width: 1080, height: 608 });
    expect(outputSize(720, 1280)).toEqual({ width: 608, height: 1080 });
    expect(outputSize(640, 360)).toEqual({ width: 640, height: 360 });
  });
});
