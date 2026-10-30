import { describe, expect, it } from "vitest";
import { copenhagenLocalToIso, isInFuture, isoToCopenhagenLocal } from "@/lib/announcements/datetime";

describe("copenhagenLocalToIso", () => {
  it("converts winter time (UTC+1)", () => {
    expect(copenhagenLocalToIso("2026-01-15T09:30")).toBe("2026-01-15T08:30:00.000Z");
    expect(copenhagenLocalToIso("2026-12-31T23:59")).toBe("2026-12-31T22:59:00.000Z");
  });

  it("converts summer time (UTC+2)", () => {
    expect(copenhagenLocalToIso("2026-07-01T12:00")).toBe("2026-07-01T10:00:00.000Z");
    expect(copenhagenLocalToIso("2026-10-24T18:00")).toBe("2026-10-24T16:00:00.000Z");
  });

  it("handles midnight across the date line", () => {
    expect(copenhagenLocalToIso("2026-06-01T00:30")).toBe("2026-05-31T22:30:00.000Z");
    expect(copenhagenLocalToIso("2026-03-01T00:00")).toBe("2026-02-28T23:00:00.000Z");
  });

  it("accepts seconds from browsers that send them", () => {
    expect(copenhagenLocalToIso("2026-01-15T09:30:15")).toBe("2026-01-15T08:30:15.000Z");
  });

  it("uses the right offset on both sides of the March change (29 March 2026)", () => {
    expect(copenhagenLocalToIso("2026-03-29T01:59")).toBe("2026-03-29T00:59:00.000Z");
    expect(copenhagenLocalToIso("2026-03-29T03:00")).toBe("2026-03-29T01:00:00.000Z");
  });

  it("moves a time in the skipped hour forward, like the clocks do", () => {
    // 02:30 does not exist on 29 March 2026 – it becomes 03:30 summer time.
    const iso = copenhagenLocalToIso("2026-03-29T02:30");
    expect(iso).toBe("2026-03-29T01:30:00.000Z");
    expect(isoToCopenhagenLocal(iso)).toBe("2026-03-29T03:30");
  });

  it("uses the first occurrence (summer time) for the repeated hour in October (25 October 2026)", () => {
    expect(copenhagenLocalToIso("2026-10-25T02:30")).toBe("2026-10-25T00:30:00.000Z");
    expect(copenhagenLocalToIso("2026-10-25T01:59")).toBe("2026-10-24T23:59:00.000Z");
    expect(copenhagenLocalToIso("2026-10-25T03:00")).toBe("2026-10-25T02:00:00.000Z");
  });

  it("rejects values that are not a real date and time", () => {
    for (const value of ["", "   ", "2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01T24:00", "2026-01-01T10:60", "30-10-2026 10:00", "2026-10-30", "abc", "0050-01-01T10:00"]) {
      expect(copenhagenLocalToIso(value)).toBeNull();
    }
    expect(copenhagenLocalToIso(null)).toBeNull();
    expect(copenhagenLocalToIso(undefined)).toBeNull();
  });

  it("accepts 29 February only in leap years", () => {
    expect(copenhagenLocalToIso("2028-02-29T12:00")).toBe("2028-02-29T11:00:00.000Z");
    expect(copenhagenLocalToIso("2027-02-29T12:00")).toBeNull();
  });
});

describe("isoToCopenhagenLocal", () => {
  it("formats in Copenhagen time for datetime-local inputs", () => {
    expect(isoToCopenhagenLocal("2026-01-15T08:30:00.000Z")).toBe("2026-01-15T09:30");
    expect(isoToCopenhagenLocal("2026-07-01T10:00:00Z")).toBe("2026-07-01T12:00");
    expect(isoToCopenhagenLocal("2026-05-31T22:30:00+00:00")).toBe("2026-06-01T00:30");
    expect(isoToCopenhagenLocal("2026-10-30T23:05:00.000Z")).toBe("2026-10-31T00:05");
  });

  it("shows both occurrences of the repeated October hour as 02:xx", () => {
    expect(isoToCopenhagenLocal("2026-10-25T00:30:00.000Z")).toBe("2026-10-25T02:30");
    expect(isoToCopenhagenLocal("2026-10-25T01:30:00.000Z")).toBe("2026-10-25T02:30");
  });

  it("returns an empty string for missing or invalid values", () => {
    expect(isoToCopenhagenLocal(null)).toBe("");
    expect(isoToCopenhagenLocal("")).toBe("");
    expect(isoToCopenhagenLocal("ikke en dato")).toBe("");
  });

  it("round-trips every hour of a whole year", () => {
    const start = Date.UTC(2026, 0, 1);
    for (let h = 0; h < 365 * 24; h += 1) {
      const iso = new Date(start + h * 3_600_000).toISOString();
      const local = isoToCopenhagenLocal(iso);
      const back = copenhagenLocalToIso(local);
      // Only the second occurrence of the repeated October hour maps to the first.
      if (back !== iso) {
        expect(local.startsWith("2026-10-25T02:")).toBe(true);
        expect(Date.parse(iso) - Date.parse(back ?? "")).toBe(3_600_000);
      }
    }
  });
});

describe("isInFuture", () => {
  const now = new Date("2026-10-30T12:00:00.000Z");
  it("compares against now", () => {
    expect(isInFuture("2026-10-30T12:00:01.000Z", now)).toBe(true);
    expect(isInFuture("2026-10-30T12:00:00.000Z", now)).toBe(false);
    expect(isInFuture("2026-10-29T12:00:00.000Z", now)).toBe(false);
    expect(isInFuture(null, now)).toBe(false);
    expect(isInFuture("forkert", now)).toBe(false);
  });
});
