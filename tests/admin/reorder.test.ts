import { describe, expect, it } from "vitest";
import { moveItem, nextPosition, parseDirection, sortByPosition } from "@/lib/admin/reorder";

const items = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
];

function apply(list: { id: string; position: number }[], updates: { id: string; position: number }[]) {
  const map = new Map(updates.map((u) => [u.id, u.position]));
  return sortByPosition(list.map((i) => ({ ...i, position: map.get(i.id) ?? i.position }))).map((i) => i.id);
}

describe("moveItem", () => {
  it("swaps an item with its neighbour", () => {
    expect(moveItem(items, "b", "up")).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
    expect(apply(items, moveItem(items, "b", "down"))).toEqual(["a", "c", "b"]);
  });

  it("does nothing at the edges or for unknown ids", () => {
    expect(moveItem(items, "a", "up")).toEqual([]);
    expect(moveItem(items, "c", "down")).toEqual([]);
    expect(moveItem(items, "x", "up")).toEqual([]);
    expect(moveItem([], "a", "down")).toEqual([]);
  });

  it("repairs duplicate positions using creation time as tie-breaker", () => {
    const messy = [
      { id: "late", position: 0, created_at: "2026-10-30T10:00:00Z" },
      { id: "early", position: 0, created_at: "2026-10-30T09:00:00Z" },
      { id: "last", position: 5, created_at: "2026-10-29T09:00:00Z" },
    ];
    expect(sortByPosition(messy).map((i) => i.id)).toEqual(["early", "late", "last"]);
    const updates = moveItem(messy, "last", "up");
    expect(apply(messy, updates)).toEqual(["early", "last", "late"]);
    // Everything ends up numbered 0..n-1.
    const final = new Map(messy.map((i) => [i.id, i.position]));
    for (const u of updates) final.set(u.id, u.position);
    expect([...final.values()].sort()).toEqual([0, 1, 2]);
  });

  it("does not mutate the input", () => {
    const copy = structuredClone(items);
    moveItem(items, "b", "up");
    expect(items).toEqual(copy);
  });
});

describe("nextPosition and parseDirection", () => {
  it("places new items last", () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 0 }, { position: 4 }, { position: 2 }])).toBe(5);
  });

  it("only accepts up/down", () => {
    expect(parseDirection("up")).toBe("up");
    expect(parseDirection("down")).toBe("down");
    expect(parseDirection("op")).toBeNull();
    expect(parseDirection(null)).toBeNull();
  });
});
