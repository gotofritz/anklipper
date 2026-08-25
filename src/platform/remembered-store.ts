import type {
  Remembered,
  RememberedStore,
  RememberedStoreError,
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

      const lastDeck = (stored as Partial<Remembered>).lastDeck;
      return ok(
        typeof lastDeck === "string" && lastDeck.trim() !== ""
          ? { lastDeck }
          : {},
      );
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
