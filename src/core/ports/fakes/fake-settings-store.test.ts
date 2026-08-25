import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../result";
import { DEFAULT_SETTINGS } from "../types";
import { createFakeSettingsStore } from "./fake-settings-store";

describe("createFakeSettingsStore", () => {
  it("starts from the defaults", async () => {
    const result = await createFakeSettingsStore().load();

    expect(isOk(result) && result.value).toEqual(DEFAULT_SETTINGS);
  });

  it("starts from the settings it was given", async () => {
    const store = createFakeSettingsStore({ defaultDeck: "Geography" });
    const result = await store.load();

    expect(isOk(result) && result.value).toEqual({
      ...DEFAULT_SETTINGS,
      defaultDeck: "Geography",
    });
  });

  it("gives back what was saved", async () => {
    const store = createFakeSettingsStore();

    await store.save({ ...DEFAULT_SETTINGS, defaultDeck: "Cloze::Deck" });
    const result = await store.load();

    expect(isOk(result) && result.value.defaultDeck).toBe("Cloze::Deck");
  });

  it("goes back to the defaults on reset (8.5)", async () => {
    const store = createFakeSettingsStore({ defaultDeck: "Geography" });

    await store.reset();
    const result = await store.load();

    expect(isOk(result) && result.value).toEqual(DEFAULT_SETTINGS);
  });

  it("can be driven into failure and reports it in the port's error shape", async () => {
    const store = createFakeSettingsStore();
    store.failWith({ kind: "read-failed", message: "storage unavailable" });

    expect(isErr(await store.load())).toBe(true);
    expect(isErr(await store.save(DEFAULT_SETTINGS))).toBe(true);
    expect(isErr(await store.reset())).toBe(true);
  });
});
