import type { CardDraft } from "@/core/draft";
import type { DraftStore, DraftStoreError } from "@/core/ports/types";
import { err, ok, type Result } from "@/core/result";

import type { StoragePort } from "./storage";

/** One draft at a time: the MVP captures, edits, and adds one card (M5). */
export const DRAFT_KEY = "draft";

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
 */
export function watchDraft(
  storage: StoragePort,
  listener: () => void,
): () => void {
  return storage.onChanged(DRAFT_KEY, listener);
}

export function createStoredDrafts(storage: StoragePort): DraftStore {
  return {
    async load(): Promise<Result<CardDraft | undefined, DraftStoreError>> {
      let stored: unknown;
      try {
        stored = await storage.get<unknown>(DRAFT_KEY);
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
        await storage.set(DRAFT_KEY, draft);
        return ok(undefined);
      } catch (cause) {
        return err(fail("write-failed", cause));
      }
    },

    async clear(): Promise<Result<void, DraftStoreError>> {
      try {
        await storage.remove(DRAFT_KEY);
        return ok(undefined);
      } catch (cause) {
        return err(fail("write-failed", cause));
      }
    },
  };
}
