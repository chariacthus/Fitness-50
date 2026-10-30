import { describe, expect, it } from "vitest";
import { announcementStatus, publishOutcomeMessage } from "@/lib/announcements/labels";
import { announcementFormSchema, attachMediaSchema } from "@/lib/announcements/schema";
import { excerpt, isHttpsLink, moveInOrder, paragraphs } from "@/lib/announcements/text";

const NOW = new Date("2026-10-30T12:00:00.000Z");

describe("paragraphs", () => {
  it("splits on blank lines and keeps single line breaks", () => {
    expect(paragraphs("Hej alle\nVi ses\n\nAndet afsnit\r\n\r\n\r\nTredje")).toEqual(["Hej alle\nVi ses", "Andet afsnit", "Tredje"]);
  });
  it("ignores empty input", () => {
    expect(paragraphs("")).toEqual([]);
    expect(paragraphs("  \n \n ")).toEqual([]);
    expect(paragraphs(null)).toEqual([]);
  });
});

describe("excerpt", () => {
  it("returns short texts unchanged (whitespace collapsed)", () => {
    expect(excerpt("Kort\n\ntekst")).toBe("Kort tekst");
  });
  it("cuts long texts at a word boundary", () => {
    const text = "ord ".repeat(100);
    const result = excerpt(text, 50);
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });
});

describe("isHttpsLink", () => {
  it("only accepts absolute https links", () => {
    expect(isHttpsLink("https://maps.google.com/?q=Aarhus")).toBe(true);
    expect(isHttpsLink("HTTPS://example.dk")).toBe(true);
    expect(isHttpsLink("http://example.dk")).toBe(false);
    expect(isHttpsLink("https:example.dk")).toBe(false);
    expect(isHttpsLink("javascript:alert(1)")).toBe(false);
    expect(isHttpsLink("https://")).toBe(false);
  });
});

describe("moveInOrder", () => {
  it("swaps with the neighbour", () => {
    expect(moveInOrder(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });
  it("refuses impossible moves", () => {
    expect(moveInOrder(["a", "b"], "a", "up")).toBeNull();
    expect(moveInOrder(["a", "b"], "b", "down")).toBeNull();
    expect(moveInOrder(["a", "b"], "x", "up")).toBeNull();
  });
});

describe("announcementFormSchema", () => {
  const base = {
    title: "  Fælles træning  ",
    body: "Tekst",
    video_title: "",
    video_description: "",
    location_name: "",
    location_address: "",
    map_url: "",
    is_pinned: false,
    is_important: true,
    published_at: "",
  };

  it("trims, maps empty optional fields to null and leaves an empty time empty", () => {
    const result = announcementFormSchema.parse(base);
    expect(result.title).toBe("Fælles træning");
    expect(result.video_title).toBeNull();
    expect(result.map_url).toBeNull();
    expect(result.published_at).toBeNull();
  });

  it("converts the publication time from Copenhagen time", () => {
    expect(announcementFormSchema.parse({ ...base, published_at: "2026-11-02T08:00" }).published_at).toBe("2026-11-02T07:00:00.000Z");
    expect(announcementFormSchema.parse({ ...base, published_at: "2026-08-02T08:00" }).published_at).toBe("2026-08-02T06:00:00.000Z");
  });

  it("rejects an invalid time, a missing title and non-https map links", () => {
    expect(announcementFormSchema.safeParse({ ...base, published_at: "2026-02-31T08:00" }).success).toBe(false);
    expect(announcementFormSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(announcementFormSchema.safeParse({ ...base, map_url: "http://maps.example" }).success).toBe(false);
    expect(announcementFormSchema.parse({ ...base, map_url: "https://maps.example/x" }).map_url).toBe("https://maps.example/x");
  });
});

describe("attachMediaSchema", () => {
  const id = "00000000-0000-4000-8000-000000000123";
  const MB = 1024 * 1024;
  it("accepts files in the announcement's folder within the limits", () => {
    expect(attachMediaSchema.safeParse({ announcementId: id, path: `${id}/a.jpg`, mimeType: "image/jpeg", size: 10 * MB }).success).toBe(true);
    expect(attachMediaSchema.safeParse({ announcementId: id, path: `${id}/a.mp4`, mimeType: "video/mp4", size: 50 * MB }).success).toBe(true);
  });
  it("rejects other folders, wrong types and too large files", () => {
    expect(attachMediaSchema.safeParse({ announcementId: id, path: `other/a.jpg`, mimeType: "image/jpeg", size: 1 }).success).toBe(false);
    expect(attachMediaSchema.safeParse({ announcementId: id, path: `${id}/../x.jpg`, mimeType: "image/jpeg", size: 1 }).success).toBe(false);
    expect(attachMediaSchema.safeParse({ announcementId: id, path: `${id}/a.gif`, mimeType: "image/gif", size: 1 }).success).toBe(false);
    expect(attachMediaSchema.safeParse({ announcementId: id, path: `${id}/a.jpg`, mimeType: "image/jpeg", size: 10 * MB + 1 }).success).toBe(false);
    expect(attachMediaSchema.safeParse({ announcementId: id, path: `${id}/a.mp4`, mimeType: "video/mp4", size: 50 * MB + 1 }).success).toBe(false);
  });
});

describe("announcementStatus", () => {
  it("distinguishes draft, scheduled and published", () => {
    expect(announcementStatus("draft", null, NOW).label).toBe("Kladde");
    expect(announcementStatus("published", "2026-11-01T00:00:00Z", NOW).label).toBe("Planlagt");
    expect(announcementStatus("published", "2026-10-01T00:00:00Z", NOW).label).toBe("Udgivet");
  });
});

describe("publishOutcomeMessage", () => {
  it("reports how many members were notified", () => {
    expect(publishOutcomeMessage({ notified: 12, isImportant: true, publishedAt: "2026-10-30T11:00:00Z", alreadyNotified: false, now: NOW })).toBe(
      "Opslaget er udgivet. 12 medlemmer har fået en notifikation.",
    );
    expect(publishOutcomeMessage({ notified: 1, isImportant: true, publishedAt: "2026-10-30T11:00:00Z", alreadyNotified: false, now: NOW })).toMatch(
      /1 medlem har/,
    );
  });

  it("warns that a future-dated important announcement will not notify later", () => {
    const message = publishOutcomeMessage({ notified: 0, isImportant: true, publishedAt: "2026-11-02T07:00:00Z", alreadyNotified: false, now: NOW });
    expect(message).toMatch(/bliver synligt for medlemmerne 2\. november 2026 kl\. 08\.00/);
    expect(message).toMatch(/sendes ikke notifikation/);
  });

  it("explains why nobody was notified", () => {
    expect(publishOutcomeMessage({ notified: 0, isImportant: false, publishedAt: null, alreadyNotified: false, now: NOW })).toMatch(/ikke markeret som vigtigt/);
    expect(publishOutcomeMessage({ notified: 0, isImportant: true, publishedAt: null, alreadyNotified: true, now: NOW })).toMatch(/første gang/);
    expect(publishOutcomeMessage({ notified: 0, isImportant: true, publishedAt: null, alreadyNotified: false, now: NOW })).toMatch(/ingen aktive medlemmer/);
  });
});
