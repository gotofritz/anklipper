import type { CardDraft } from "../../draft";
import type { Result } from "../../result";
import { err, ok } from "../../result";
import type { DraftStore, DraftStoreError } from "../types";

export interface FakeDraftStore extends DraftStore {
  failWith(error: DraftStoreError | undefined): void;
}

/** An in-memory `DraftStore`, failable so consumers can test their error path. */
export function createFakeDraftStore(initial?: CardDraft): FakeDraftStore {
  let stored: CardDraft | undefined = initial;
  let failure: DraftStoreError | undefined;

  function refuse<T>(): Result<T, DraftStoreError> | undefined {
    return failure === undefined ? undefined : err(failure);
  }

  return {
    failWith(error: DraftStoreError | undefined): void {
      failure = error;
    },

    async load(): Promise<Result<CardDraft | undefined, DraftStoreError>> {
      return refuse<CardDraft | undefined>() ?? ok(stored);
    },

    async save(draft: CardDraft): Promise<Result<void, DraftStoreError>> {
      const refused = refuse<void>();
      if (refused) return refused;

      stored = draft;
      return ok(undefined);
    },

    async clear(): Promise<Result<void, DraftStoreError>> {
      const refused = refuse<void>();
      if (refused) return refused;

      stored = undefined;
      return ok(undefined);
    },
  };
}
