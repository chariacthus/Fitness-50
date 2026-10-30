import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MESSAGE_HIDDEN_EVENT, MODERATION_CHANNEL, hiddenMessageId, listenForHiddenMessages, withoutKey } from "@/lib/community/moderation";

const MESSAGE = "33333333-3333-4333-8333-333333333333";

describe("hiddenMessageId (moderation broadcast payload)", () => {
  it("accepts a payload with a valid message id", () => {
    expect(hiddenMessageId({ id: MESSAGE })).toBe(MESSAGE);
    expect(hiddenMessageId({ id: MESSAGE.toUpperCase() })).toBe(MESSAGE);
  });

  it("ignores anything else", () => {
    for (const payload of [null, undefined, "", MESSAGE, 42, [], {}, { id: null }, { id: 7 }, { id: "abc" }, { id: `${MESSAGE} ` }, { id: `${MESSAGE}' or 1=1` }]) {
      expect(hiddenMessageId(payload)).toBeNull();
    }
  });
});

describe("withoutKey (quoted messages)", () => {
  it("drops the id and keeps the rest", () => {
    expect(withoutKey({ a: 1, b: 2 }, "a")).toEqual({ b: 2 });
  });

  it("returns the same object when the id is not there", () => {
    const record = { a: 1 };
    expect(withoutKey(record, "b")).toBe(record);
    expect(withoutKey(record, "toString")).toBe(record);
  });
});

/** Just enough of the browser client to follow channels: topic, listeners, removal. */
function fakeRealtime() {
  type Listener = { event: string; callback: (message: { payload: unknown }) => void };
  type Channel = { topic: string; listeners: Listener[]; subscribed: boolean; removed: boolean };
  const channels: Channel[] = [];
  let finishRemoval: (() => void) | undefined;
  const client = {
    channel(topic: string) {
      const channel: Channel = { topic, listeners: [], subscribed: false, removed: false };
      channels.push(channel);
      const api = {
        on(_type: string, filter: { event: string }, callback: Listener["callback"]) {
          channel.listeners.push({ event: filter.event, callback });
          return api;
        },
        subscribe() {
          channel.subscribed = true;
          return api;
        },
        channel,
      };
      return api;
    },
    removeChannel(api: { channel: Channel }) {
      return new Promise<"ok">((resolve) => {
        finishRemoval = () => {
          api.channel.removed = true;
          resolve("ok");
        };
      });
    },
  };
  const send = (payload: unknown, event = MESSAGE_HIDDEN_EVENT) => {
    for (const channel of channels) {
      if (channel.subscribed && !channel.removed) {
        for (const l of channel.listeners) if (l.event === event) l.callback({ payload });
      }
    }
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    channels,
    send,
    finishRemoval: () => finishRemoval?.(),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("listenForHiddenMessages", () => {
  it("listens on the fixed moderation channel and passes on valid ids only", async () => {
    const rt = fakeRealtime();
    const onHidden = vi.fn();
    const stop = listenForHiddenMessages(rt.client, onHidden);
    await tick();
    expect(rt.channels.map((c) => c.topic)).toEqual([MODERATION_CHANNEL]);
    expect(rt.channels[0].subscribed).toBe(true);

    rt.send({ id: MESSAGE });
    rt.send({ id: "ikke-et-id" });
    rt.send({ id: MESSAGE }, "something-else");
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onHidden).toHaveBeenCalledWith(MESSAGE);

    stop();
    rt.finishRemoval();
    await tick();
  });

  it("opens nothing when stopped straight away (React's double mount)", async () => {
    const rt = fakeRealtime();
    const stop = listenForHiddenMessages(rt.client, vi.fn());
    stop();
    await tick();
    expect(rt.channels).toHaveLength(0);
  });

  it("waits until the previous channel is removed before it subscribes again", async () => {
    const rt = fakeRealtime();
    const first = vi.fn();
    const stopFirst = listenForHiddenMessages(rt.client, first);
    await tick();
    stopFirst();

    const second = vi.fn();
    const stopSecond = listenForHiddenMessages(rt.client, second);
    await tick();
    // The old channel is still closing, so no new one yet.
    expect(rt.channels).toHaveLength(1);

    rt.finishRemoval();
    await tick();
    expect(rt.channels).toHaveLength(2);
    rt.send({ id: MESSAGE });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(MESSAGE);

    stopSecond();
    rt.finishRemoval();
    await tick();
  });
});
