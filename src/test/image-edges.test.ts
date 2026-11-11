import { describe, expect, it } from "vitest";
import { isSquare, squareLayout } from "@/lib/image-edges";

describe("entrance picture is always square", () => {
  it("crop from the middle: a wide picture becomes a square of its height, centred", () => {
    expect(squareLayout(1200, 800, "cover")).toEqual({ size: 800, x: -200, y: 0, w: 1200, h: 800 });
  });
  it("whole picture: a tall picture fits inside the square with see-through sides", () => {
    expect(squareLayout(500, 1000, "contain")).toEqual({ size: 1000, x: 250, y: 0, w: 500, h: 1000 });
  });
  it("never larger than 1024 × 1024", () => {
    const l = squareLayout(4000, 3000, "cover");
    expect(l.size).toBe(1024);
    expect(l.h).toBe(1024);
  });
  it("only square pictures may skip editing", () => {
    expect(isSquare(512, 512)).toBe(true);
    expect(isSquare(512, 400)).toBe(false);
  });
});
