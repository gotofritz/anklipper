import { describe, expect, it } from "vitest";

import { createDraft } from "@/core/draft";
import { BASIC } from "@/fixtures/note-types";

import { DRAFT_KEY, createStoredDrafts } from "./draft-store";
import type { StoragePort } from "./storage";

const DRAFT = createDraft({
  deck: "Geography",
  noteType: BASIC,
  fields: { Front: "Paris is the capital of France." },
  source: {
    text: "Paris is the capital of France.",
    context: "France is a country in Europe.",
    url: "https://example.test/france",
    title: "France — Example",
  },
  createdAt: "2026-01-01T12:00:00.000Z",
  generation: { name: "basic", version: 1 },
});

function fakeStorage(initial: Record<string, unknown> = {}): StoragePort & {
  readonly written: Record<string, unknown>;
} {
  const written: Record<string, unknown> = { ...initial };

  return {
    written,
    async get<T>(key: string): Promise<T | undefined> {
      return written[key] as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      written[key] = value;
    },
    async remove(key: string): Promise<void> {
      delete written[key];
    },
  };
}

describe("stored drafts", () => {
  it("round-trips a draft through storage", async () => {
    const storage = fakeStorage();
    const drafts = createStoredDrafts(storage);

    expect(await drafts.save(DRAFT)).toEqual({ ok: true, value: undefined });
    await expect(drafts.load()).resolves.toEqual({ ok: true, value: DRAFT });
  });

  it("reports an empty store as no draft, not as a failure", async () => {
    await expect(createStoredDrafts(fakeStorage()).load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("clears the draft", async () => {
    const storage = fakeStorage();
    const drafts = createStoredDrafts(storage);
    await drafts.save(DRAFT);

    await drafts.clear();

    expect(storage.written[DRAFT_KEY]).toBeUndefined();
  });

  // A draft written by an older version, or by something else entirely.
  it("reports a stored value it cannot read as malformed", async () => {
    const drafts = createStoredDrafts(
      fakeStorage({ [DRAFT_KEY]: "not a draft" }),
    );

    const loaded = await drafts.load();

    expect(loaded.ok === false && loaded.error.kind).toBe(
      "malformed-stored-value",
    );
  });

  it("reports a storage write that threw", async () => {
    const storage = fakeStorage();
    storage.set = async () => {
      throw new Error("quota exceeded");
    };

    const saved = await createStoredDrafts(storage).save(DRAFT);

    expect(saved.ok === false && saved.error.kind).toBe("write-failed");
    expect(saved.ok === false && saved.error.message).toContain("quota");
  });

  it("reports a storage read that threw", async () => {
    const storage = fakeStorage();
    storage.get = async () => {
      throw new Error("storage is unavailable");
    };

    const loaded = await createStoredDrafts(storage).load();

    expect(loaded.ok === false && loaded.error.kind).toBe("read-failed");
  });
});
