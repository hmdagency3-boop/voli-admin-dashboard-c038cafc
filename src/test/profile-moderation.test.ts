import { describe, expect, it } from "vitest";
import { violationName, violationNotice } from "@/lib/admin";

describe("rule-breaking name / picture", () => {
  it("removed name becomes the app name plus the member ID", () => {
    expect(violationName(545545)).toBe("voli545545");
  });
  it("warning says what was removed and for how long it is locked", () => {
    expect(violationNotice("name", null, false)).toBe("Warning: your name violates Voli community rules and has been removed.");
    expect(violationNotice("avatar", 7, false)).toBe("Warning: your profile picture violates Voli community rules and has been removed. You cannot change it for 7 days.");
    expect(violationNotice("name", null, true)).toBe("Warning: your name violates Voli community rules and has been removed. You can no longer change it.");
  });
});
