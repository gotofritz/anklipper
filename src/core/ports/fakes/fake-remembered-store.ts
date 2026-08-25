import type { Result } from "../../result";
import { err, ok } from "../../result";
import type {
  Remembered,
  RememberedStore,
  RememberedStoreError,
} from "../types";

export interface FakeRememberedStore extends RememberedStore {
  failWith(error: RememberedStoreError | undefined): void;
}

/**
 * An in-memory `RememberedStore`, failable for the same reason as the others:
 * a fake that only ever succeeds hides exactly the paths the error taxonomy
 * exists for.
 */
export function createFakeRememberedStore(
  initial: Remembered = {},
): FakeRememberedStore {
  let stored: Remembered = { ...initial };
  let failure: RememberedStoreError | undefined;

  function refuse<T>(): Result<T, RememberedStoreError> | undefined {
    return failure === undefined ? undefined : err(failure);
  }

  return {
    failWith(error: RememberedStoreError | undefined): void {
      failure = error;
    },

    async load(): Promise<Result<Remembered, RememberedStoreError>> {
      return refuse<Remembered>() ?? ok(stored);
    },

    async save(
      remembered: Remembered,
    ): Promise<Result<void, RememberedStoreError>> {
      const refused = refuse<void>();
      if (refused) return refused;

      stored = { ...remembered };
      return ok(undefined);
    },
  };
}
