import { describe, expect, it } from "vitest";

import { createDraft } from "@/core/draft";
import { BASIC } from "@/fixtures/note-types";

import {
  DRAFT_KEY,
  PENDING_KEY,
  createStoredDrafts,
  watchDraft,
} from "./draft-store";
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
    onChanged(): () => void {
      return () => {};
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

  // What the sidebar subscribes to when it is already open (M5), and from
  // M7 the waiting capture as well (7.4): a prompt nobody is told about is
  // one nobody answers.
  it("watches both the draft key and the waiting one", () => {
    const watched: string[] = [];
    const storage = fakeStorage();
    storage.onChanged = (key: string) => {
      watched.push(key);
      return () => {};
    };

    watchDraft(storage, () => {});

    expect(watched).toEqual([DRAFT_KEY, PENDING_KEY]);
  });

  it("stops watching both keys again", () => {
    const stopped: string[] = [];
    const storage = fakeStorage();
    storage.onChanged = (key: string) => () => stopped.push(key);

    watchDraft(storage, () => {})();

    expect(stopped).toEqual([DRAFT_KEY, PENDING_KEY]);
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

/**
 * The capture that arrived while a draft was already being edited (7.4). It
 * is the same store under a second key: one draft is in flight at a time, and
 * the newer selection waits rather than overwriting it.
 */
describe("the waiting capture", () => {
  it("is stored under its own key, not the draft's", async () => {
    const storage = fakeStorage();

    await createStoredDrafts(storage, PENDING_KEY).save(DRAFT);

    expect(storage.written[PENDING_KEY]).toEqual(DRAFT);
    expect(storage.written[DRAFT_KEY]).toBeUndefined();
  });

  it("round-trips and clears independently of the draft", async () => {
    const storage = fakeStorage();
    const drafts = createStoredDrafts(storage);
    const pending = createStoredDrafts(storage, PENDING_KEY);
    await drafts.save(DRAFT);
    await pending.save(DRAFT);

    await pending.clear();

    await expect(pending.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(drafts.load()).resolves.toEqual({ ok: true, value: DRAFT });
  });
});
