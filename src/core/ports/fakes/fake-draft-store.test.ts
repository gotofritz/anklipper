import { describe, expect, it } from "vitest";

import { BASIC } from "@/fixtures/note-types";

import { createDraft } from "../../draft";
import { isErr, isOk } from "../../result";
import { createFakeDraftStore } from "./fake-draft-store";

const DRAFT = createDraft({
  deck: "Geography",
  noteType: BASIC,
  fields: { Front: "Paris" },
  source: {
    text: "Paris",
    context: "",
    url: "https://example.test",
    title: "",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  generation: { name: "basic", version: 1 },
});

describe("createFakeDraftStore", () => {
  it("has nothing stored to begin with", async () => {
    const result = await createFakeDraftStore().load();

    expect(isOk(result) && result.value).toBe(undefined);
  });

  it("gives back what was saved, and forgets it when cleared", async () => {
    const store = createFakeDraftStore();

    await store.save(DRAFT);
    const loaded = await store.load();
    await store.clear();
    const afterClear = await store.load();

    expect(isOk(loaded) && loaded.value).toEqual(DRAFT);
    expect(isOk(afterClear) && afterClear.value).toBe(undefined);
  });

  it("can be driven into failure and reports it in the port's error shape", async () => {
    const store = createFakeDraftStore();
    store.failWith({ kind: "write-failed", message: "storage is full" });

    const saved = await store.save(DRAFT);
    const loaded = await store.load();

    expect(isErr(saved) && saved.error.kind).toBe("write-failed");
    expect(isErr(loaded)).toBe(true);
  });
});
