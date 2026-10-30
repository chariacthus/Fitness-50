import { describe, expect, it } from "vitest";
import { emailOutcomeCode, emailOutcomeText, parseEmailOutcomeCode } from "@/lib/admin/email-outcome";
import { failForm, firstParam, isHttpsUrl, isUuid, nullIfEmpty, readText, readValues } from "@/lib/admin/forms";
import { planFilter, planStatus } from "@/lib/admin/labels";
import {
  MEMBER_FILTERS,
  awaitsTrainingPlan,
  filterMembers,
  genitive,
  isEntitledMember,
  memberDisplayName,
  memberFilter,
  normalizeMemberRows,
  normalizeSearch,
} from "@/lib/admin/members";
import { adminAnswers } from "@/lib/admin/onboarding";
import { OVERVIEW_FIGURES, OVERVIEW_KEYS, parseOverviewStats } from "@/lib/admin/overview";

const raw = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "00000000-0000-4000-8000-000000000002",
  full_name: " Jens Hansen ",
  email: "jens@example.dk",
  avatar_path: null,
  created_at: "2026-10-01T10:00:00Z",
  membership_state: "active",
  onboarding_status: "submitted",
  has_published_plan: false,
  has_nutrition: false,
  community_suspended: false,
  is_admin: false,
  ...over,
});

