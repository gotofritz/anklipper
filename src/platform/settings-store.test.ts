import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, SETTINGS_VERSION } from "@/core/settings";
import { isErr, isOk } from "@/core/result";

import { REMEMBERED_KEY } from "./remembered-store";
import {
  SETTINGS_KEY,
  createStoredSettings,
  loadSettingsOrDefaults,
} from "./settings-store";
import type { StoragePort } from "./storage";

function fakeStorage(initial: Record<string, unknown> = {}): StoragePort & {
  readonly written: Record<string, unknown>;
  failNext(on: "get" | "set" | "remove"): void;
} {
  const written: Record<string, unknown> = { ...initial };
  let failing: string | undefined;

  const refuse = (on: string) => {
    if (failing !== on) return;
    failing = undefined;
    throw new Error("storage said no");
  };

  return {
    written,
    failNext(on) {
      failing = on;
    },
    async get<T>(key: string): Promise<T | undefined> {
      refuse("get");
      return written[key] as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      refuse("set");
      written[key] = value;
    },
    async remove(key: string): Promise<void> {
      refuse("remove");
      delete written[key];
    },
    onChanged(): () => void {
      return () => {};
    },
  };
}

describe("createStoredSettings", () => {
  // Test 1 of the M8 plan.
  it("returns the defaults when nothing is stored", async () => {
    const result = await createStoredSettings(fakeStorage()).load();

    expect(isOk(result) && result.value).toEqual(DEFAULT_SETTINGS);
  });

  // Test 2.
  it("round-trips a saved setting", async () => {
    const storage = fakeStorage();
    const store = createStoredSettings(storage);

    await store.save({ ...DEFAULT_SETTINGS, defaultDeck: "Spanish::Verbs" });
    const result = await store.load();

    expect(isOk(result) && result.value.defaultDeck).toBe("Spanish::Verbs");
  });

  it("writes under one key, versioned (8.1, 8.4)", async () => {
    const storage = fakeStorage();

    await createStoredSettings(storage).save(DEFAULT_SETTINGS);

    expect(storage.written[SETTINGS_KEY]).toMatchObject({
      version: SETTINGS_VERSION,
    });
  });

  // Test 3.
  it("falls back to the default for a malformed value and still loads the rest", async () => {
    const storage = fakeStorage({
      [SETTINGS_KEY]: {
        version: SETTINGS_VERSION,
        defaultDeck: { not: "a deck name" },
        defaultTags: ["kept"],
      },
    });

    const result = await createStoredSettings(storage).load();

    expect(isOk(result) && result.value.defaultDeck).toBe(
      DEFAULT_SETTINGS.defaultDeck,
    );
    expect(isOk(result) && result.value.defaultTags).toEqual(["kept"]);
  });

  // 8.2: a settings bug must not brick the extension.
  it("loads the defaults rather than failing when the payload is nonsense", async () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: "wiped by something else" });

    const result = await createStoredSettings(storage).load();

    expect(isOk(result) && result.value).toEqual(DEFAULT_SETTINGS);
  });

  // Test 4.
  it("preserves a key it does not own, because a newer version may", async () => {
    const storage = fakeStorage({
      [SETTINGS_KEY]: { version: SETTINGS_VERSION, futureThing: "keep me" },
    });
    const store = createStoredSettings(storage);

    await store.save({ ...DEFAULT_SETTINGS, defaultDeck: "Geography" });

    expect(storage.written[SETTINGS_KEY]).toMatchObject({
      defaultDeck: "Geography",
      futureThing: "keep me",
    });
  });

  // Test 5, through the adapter: the migration runs on read.
  it("migrates an unversioned payload on read and leaves it readable", async () => {
    const storage = fakeStorage({
      [SETTINGS_KEY]: { defaultDeck: "Spanish" },
    });
    const store = createStoredSettings(storage);

    const first = await store.load();
    expect(isOk(first) && first.value.defaultDeck).toBe("Spanish");

    await store.save(isOk(first) ? first.value : DEFAULT_SETTINGS);
    expect(storage.written[SETTINGS_KEY]).toMatchObject({
      version: SETTINGS_VERSION,
      defaultDeck: "Spanish",
    });
  });

  it("reports storage itself refusing, which is not the same as bad data", async () => {
    const storage = fakeStorage();
    storage.failNext("get");

    const result = await createStoredSettings(storage).load();

    expect(isErr(result) && result.error.kind).toBe("read-failed");
  });

  it("reports a write that storage refused", async () => {
    const storage = fakeStorage();
    storage.failNext("set");

    const result = await createStoredSettings(storage).save(DEFAULT_SETTINGS);

    expect(isErr(result) && result.error.kind).toBe("write-failed");
  });

  it("goes back to the defaults on reset", async () => {
    const storage = fakeStorage();
    const store = createStoredSettings(storage);

    await store.save({ ...DEFAULT_SETTINGS, defaultDeck: "Geography" });
    await store.reset();

    const result = await store.load();
    expect(isOk(result) && result.value).toEqual(DEFAULT_SETTINGS);
  });

  // 8.5. Resetting the settings is not a reason to forget the deck the last
  // card went into, which is why the two live under different keys.
  it("leaves what is merely remembered alone on reset", async () => {
    const storage = fakeStorage({
      [REMEMBERED_KEY]: { lastDeck: "Geography" },
    });

    await createStoredSettings(storage).reset();

    expect(storage.written[REMEMBERED_KEY]).toEqual({ lastDeck: "Geography" });
  });

  // A reset is this version's settings going back to their defaults, not a
  // licence to throw away a key a newer version owns.
  it("still preserves a key it does not own across a reset", async () => {
    const storage = fakeStorage({
      [SETTINGS_KEY]: { version: SETTINGS_VERSION, futureThing: "keep me" },
    });

    await createStoredSettings(storage).reset();

    expect(storage.written[SETTINGS_KEY]).toMatchObject({
      futureThing: "keep me",
    });
  });

  // 8.5a: the key is stored like any other setting — and only stored.
  it("stores an API key and reads it back", async () => {
    const storage = fakeStorage();
    const store = createStoredSettings(storage);

    await store.save({ ...DEFAULT_SETTINGS, apiKey: "s3cret" });
    const result = await store.load();

    expect(isOk(result) && result.value.apiKey).toBe("s3cret");
  });
});

describe("loadSettingsOrDefaults", () => {
  it("gives back what is stored", async () => {
    const storage = fakeStorage();
    const store = createStoredSettings(storage);
    await store.save({ ...DEFAULT_SETTINGS, defaultDeck: "Geography" });

    expect((await loadSettingsOrDefaults(store)).defaultDeck).toBe("Geography");
  });

  // 8.2, for the callers that have nothing to do with a failure: a capture
  // still has to make a card, and the adapter still needs an endpoint.
  it("gives back the defaults when storage itself refuses", async () => {
    const storage = fakeStorage();
    storage.failNext("get");

    expect(await loadSettingsOrDefaults(createStoredSettings(storage))).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
