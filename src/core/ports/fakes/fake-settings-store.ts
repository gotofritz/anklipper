import type { Result } from "../../result";
import { err, ok } from "../../result";
import type { Settings, SettingsStore, SettingsStoreError } from "../types";
import { DEFAULT_SETTINGS } from "../types";

export interface FakeSettingsStore extends SettingsStore {
  failWith(error: SettingsStoreError | undefined): void;
}

/** An in-memory `SettingsStore`, failable for the same reason as the others. */
export function createFakeSettingsStore(
  initial: Partial<Settings> = {},
): FakeSettingsStore {
  let stored: Settings = { ...DEFAULT_SETTINGS, ...initial };
  let failure: SettingsStoreError | undefined;

  function refuse<T>(): Result<T, SettingsStoreError> | undefined {
    return failure === undefined ? undefined : err(failure);
  }

  return {
    failWith(error: SettingsStoreError | undefined): void {
      failure = error;
    },

    async load(): Promise<Result<Settings, SettingsStoreError>> {
      return refuse<Settings>() ?? ok(stored);
    },

    async save(settings: Settings): Promise<Result<void, SettingsStoreError>> {
      const refused = refuse<void>();
      if (refused) return refused;

      stored = settings;
      return ok(undefined);
    },
  };
}
