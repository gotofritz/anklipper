import type { CardDraft } from "@/core/draft";
import type { DraftStore, DraftStoreError } from "@/core/ports/types";
import { err, ok, type Result } from "@/core/result";

import type { StoragePort } from "./storage";

/** One draft at a time: the MVP captures, edits, and adds one card (M5). */
export const DRAFT_KEY = "draft";

/**
 * The capture that arrived while a draft was already in flight (7.4).
 *
 * One draft is edited at a time, so a second gesture parks its draft here
 * rather than overwriting the first — and the sidebar asks which one the user
 * meant. Nothing edits what is parked here, so a third gesture may replace it
 * freely: there is nothing in it to lose.
 */
export const PENDING_KEY = "pending-draft";

/**
 * `DraftStore` over extension storage.
 *
 * The background is unloaded when idle on both browsers, so the draft is
 * durable from the moment the capture makes it rather than held in memory
 * between the gesture and the sidebar reading it.
 */
function fail(kind: DraftStoreError["kind"], cause: unknown): DraftStoreError {
  return {
    kind,
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

/** Enough of a shape check to tell a draft from whatever else is under the key. */
function isDraft(value: unknown): value is CardDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CardDraft>;

  return (
    typeof candidate.deck === "string" &&
    typeof candidate.noteType === "object" &&
    candidate.noteType !== null &&
    typeof candidate.fields === "object" &&
    candidate.fields !== null &&
    Array.isArray(candidate.tags)
  );
}

/**
 * Watch for a draft written by another context. The sidebar reads the draft
 * on mount, and on Firefox it is usually already open when the next capture
 * happens — so without this it would show the previous card indefinitely.
 *
 * Both keys, because either can change under an open sidebar: a capture with
 * nothing in flight replaces the draft, and one with a draft in flight parks
 * itself under `PENDING_KEY` and needs the user to be asked (7.4).
 */
export function watchDraft(
  storage: StoragePort,
  listener: () => void,
): () => void {
  const stops = [DRAFT_KEY, PENDING_KEY].map((key) =>
    storage.onChanged(key, listener),
  );

  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * `key` is which slot: the draft being edited, or the capture waiting behind
 * it (7.4). The two are the same store — a `DraftStore` is one draft — so the
 * background and the sidebar hold one of each rather than a wider interface
 * with the slot baked into every method name.
 */
export function createStoredDrafts(
  storage: StoragePort,
  key: string = DRAFT_KEY,
): DraftStore {
  return {
    async load(): Promise<Result<CardDraft | undefined, DraftStoreError>> {
      let stored: unknown;
      try {
        stored = await storage.get<unknown>(key);
      } catch (cause) {
        return err(fail("read-failed", cause));
      }

      if (stored === undefined) return ok(undefined);
      // A value written by an older version, or by something else entirely.
      // Saying so beats handing the editor a half-draft.
      if (!isDraft(stored)) {
        return err({
          kind: "malformed-stored-value",
          message: "what is stored under the draft key is not a card draft",
        });
      }
      return ok(stored);
    },

    async save(draft: CardDraft): Promise<Result<void, DraftStoreError>> {
      try {
        await storage.set(key, draft);
        return ok(undefined);
      } catch (cause) {
        return err(fail("write-failed", cause));
      }
    },

    async clear(): Promise<Result<void, DraftStoreError>> {
      try {
        await storage.remove(key);
        return ok(undefined);
      } catch (cause) {
        return err(fail("write-failed", cause));
      }
    },
  };
}
