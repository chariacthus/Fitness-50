import { beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_HIDDEN_EVENT, MODERATION_CHANNEL } from "@/lib/community/moderation";

const MESSAGE = "33333333-3333-4333-8333-333333333333";

let httpSend: (event: string, payload: unknown, opts?: { timeout?: number }) => Promise<unknown>;
let adminAvailable = true;
const topics: string[] = [];
const removed: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (!adminAvailable) throw new Error("SUPABASE_SECRET_KEY mangler");
    return {
      channel: (topic: string) => {
        topics.push(topic);
        return { topic, httpSend: (...args: Parameters<typeof httpSend>) => httpSend(...args) };
      },
      removeChannel: async (channel: { topic: string }) => {
        removed.push(channel.topic);
        return "ok";
      },
    };
  },
}));

const { broadcastMessageHidden } = await import("@/lib/community/moderation-server");

beforeEach(() => {
  topics.length = 0;
  removed.length = 0;
  adminAvailable = true;
  httpSend = async () => ({ success: true });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("broadcastMessageHidden", () => {
  it("sends only the message id on the moderation channel over REST and cleans up", async () => {
    const sent: unknown[][] = [];
    httpSend = async (...args) => {
      sent.push(args);
      return { success: true };
    };
    await expect(broadcastMessageHidden(MESSAGE.toUpperCase())).resolves.toBe(true);
    expect(topics).toEqual([MODERATION_CHANNEL]);
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe(MESSAGE_HIDDEN_EVENT);
    expect(sent[0][1]).toEqual({ id: MESSAGE });
    expect(removed).toEqual([MODERATION_CHANNEL]);
  });

  it("reports failure instead of throwing, so the hide itself still succeeds", async () => {
    httpSend = async () => {
      throw new Error("httpSend() requires Realtime server v2.97.0 or newer");
    };
    await expect(broadcastMessageHidden(MESSAGE)).resolves.toBe(false);
    expect(removed).toEqual([MODERATION_CHANNEL]);

    httpSend = async () => ({ success: false, status: 500, error: "nede" });
    await expect(broadcastMessageHidden(MESSAGE)).resolves.toBe(false);

    adminAvailable = false;
    await expect(broadcastMessageHidden(MESSAGE)).resolves.toBe(false);
  });
});
