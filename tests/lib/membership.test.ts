import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENTITLED_STATES,
  MEMBERSHIP_LABELS,
  MEMBERSHIP_STATES,
  MEMBERSHIP_TONES,
  isEntitledState,
  parseMembershipSummary,
  toMembershipState,
} from "@/lib/membership";

const schemaSql = readFileSync(join(process.cwd(), "supabase/migrations/20261030000001_schema.sql"), "utf8");

/** Body of a SQL function in the schema migration. */
function functionBody(name: string) {
  const start = schemaSql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const bodyStart = schemaSql.indexOf("$$", start);
  const bodyEnd = schemaSql.indexOf("$$", bodyStart + 2);
  return schemaSql.slice(bodyStart + 2, bodyEnd);
}

describe("membership states match the database", () => {
  it("every state _membership_state can return is known to the UI", () => {
    const returned = new Set([...functionBody("_membership_state").matchAll(/return '([a-z_]+)'/g)].map((m) => m[1]));
    expect(returned.size).toBeGreaterThan(5);
    for (const state of returned) expect(MEMBERSHIP_STATES).toContain(state);
  });

  it("the entitled states are the same as public.is_entitled()", () => {
    const match = functionBody("is_entitled").match(/in \(([^)]+)\)/);
    const sqlStates = (match?.[1] ?? "").split(",").map((s) => s.trim().replace(/'/g, ""));
    expect([...sqlStates].sort()).toEqual([...ENTITLED_STATES].sort());
  });
});

describe("toMembershipState", () => {
  it("passes known states through", () => {
    for (const state of MEMBERSHIP_STATES) expect(toMembershipState(state)).toBe(state);
  });

  it("falls back to none for anything else", () => {
    expect(toMembershipState("superuser")).toBe("none");
    expect(toMembershipState(null)).toBe("none");
    expect(toMembershipState(undefined)).toBe("none");
    expect(toMembershipState(42)).toBe("none");
  });
});

describe("isEntitledState", () => {
  it("grants access while active, canceling, in grace or admin", () => {
    expect(MEMBERSHIP_STATES.filter(isEntitledState)).toEqual(["active", "canceling", "past_due_grace", "admin"]);
  });
});

describe("labels and tones", () => {
  it("has a Danish label and a tone for every state", () => {
    for (const state of MEMBERSHIP_STATES) {
      expect(MEMBERSHIP_LABELS[state].length).toBeGreaterThan(2);
      expect(["success", "warning", "danger", "neutral"]).toContain(MEMBERSHIP_TONES[state]);
    }
    expect(MEMBERSHIP_LABELS.active).toBe("Aktiv");
    expect(MEMBERSHIP_LABELS.past_due).toMatch(/pause/);
  });
});

describe("parseMembershipSummary", () => {
  it("returns state none for missing or malformed data", () => {
    expect(parseMembershipSummary(null)).toEqual({ state: "none" });
    expect(parseMembershipSummary("active")).toEqual({ state: "none" });
    expect(parseMembershipSummary({ state: "hacked" }).state).toBe("none");
  });

  it("keeps the fields returned by membership_summary", () => {
    const summary = parseMembershipSummary({
      state: "canceling",
      status: "active",
      amount: 9900,
      cancel_at_period_end: true,
      access_until: "2026-11-30T10:00:00+00:00",
    });
    expect(summary).toEqual({
      state: "canceling",
      status: "active",
      amount: 9900,
      cancel_at_period_end: true,
      access_until: "2026-11-30T10:00:00+00:00",
    });
  });
});