describe("member list helpers", () => {
  it("normalises rows from admin_member_list", () => {
    const rows = normalizeMemberRows([raw(), raw({ id: null }), raw({ id: "x", membership_state: "noget andet", full_name: null })] as never);
    expect(rows).toHaveLength(2);
    expect(rows[0].full_name).toBe("Jens Hansen");
    expect(rows[1].membership_state).toBe("none");
    expect(rows[1].full_name).toBe("");
  });

  it("filters by membership state", () => {
    const rows = normalizeMemberRows([
      raw({ id: "1", membership_state: "active" }),
      raw({ id: "2", membership_state: "canceling" }),
      raw({ id: "3", membership_state: "past_due_grace" }),
      raw({ id: "4", membership_state: "past_due" }),
      raw({ id: "5", membership_state: "admin", is_admin: true }),
    ] as never);
    expect(filterMembers(rows, memberFilter("")).map((r) => r.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(filterMembers(rows, memberFilter("betaling")).map((r) => r.id)).toEqual(["3", "4"]);
    expect(filterMembers(rows, memberFilter("opsagte")).map((r) => r.id)).toEqual(["2"]);
    expect(memberFilter("ukendt")).toBe(MEMBER_FILTERS[0]);
  });

  it("matches the overview rule for members waiting for a plan", () => {
    const [waiting, hasPlan, noForm, lapsed, admin] = normalizeMemberRows([
      raw({ id: "1" }),
      raw({ id: "2", has_published_plan: true }),
      raw({ id: "3", onboarding_status: "in_progress" }),
      raw({ id: "4", membership_state: "past_due" }),
      raw({ id: "5", membership_state: "admin", is_admin: true }),
    ] as never);
    expect([waiting, hasPlan, noForm, lapsed, admin].map(awaitsTrainingPlan)).toEqual([true, false, false, false, false]);
    expect(isEntitledMember(admin)).toBe(false);
    expect(isEntitledMember(raw({ membership_state: "past_due_grace" }) as never)).toBe(true);
  });

  it("cleans search text and builds names", () => {
    expect(normalizeSearch("  jens%_ \\hansen ")).toBe("jens hansen");
    expect(normalizeSearch("x".repeat(200))).toHaveLength(100);
    expect(memberDisplayName("  ")).toBe("Medlem uden navn");
    expect(memberDisplayName(null, "Medlemmet")).toBe("Medlemmet");
    expect(genitive("Jens")).toBe("Jens'");
    expect(genitive("Ole Hansen")).toBe("Ole Hansens");
  });
});

describe("overview stats", () => {
  it("reads every figure as a non-negative integer", () => {
    const stats = parseOverviewStats({ total_members: 12, active: "9", canceling: null, past_due: -3, open_reports: 2.7 });
    expect(stats.total_members).toBe(12);
    expect(stats.active).toBe(9);
    expect(stats.canceling).toBe(0);
    expect(stats.past_due).toBe(0);
    expect(stats.open_reports).toBe(2);
    expect(Object.keys(stats).sort()).toEqual([...OVERVIEW_KEYS].sort());
    expect(parseOverviewStats(null).total_members).toBe(0);
  });

  it("links every figure to an admin page", () => {
    expect(OVERVIEW_FIGURES).toHaveLength(10);
    for (const f of OVERVIEW_FIGURES) expect(f.href.startsWith("/admin")).toBe(true);
  });
});

describe("onboarding answers for the admin", () => {
  const answers = { full_name: "Jens", goals: ["styrke"], has_limitations: "ja", nutrition_interest: "ja" };

  it("keeps health information out of the ordinary sections", () => {
    const result = adminAnswers({ answers, health_info: "Ondt i knæet", health_consent: true, nutrition_answers: null });
    const allValues = result.sections.flatMap((s) => s.items.map((i) => `${i.label}: ${i.value}`)).join("\n");
    expect(allValues).not.toContain("Ondt i knæet");
    expect(allValues).not.toContain("Samtykke");
    expect(result.sensitive).toBe("Ondt i knæet");
  });

  it("never returns health information without consent", () => {
    const result = adminAnswers({ answers, health_info: "Ondt i knæet", health_consent: false, nutrition_answers: null });
    expect(result.sensitive).toBeNull();
    expect(result.consentGiven).toBe(false);
  });

  it("adds the nutrition questionnaire when it has been answered", () => {
    const without = adminAnswers({ answers, health_info: null, health_consent: false, nutrition_answers: {} });
    const withNutrition = adminAnswers({ answers, health_info: null, health_consent: false, nutrition_answers: { meals_per_day: "3", diet: ["alt"] } });
    expect(withNutrition.sections.length).toBe(without.sections.length + 1);
    expect(withNutrition.sections.at(-1)?.title).toMatch(/Kostplan/);
  });
});

describe("e-mail outcome", () => {
  it("round-trips the URL code", () => {
    for (const outcome of [{ sent: true }, { sent: false, reason: "disabled" }, { sent: false, reason: "opted_out" }] as const) {
      expect(parseEmailOutcomeCode(emailOutcomeCode(outcome))).toEqual(outcome.sent ? { sent: true } : outcome);
    }
    expect(parseEmailOutcomeCode("hacked")).toBeNull();
  });

  it("explains the real outcome in Danish", () => {
    expect(emailOutcomeText({ sent: true }, "Jens")).toBe("Der er sendt en e-mail til Jens.");
    expect(emailOutcomeText({ sent: false, reason: "not_configured" }, "Jens")).toMatch(/ikke er sat op/);
    expect(emailOutcomeText({ sent: false, reason: "opted_out" }, "Jens")).toMatch(/Jens har fravalgt/);
    expect(emailOutcomeText({ sent: false, reason: "failed" }, "Jens")).toBe("E-mailen kunne ikke sendes.");
  });
});

describe("form helpers and labels", () => {
  it("reads and echoes form values", () => {
    const fd = new FormData();
    fd.set("title", "Plan");
    fd.set("file", new Blob(["x"]));
    expect(readText(fd, "title")).toBe("Plan");
    expect(readText(fd, "file")).toBe("");
    expect(readText(fd, "missing")).toBe("");
    expect(readValues(fd, ["title", "goal"])).toEqual({ title: "Plan", goal: "" });
    expect(failForm("Fejl", { title: "x" }, { title: "Plan" })).toEqual({ ok: false, error: "Fejl", fieldErrors: { title: "x" }, values: { title: "Plan" } });
  });

  it("validates ids, links and empty text", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000002")).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
    expect(isHttpsUrl("https://vimeo.com/1")).toBe(true);
    expect(isHttpsUrl("http://vimeo.com/1")).toBe(false);
    expect(nullIfEmpty("  ")).toBeNull();
    expect(nullIfEmpty(" a ")).toBe("a");
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBe("");
  });

  it("has Danish plan status texts and filters", () => {
    expect(planStatus("draft").banner).toBe("Kladde – ikke synlig for medlemmet");
    expect(planStatus("published").banner).toBe("Udgivet – synlig for medlemmet");
    expect(planStatus("archived").banner).toBe("Arkiveret");
    expect(planFilter("udgivne").status).toBe("published");
    expect(planFilter("noget").status).toBeNull();
  });
});
