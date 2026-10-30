// Pure helpers for ordering training days, exercises and meals.

export type Positioned = { id: string; position: number; created_at?: string | null };
export type MoveDirection = "up" | "down";

/** Plan order: position, then creation time, then id (stable even with duplicate positions). */
export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => a.position - b.position || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id),
  );
}

/**
 * Moves one item a step up or down and returns the position updates needed.
 * Positions are renumbered 0..n-1 in the new order, so duplicates or gaps
 * left by older data are repaired at the same time. Only rows whose position
 * actually changes are returned; an empty list means "nothing to do".
 */
export function moveItem(items: readonly Positioned[], id: string, direction: MoveDirection): { id: string; position: number }[] {
  const ordered = sortByPosition(items);
  const index = ordered.findIndex((item) => item.id === id);
  if (index < 0) return [];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return [];
  const next = [...ordered];
  [next[index], next[target]] = [next[target], next[index]];
  const updates: { id: string; position: number }[] = [];
  next.forEach((item, position) => {
    if (item.position !== position) updates.push({ id: item.id, position });
  });
  return updates;
}

/** Position for a new item placed last. */
export function nextPosition(items: readonly { position: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.position + 1), 0);
}

export function parseDirection(value: unknown): MoveDirection | null {
  return value === "up" || value === "down" ? value : null;
}
