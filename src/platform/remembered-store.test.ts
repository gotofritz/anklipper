import { describe, expect, it } from "vitest";

import { isErr, isOk } from "@/core/result";

import { REMEMBERED_KEY, createStoredRemembered } from "./remembered-store";
import type { StoragePort } from "./storage";

function fakeStorage(initial: Record<string, unknown> = {}): StoragePort & {
  readonly written: Record<string, unknown>;
  breakReads(): void;
} {
  const written: Record<string, unknown> = { ...initial };
  let broken = false;

  return {
    written,
    breakReads() {
      broken = true;
    },
    async get<T>(key: string): Promise<T | undefined> {
      if (broken) throw new Error("storage said no");
      return written[key] as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      written[key] = value;
    },
    async remove(key: string): Promise<void> {
      delete written[key];
    },
    onChanged(): () => void {
      return () => {};
    },
  };
}

describe("createStoredRemembered", () => {
  it("remembers nothing to begin with", async () => {
    const result = await createStoredRemembered(fakeStorage()).load();

    expect(isOk(result) && result.value).toEqual({});
  });

  it("round-trips the last-used deck", async () => {
    const storage = fakeStorage();
    const store = createStoredRemembered(storage);

    await store.save({ lastDeck: "Spanish::Verbs" });

    const result = await store.load();
    expect(isOk(result) && result.value.lastDeck).toBe("Spanish::Verbs");
  });

  // 8.5 keeps this apart from the settings key so a reset cannot erase it.
  it("uses a key of its own, not the settings one", () => {
    expect(REMEMBERED_KEY).not.toBe("settings");
  });

  it("degrades a payload it cannot read rather than failing", async () => {
    const storage = fakeStorage({ [REMEMBERED_KEY]: "wiped" });

    const result = await createStoredRemembered(storage).load();

    expect(isOk(result) && result.value).toEqual({});
  });

  it("ignores a last-used deck that is not a deck name", async () => {
    const storage = fakeStorage({ [REMEMBERED_KEY]: { lastDeck: 7 } });

    const result = await createStoredRemembered(storage).load();

    expect(isOk(result) && result.value).toEqual({});
  });

  // 10.6's pins are remembered state too: they belong to what the extension
  // noticed, not to what the user configured.
  it("round-trips the sticky fields", async () => {
    const storage = fakeStorage();
    const store = createStoredRemembered(storage);

    await store.save({ sticky: { Basic: { Back: "Source: Wikipedia" } } });

    const result = await store.load();
    expect(isOk(result) && result.value.sticky).toEqual({
      Basic: { Back: "Source: Wikipedia" },
    });
  });

  it("drops sticky entries that are not field text", async () => {
    const storage = fakeStorage({
      [REMEMBERED_KEY]: {
        sticky: { Basic: { Back: 7, Front: "kept" }, Broken: "nope" },
      },
    });

    const result = await createStoredRemembered(storage).load();

    expect(isOk(result) && result.value.sticky).toEqual({
      Basic: { Front: "kept" },
    });
  });

  it("reports storage itself refusing", async () => {
    const storage = fakeStorage();
    storage.breakReads();

    const result = await createStoredRemembered(storage).load();

    expect(isErr(result) && result.error.kind).toBe("read-failed");
  });
});
