import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const checkRateLimit = vi.fn();
const notifyAdmins = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserId: vi.fn(async () => null) }));
vi.mock("@/lib/settings", () => ({ getSiteSettings: vi.fn(async () => ({ coach_name: "Christian" })) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  clientIp: vi.fn(async () => "203.0.113.7"),
}));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: (...args: unknown[]) => notifyAdmins(...args) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => ({ insert: (row: unknown) => insert(table, row) }) }),
}));

const { sendContactMessage } = await import("./actions");
const { HONEYPOT_FIELD, initialContactState } = await import("./schema");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { name: "Jens Hansen", email: " Jens@Eksempel.dk ", phone: "", message: "Hej, er det noget for mig?" };

describe("sendContactMessage", () => {
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null });
    checkRateLimit.mockReset().mockResolvedValue(true);
    notifyAdmins.mockReset().mockResolvedValue(true);
  });

  it("stores a valid message and notifies admins without the message text", async () => {
    const result = await sendContactMessage(initialContactState, form(valid));
    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith("contact_messages", {
      name: "Jens Hansen",
      email: "jens@eksempel.dk",
      phone: null,
      message: "Hej, er det noget for mig?",
      user_id: null,
    });
    expect(checkRateLimit).toHaveBeenCalledWith("contact:ip:203.0.113.7", 5, 3600);
    expect(checkRateLimit).toHaveBeenCalledWith("contact:email:jens@eksempel.dk", 3, 3600);
    expect(notifyAdmins).toHaveBeenCalledWith({
      type: "contact",
      title: "Ny kontaktbesked",
      body: "Jens Hansen har skrevet via kontaktformularen.",
      link: "/admin/kontakt",
    });
    expect(JSON.stringify(notifyAdmins.mock.calls)).not.toContain("noget for mig");
  });

  it("returns Danish field errors and keeps the values", async () => {
    const result = await sendContactMessage(initialContactState, form({ name: "", email: "ikke-en-email", phone: "abc", message: " " }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toMatchObject({
      name: "Skriv dit navn.",
      email: "Skriv en gyldig e-mail, f.eks. navn@eksempel.dk.",
      phone: "Telefonnummeret må kun indeholde tal, mellemrum og +.",
      message: "Skriv en besked.",
    });
    expect(result.values?.email).toBe("ikke-en-email");
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not store anything when the honeypot is filled in", async () => {
    const result = await sendContactMessage(initialContactState, form({ ...valid, [HONEYPOT_FIELD]: "spam" }));
    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("refuses when the rate limit is reached", async () => {
    checkRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await sendContactMessage(initialContactState, form(valid));
    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("reports a database error instead of success", async () => {
    insert.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    const result = await sendContactMessage(initialContactState, form(valid));
    expect(result).toMatchObject({ ok: false, error: "Beskeden kunne ikke sendes. Prøv igen om lidt." });
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("still succeeds when only the notification fails (the message is saved)", async () => {
    notifyAdmins.mockRejectedValue(new Error("down"));
    const result = await sendContactMessage(initialContactState, form(valid));
    expect(result.ok).toBe(true);
  });
});
