import { describe, expect, it } from "vitest";
import {
  firstName,
  formatDKK,
  formatDate,
  formatDateTime,
  formatInterval,
  formatMessageTime,
  formatNumber,
  formatShortDate,
  formatTime,
  todayInCopenhagen,
} from "@/lib/format";

// Intl uses non-breaking spaces in some locales; compare with plain spaces.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("Danish dates in Europe/Copenhagen", () => {
  it("formats a date with the Danish month name", () => {
    expect(formatDate("2026-10-30T12:00:00Z")).toBe("30. oktober 2026");
    expect(formatDate(new Date("2026-05-01T08:00:00Z"))).toBe("1. maj 2026");
    expect(formatShortDate("2026-10-30T12:00:00Z")).toBe("30.10.2026");
  });

  it("uses the Copenhagen date, not the UTC date, around midnight", () => {
    // 23:30 UTC on New Year's Eve is already 00:30 on 1 January in Denmark.
    expect(formatDate("2026-12-31T23:30:00Z")).toBe("1. januar 2027");
    expect(formatShortDate("2026-06-30T22:30:00Z")).toBe("01.07.2026");
  });

  it("formats time with a dot and leading zero", () => {
    expect(formatTime("2026-01-15T08:05:00Z")).toBe("09.05");
    expect(formatDateTime("2026-10-30T13:05:00Z")).toBe("30. oktober 2026 kl. 14.05");
  });

  it("applies winter time (CET, UTC+1) and summer time (CEST, UTC+2)", () => {
    expect(formatTime("2026-01-15T10:00:00Z")).toBe("11.00");
    expect(formatTime("2026-07-15T10:00:00Z")).toBe("12.00");
  });

  it("handles the switch to summer time (29 March 2026, 02:00 → 03:00)", () => {
    expect(formatTime("2026-03-29T00:59:00Z")).toBe("01.59");
    expect(formatTime("2026-03-29T01:00:00Z")).toBe("03.00");
  });

  it("handles the switch to winter time (25 October 2026, 03:00 → 02:00)", () => {
    expect(formatTime("2026-10-25T00:30:00Z")).toBe("02.30");
    expect(formatTime("2026-10-25T01:30:00Z")).toBe("02.30");
    expect(formatDateTime("2026-10-25T01:30:00Z")).toBe("25. oktober 2026 kl. 02.30");
  });

  it("todayInCopenhagen returns YYYY-MM-DD for the Danish day", () => {
    expect(todayInCopenhagen(new Date("2026-10-30T12:00:00Z"))).toBe("2026-10-30");
    expect(todayInCopenhagen(new Date("2026-10-30T23:30:00Z"))).toBe("2026-10-31");
  });
});

describe("formatMessageTime", () => {
  const now = new Date("2026-10-30T12:00:00Z"); // 13.00 Danish time

  it("says 'i dag' for today", () => {
    expect(formatMessageTime("2026-10-30T07:00:00Z", now)).toBe("i dag kl. 08.00");
    // 23:30 UTC the day before is 00:30 today in Denmark.
    expect(formatMessageTime("2026-10-29T23:30:00Z", now)).toBe("i dag kl. 00.30");
  });

  it("says 'i går' for yesterday", () => {
    expect(formatMessageTime("2026-10-29T20:00:00Z", now)).toBe("i går kl. 21.00");
    expect(formatMessageTime("2026-10-28T23:30:00Z", now)).toBe("i går kl. 00.30");
  });

  it("shows day and month for older messages this year", () => {
    expect(formatMessageTime("2026-10-03T08:00:00Z", now)).toBe("3. oktober kl. 10.00");
  });

  it("adds the year for messages from an earlier year", () => {
    expect(formatMessageTime("2025-12-24T10:00:00Z", now)).toBe("24. december 2025 kl. 11.00");
  });

  // Calendar-day edge cases around daylight saving time and New Year.
  it("says 'i går' at 23.30 on the day winter time starts (25 October has 25 hours)", () => {
    expect(formatMessageTime("2026-10-24T08:00:00Z", new Date("2026-10-25T22:30:00Z"))).toBe("i går kl. 10.00");
  });
  it("says 'i går' at 00.30 on the day after summer time starts (29 March has 23 hours)", () => {
    expect(formatMessageTime("2026-03-29T08:00:00Z", new Date("2026-03-29T22:30:00Z"))).toBe("i går kl. 10.00");
  });
  it("adds the year during the first hour of 1 January (Copenhagen year, not UTC year)", () => {
    expect(formatMessageTime("2026-12-15T09:00:00Z", new Date("2026-12-31T23:30:00Z"))).toBe("15. december 2026 kl. 10.00");
  });
});

describe("money and numbers", () => {
  it("formats øre as Danish kroner", () => {
    expect(plain(formatDKK(29900))).toBe("299,00 kr.");
    expect(plain(formatDKK(9950))).toBe("99,50 kr.");
    expect(plain(formatDKK(123456700))).toBe("1.234.567,00 kr.");
    expect(plain(formatDKK(0))).toBe("0,00 kr.");
  });

  it("says when no price is set", () => {
    expect(formatDKK(null)).toBe("Pris ikke fastsat");
    expect(formatDKK(undefined)).toBe("Pris ikke fastsat");
  });

  it("formats numbers with Danish separators", () => {
    expect(plain(formatNumber(1234567.5))).toBe("1.234.567,5");
  });

  it("describes billing intervals in Danish", () => {
    expect(formatInterval("month")).toBe("pr. måned");
    expect(formatInterval("quarter")).toBe("pr. kvartal");
    expect(formatInterval("year")).toBe("pr. år");
    expect(formatInterval("one_time")).toBe("engangsbetaling");
    expect(formatInterval(null)).toBe("");
    expect(formatInterval("weekly")).toBe("weekly");
  });
});

describe("firstName", () => {
  it("returns the first word of a name", () => {
    expect(firstName("  Jens  Peter Hansen ")).toBe("Jens");
    expect(firstName("Søren")).toBe("Søren");
    expect(firstName("")).toBe("");
    expect(firstName(null)).toBe("");
  });
});
