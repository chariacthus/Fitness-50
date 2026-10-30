import { describe, expect, it } from "vitest";
import { excerpt, exerciseFacts, groupMeals, safeInternalLink } from "@/lib/training/display";

describe("exerciseFacts", () => {
  it("shows sets × reps, duration and rest", () => {
    expect(exerciseFacts({ sets: 3, reps: "10", duration: null, rest: "60 sek." })).toEqual([
      { label: "Sæt × gentagelser", value: "3 × 10" },
      { label: "Pause", value: "60 sek." },
    ]);
  });

  it("handles sets or reps on their own and leaves out empty values", () => {
    expect(exerciseFacts({ sets: 2, reps: " ", duration: "30 sek.", rest: null })).toEqual([
      { label: "Sæt", value: "2" },
      { label: "Varighed", value: "30 sek." },
    ]);
    expect(exerciseFacts({ sets: null, reps: "8 pr. side", duration: null, rest: null })).toEqual([
      { label: "Gentagelser", value: "8 pr. side" },
    ]);
    expect(exerciseFacts({ sets: null, reps: null, duration: null, rest: null })).toEqual([]);
  });
});

describe("groupMeals", () => {
  it("groups by meal type in the order of the day with Danish labels", () => {
    const groups = groupMeals([
      { id: "1", meal_type: "aftensmad", position: 0 },
      { id: "2", meal_type: "morgenmad", position: 1 },
      { id: "3", meal_type: "morgenmad", position: 0 },
      { id: "4", meal_type: "ukendt", position: 0 },
    ]);
    expect(groups.map((g) => [g.label, g.meals.map((m) => m.id)])).toEqual([
      ["Morgenmad", ["3", "2"]],
      ["Aftensmad", ["1"]],
      ["Andre måltider", ["4"]],
    ]);
  });
});

describe("excerpt and links", () => {
  it("shortens long text at a word boundary", () => {
    expect(excerpt("Kort tekst")).toBe("Kort tekst");
    expect(excerpt("  flere   linjer\n\nher ")).toBe("flere linjer her");
    const long = "Husk at drikke vand under træningen, og tag den med ro i starten af ugen.";
    const short = excerpt(long, 40);
    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(41);
    expect(long.startsWith(short.slice(0, -1))).toBe(true);
  });

  it("only allows internal links", () => {
    expect(safeInternalLink("/opslag/123")).toBe("/opslag/123");
    expect(safeInternalLink("//evil.example")).toBeNull();
    expect(safeInternalLink("https://evil.example")).toBeNull();
    expect(safeInternalLink(null)).toBeNull();
  });
});
