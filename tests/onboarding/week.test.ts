import { describe, expect, it } from "vitest";
import {
  addDays,
  copenhagenWeek,
  countWorkouts,
  formatDay,
  isInWeek,
  nextSuggestedSession,
  sortSessions,
  summarizeCompletions,
} from "@/lib/training/week";

describe("copenhagenWeek (Monday–Sunday, Europe/Copenhagen)", () => {
  it("returns the week around an ordinary weekday", () => {
    // Friday 30 October 2026, 11:00 in Copenhagen.
    expect(copenhagenWeek(new Date("2026-10-30T10:00:00Z"))).toEqual({ start: "2026-10-26", end: "2026-11-01" });
  });

  it("still counts Sunday 23:30 Copenhagen time as the same week (although UTC is 22:30)", () => {
    expect(copenhagenWeek(new Date("2026-11-01T22:30:00Z"))).toEqual({ start: "2026-10-26", end: "2026-11-01" });
  });

  it("starts a new week at midnight Monday Copenhagen time, while it is still Sunday in UTC", () => {
    expect(copenhagenWeek(new Date("2026-11-01T23:15:00Z"))).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });

  it("handles summer time (UTC+2)", () => {
    expect(copenhagenWeek(new Date("2026-06-28T21:30:00Z"))).toEqual({ start: "2026-06-22", end: "2026-06-28" });
    expect(copenhagenWeek(new Date("2026-06-28T22:30:00Z"))).toEqual({ start: "2026-06-29", end: "2026-07-05" });
  });

  it("handles the night daylight saving time ends (25 October 2026)", () => {
    expect(copenhagenWeek(new Date("2026-10-25T00:30:00Z"))).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(copenhagenWeek(new Date("2026-10-25T23:30:00Z"))).toEqual({ start: "2026-10-26", end: "2026-11-01" });
  });

  it("spans the turn of the year", () => {
    expect(copenhagenWeek(new Date("2026-12-31T12:00:00Z"))).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(copenhagenWeek(new Date("2027-01-03T22:59:00Z"))).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(copenhagenWeek(new Date("2027-01-03T23:00:00Z"))).toEqual({ start: "2027-01-04", end: "2027-01-10" });
  });

  it("addDays and isInWeek work on calendar dates", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    const week = { start: "2026-10-26", end: "2026-11-01" };
    expect(isInWeek("2026-10-26", week)).toBe(true);
    expect(isInWeek("2026-11-01", week)).toBe(true);
    expect(isInWeek("2026-10-25", week)).toBe(false);
    expect(isInWeek("2026-11-02", week)).toBe(false);
  });

  it("formats a calendar date in Danish without shifting the day", () => {
    expect(formatDay("2026-10-28")).toBe("28. oktober 2026");
    expect(formatDay("2026-01-01")).toBe("1. januar 2026");
  });
});

describe("nextSuggestedSession", () => {
  const week = { start: "2026-10-26", end: "2026-11-01" };
  const sessions = [
    { id: "c", title: "Træning C", position: 2, created_at: "2026-10-01T10:00:00Z" },
    { id: "a", title: "Træning A", position: 0, created_at: "2026-10-01T10:00:00Z" },
    { id: "b", title: "Træning B", position: 1, created_at: "2026-10-01T10:00:00Z" },
  ];

  it("suggests the first session in plan order when nothing is done", () => {
    expect(nextSuggestedSession(sessions, [], week)?.id).toBe("a");
  });

  it("skips sessions completed this week", () => {
    const done = [
      { session_id: "a", completed_on: "2026-10-26" },
      { session_id: "c", completed_on: "2026-10-27" },
    ];
    expect(nextSuggestedSession(sessions, done, week)?.id).toBe("b");
  });

  it("ignores completions from last week and next week", () => {
    const done = [
      { session_id: "a", completed_on: "2026-10-25" },
      { session_id: "b", completed_on: "2026-11-02" },
    ];
    expect(nextSuggestedSession(sessions, done, week)?.id).toBe("a");
  });

  it("returns null when every session is done this week", () => {
    const done = ["a", "b", "c"].map((id) => ({ session_id: id, completed_on: "2026-10-28" }));
    expect(nextSuggestedSession(sessions, done, week)).toBeNull();
  });

  it("returns null for a plan without sessions", () => {
    expect(nextSuggestedSession([], [], week)).toBeNull();
  });

  it("orders equal positions by creation time", () => {
    const tied = [
      { id: "later", position: 0, created_at: "2026-10-02T10:00:00Z" },
      { id: "earlier", position: 0, created_at: "2026-10-01T10:00:00Z" },
    ];
    expect(sortSessions(tied).map((s) => s.id)).toEqual(["earlier", "later"]);
    expect(nextSuggestedSession(tied, [], week)?.id).toBe("earlier");
  });
});

describe("summarizeCompletions", () => {
  const week = { start: "2026-10-26", end: "2026-11-01" };
  it("counts this week, today and the latest date per session", () => {
    const rows = [
      { session_id: "a", completed_on: "2026-10-30" },
      { session_id: "b", completed_on: "2026-10-27" },
      { session_id: "a", completed_on: "2026-10-26" },
      { session_id: "b", completed_on: "2026-10-20" },
    ];
    const s = summarizeCompletions(rows, week, "2026-10-30");
    expect(s.thisWeek).toBe(3);
    expect(s.lastCompletedOn).toBe("2026-10-30");
    expect([...s.completedToday]).toEqual(["a"]);
    expect(s.lastBySession.get("a")).toBe("2026-10-30");
    expect(s.lastBySession.get("b")).toBe("2026-10-27");
  });

  it("is empty without completions", () => {
    const s = summarizeCompletions([], week, "2026-10-30");
    expect(s.thisWeek).toBe(0);
    expect(s.lastCompletedOn).toBeNull();
    expect(s.completedToday.size).toBe(0);
  });

  it("uses correct Danish singular/plural", () => {
    expect(countWorkouts(0)).toBe("0 træninger");
    expect(countWorkouts(1)).toBe("1 træning");
    expect(countWorkouts(4)).toBe("4 træninger");
  });
});
