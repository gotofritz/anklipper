import { describe, expect, it } from "vitest";

import { isErr, isOk } from "../../result";
import { createFakeRememberedStore } from "./fake-remembered-store";

describe("createFakeRememberedStore", () => {
  it("starts remembering nothing", async () => {
    const result = await createFakeRememberedStore().load();

    expect(isOk(result) && result.value).toEqual({});
  });

  it("gives back what was saved", async () => {
    const store = createFakeRememberedStore();

    await store.save({ lastDeck: "Spanish::Verbs" });

    const result = await store.load();
    expect(isOk(result) && result.value.lastDeck).toBe("Spanish::Verbs");
  });

  it("can be driven into failure and reports it in the port's error shape", async () => {
    const store = createFakeRememberedStore();
    store.failWith({ kind: "write-failed", message: "storage full" });

    expect(isErr(await store.load())).toBe(true);
    expect(isErr(await store.save({}))).toBe(true);
  });
});
