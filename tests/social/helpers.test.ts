import { describe, expect, it } from "vitest";
import { copenhagenDayKey, dayHeading, firstUnreadId, groupByDay, replyQuoteText } from "@/lib/community/grouping";
import { coachConversationHref, newConversationHref, safeRelativeLink } from "@/lib/messages/links";
import { conversationPreview, mergeById, sortInbox } from "@/lib/messages/merge";
import { reportSchema } from "@/lib/messages/report";
import { displayName, messageSnippet, newMessagesLabel, olderMessagesLabel } from "@/lib/messages/text";

const ME = "11111111-1111-4111-8111-111111111111";
const YOU = "22222222-2222-4222-8222-222222222222";

describe("safeRelativeLink (notification links)", () => {
  it("keeps relative links inside the site", () => {
    expect(safeRelativeLink("/beskeder/abc")).toBe("/beskeder/abc");
    expect(safeRelativeLink("/admin/rapporter?status=open#top")).toBe("/admin/rapporter?status=open#top");
    expect(safeRelativeLink("/")).toBe("/");
  });

  it("rejects everything that could leave the site", () => {
    for (const link of [
      null,
      undefined,
      "",
      "https://evil.example/",
      "http://evil.example",
      "//evil.example/path",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "beskeder/abc",
      " /beskeder",
      "/\t/evil.example",
      "/\n/evil.example",
      "/beskeder abc",
      `/${"a".repeat(2100)}`,
    ]) {
      expect(safeRelativeLink(link)).toBeNull();
    }
  });

  it("normalises dot segments without leaving the site", () => {
    expect(safeRelativeLink("/a/../beskeder")).toBe("/beskeder");
    expect(safeRelativeLink("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });

  it("builds conversation links and hides 'Skriv til' for the coach himself", () => {
    expect(newConversationHref(YOU)).toBe(`/beskeder/ny?til=${YOU}`);
    expect(coachConversationHref(YOU, ME)).toBe(`/beskeder/ny?til=${YOU}`);
    expect(coachConversationHref(ME, ME)).toBeNull();
    expect(coachConversationHref(null, ME)).toBeNull();
  });
});

describe("text helpers", () => {
  it("falls back to a neutral name", () => {
    expect(displayName("  Jens Hansen ")).toBe("Jens Hansen");
    expect(displayName("")).toBe("Medlem");
    expect(displayName(null, "Uden navn")).toBe("Uden navn");
  });

  it("shortens snippets at a word boundary", () => {
    expect(messageSnippet("  Hej   alle\n\nsammen ")).toBe("Hej alle sammen");
    const long = "Jeg har trænet tre gange i denne uge og det går rigtig godt med knæet efter de nye øvelser";
    const short = messageSnippet(long, 40);
    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(41);
    expect(long.startsWith(short.slice(0, -1))).toBe(true);
    expect(messageSnippet(null)).toBe("");
  });

  it("uses correct Danish singular and plural", () => {
    expect(newMessagesLabel(1)).toBe("1 ny besked");
    expect(newMessagesLabel(3)).toBe("3 nye beskeder");
    expect(olderMessagesLabel(0)).toBe("Der er ikke flere ældre beskeder.");
    expect(olderMessagesLabel(1)).toBe("1 ældre besked er hentet.");
    expect(olderMessagesLabel(50)).toBe("50 ældre beskeder er hentet.");
  });
});

describe("reply quotes", () => {
  it("describes the message being answered", () => {
    expect(replyQuoteText({ body: "Godt gået!", image_path: null, deleted_at: null })).toBe("Godt gået!");
    expect(replyQuoteText({ body: "", image_path: "x/y.jpg", deleted_at: null })).toBe("Et billede");
    expect(replyQuoteText({ body: "", image_path: null, deleted_at: "2026-10-30T10:00:00Z" })).toBe("Beskeden er slettet");
    expect(replyQuoteText(undefined)).toBe("En tidligere besked");
    expect(replyQuoteText({ body: "a ".repeat(200), image_path: null, deleted_at: null }).endsWith("…")).toBe(true);
  });
});

describe("mergeById", () => {
  const a = { id: "a", created_at: "2026-10-30T10:00:00.000001+00:00", body: "første" };
  const b = { id: "b", created_at: "2026-10-30T10:05:00+00:00", body: "anden" };
  const c = { id: "c", created_at: "2026-10-30T09:00:00+00:00", body: "ældre" };

  it("deduplicates realtime echoes of own messages and keeps chronological order", () => {
    const merged = mergeById([a, b], [b, c]);
    expect(merged.map((m) => m.id)).toEqual(["c", "a", "b"]);
  });

  it("replaces a message when it changes (soft delete)", () => {
    const deleted = { ...a, body: "" };
    const merged = mergeById([a, b], [deleted]);
    expect(merged).toHaveLength(2);
    expect(merged[0].body).toBe("");
  });

  it("orders identical timestamps by id", () => {
    const x = { id: "x", created_at: b.created_at };
    const w = { id: "w", created_at: b.created_at };
    expect(mergeById([x], [w]).map((m) => m.id)).toEqual(["w", "x"]);
  });
});

describe("inbox", () => {
  const row = (id: string, unread: number, at: string | null) => ({
    conversation_id: id,
    unread_count: unread,
    last_message_at: at,
    last_message_body: "Hej",
    last_message_sender_id: YOU,
  });

  it("puts unread conversations first, then the newest", () => {
    const sorted = sortInbox([
      row("old-read", 0, "2026-10-01T10:00:00Z"),
      row("new-read", 0, "2026-10-30T10:00:00Z"),
      row("old-unread", 2, "2026-10-02T10:00:00Z"),
      row("new-unread", 1, "2026-10-29T10:00:00Z"),
      row("empty", 0, null),
    ]);
    expect(sorted.map((r) => r.conversation_id)).toEqual(["new-unread", "old-unread", "new-read", "old-read", "empty"]);
  });

  it("previews the last message and marks own messages with 'Du:'", () => {
    expect(conversationPreview({ last_message_body: "Hej Jens", last_message_sender_id: YOU }, ME)).toBe("Hej Jens");
    expect(conversationPreview({ last_message_body: "Tak!", last_message_sender_id: ME }, ME)).toBe("Du: Tak!");
    expect(conversationPreview({ last_message_body: null, last_message_sender_id: null }, ME)).toBe("Ingen beskeder endnu");
  });
});

describe("day groups and the 'Nye beskeder' divider", () => {
  const now = new Date("2026-10-30T12:00:00Z");

  it("uses Copenhagen days (midnight is 23:00 UTC in winter)", () => {
    expect(copenhagenDayKey("2026-10-29T22:59:00Z")).toBe("2026-10-29");
    expect(copenhagenDayKey("2026-10-29T23:01:00Z")).toBe("2026-10-30");
  });

  it("labels today, yesterday and older days in Danish", () => {
    expect(dayHeading("2026-10-30", now)).toBe("I dag");
    expect(dayHeading("2026-10-29", now)).toBe("I går");
    expect(dayHeading("2026-10-27", now)).toBe("Tirsdag 27. oktober");
    expect(dayHeading("2025-12-24", now)).toBe("Onsdag 24. december 2025");
  });

  it("groups consecutive messages by day", () => {
    const groups = groupByDay(
      [
        { id: "1", created_at: "2026-10-29T08:00:00Z" },
        { id: "2", created_at: "2026-10-29T20:00:00Z" },
        { id: "3", created_at: "2026-10-30T07:00:00Z" },
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["I går", ["1", "2"]],
      ["I dag", ["3"]],
    ]);
    expect(groupByDay([], now)).toEqual([]);
  });

  it("finds the first unread message from someone else", () => {
    const messages = [
      { id: "1", created_at: "2026-10-30T08:00:00Z", author_id: YOU, deleted_at: null },
      { id: "2", created_at: "2026-10-30T09:00:00Z", author_id: ME, deleted_at: null },
      { id: "3", created_at: "2026-10-30T09:30:00Z", author_id: YOU, deleted_at: "2026-10-30T09:31:00Z" },
      { id: "4", created_at: "2026-10-30T10:00:00Z", author_id: YOU, deleted_at: null },
    ];
    expect(firstUnreadId(messages, "2026-10-30T08:30:00Z", ME)).toBe("4");
    expect(firstUnreadId(messages, "2026-10-30T07:00:00Z", ME)).toBe("1");
    expect(firstUnreadId(messages, "2026-10-30T11:00:00Z", ME)).toBeNull();
    expect(firstUnreadId(messages, null, ME)).toBeNull();
  });
});

describe("report form validation", () => {
  it("accepts a valid report and trims the reason", () => {
    const parsed = reportSchema.safeParse({ target_type: "community_message", target_id: YOU, reason: "  Grimt sprog  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reason).toBe("Grimt sprog");
  });

  it("rejects unknown types, bad ids and empty reasons with Danish messages", () => {
    const bad = reportSchema.safeParse({ target_type: "announcement", target_id: "123", reason: " " });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const fields = Object.fromEntries(bad.error.issues.map((i) => [i.path.join("."), i.message]));
      expect(fields.target_type).toMatch(/anmeldes/);
      expect(fields.target_id).toMatch(/ikke fundet/);
      expect(fields.reason).toMatch(/hvorfor/);
    }
    expect(reportSchema.safeParse({ target_type: "profile", target_id: YOU, reason: null }).success).toBe(false);
    expect(reportSchema.safeParse({ target_type: "profile", target_id: YOU, reason: "x".repeat(1001) }).success).toBe(false);
  });
});
