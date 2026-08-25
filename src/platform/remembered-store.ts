import type {
  Remembered,
  RememberedStore,
  RememberedStoreError,
  StickyFields,
} from "@/core/ports/types";
import { err, ok, type Result } from "@/core/result";

import type { StoragePort } from "./storage";

/**
 * What the extension remembers, under a key of its own (8.5).
 *
 * Separate from the settings key on purpose, and the separation is the whole
 * decision: "reset settings" must not erase the deck you last used, and the
 * deck you last used is not something you configured. Same storage area, same
 * degrade-on-read rule as the settings store — a value it cannot read is
 * simply a thing it does not remember.
 */
export const REMEMBERED_KEY = "remembered";

/**
 * The pins, read entry by entry (10.6). Same degrade-on-read rule as the rest
 * of this store: an entry that is not a note type's field text is a thing the
 * extension does not remember, never a reason to lose the ones that are.
 */
function readSticky(stored: unknown): StickyFields {
  if (typeof stored !== "object" || stored === null) return {};

  const pins: Record<string, Record<string, string>> = {};
  for (const [noteType, fields] of Object.entries(stored)) {
    if (typeof fields !== "object" || fields === null) continue;

    const kept: Record<string, string> = {};
    for (const [field, value] of Object.entries(fields)) {
      if (typeof value === "string") kept[field] = value;
    }
    if (Object.keys(kept).length > 0) pins[noteType] = kept;
  }

  return pins;
}

export function createStoredRemembered(storage: StoragePort): RememberedStore {
  return {
    async load(): Promise<Result<Remembered, RememberedStoreError>> {
      let stored: unknown;
      try {
        stored = await storage.get<unknown>(REMEMBERED_KEY);
      } catch (cause) {
        return err({
          kind: "read-failed",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }

      if (typeof stored !== "object" || stored === null) return ok({});

      const { lastDeck, sticky } = stored as Partial<Remembered>;
      const pins = readSticky(sticky);

      return ok({
        ...(typeof lastDeck === "string" && lastDeck.trim() !== ""
          ? { lastDeck }
          : {}),
        ...(Object.keys(pins).length === 0 ? {} : { sticky: pins }),
      });
    },

    async save(
      remembered: Remembered,
    ): Promise<Result<void, RememberedStoreError>> {
      try {
        await storage.set(REMEMBERED_KEY, remembered);
        return ok(undefined);
      } catch (cause) {
        return err({
          kind: "write-failed",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
}
