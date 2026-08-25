import type { Settings } from "@/core/settings";
import {
  DEFAULT_SETTINGS,
  readSettings,
  toSettingsPayload,
  unknownSettingKeys,
} from "@/core/settings";
import { runMigrations } from "@/core/settings-migrations";
import type { SettingsStore, SettingsStoreError } from "@/core/ports/types";
import { err, ok, type Result } from "@/core/result";

import type { StoragePort } from "./storage";

/**
 * `SettingsStore` over extension storage (M8).
 *
 * `StoragePort` is `storage.local`, not `sync` (8.4): deck and note-type names
 * are machine-specific, and `sync` adds quota and conflict rules for no MVP
 * benefit.
 *
 * The read path is migrate, then validate, then degrade — never trust (8.3).
 * The only failure it reports is storage itself refusing, because a value it
 * cannot read is a value it has a default for (8.2). An extension that will
 * not start because of its own settings is the failure this shape exists to
 * make impossible.
 */
export const SETTINGS_KEY = "settings";

function fail(
  kind: SettingsStoreError["kind"],
  cause: unknown,
): SettingsStoreError {
  return {
    kind,
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

export function createStoredSettings(storage: StoragePort): SettingsStore {
  async function read(): Promise<Result<unknown, SettingsStoreError>> {
    try {
      return ok(await storage.get<unknown>(SETTINGS_KEY));
    } catch (cause) {
      return err(fail("read-failed", cause));
    }
  }

  async function write(
    payload: Readonly<Record<string, unknown>>,
  ): Promise<Result<void, SettingsStoreError>> {
    try {
      await storage.set(SETTINGS_KEY, payload);
      return ok(undefined);
    } catch (cause) {
      return err(fail("write-failed", cause));
    }
  }

  return {
    async load(): Promise<Result<Settings, SettingsStoreError>> {
      const stored = await read();
      if (!stored.ok) return stored;

      return ok(readSettings(runMigrations(stored.value)));
    },

    async save(settings: Settings): Promise<Result<void, SettingsStoreError>> {
      // Read-modify-write, so a key this version does not own survives (8.2).
      // A newer version of the extension may have written one, and replacing
      // the payload wholesale would throw the user's choice away silently.
      const stored = await read();
      const carried = stored.ok ? unknownSettingKeys(stored.value) : {};

      return write({ ...carried, ...toSettingsPayload(settings) });
    },

    async reset(): Promise<Result<void, SettingsStoreError>> {
      // The settings key only. What is merely remembered lives elsewhere and
      // is not the user's configuration to reset (8.5).
      return this.save(DEFAULT_SETTINGS);
    },
  };
}

/**
 * The read that cannot fail (8.2).
 *
 * Most callers have nothing useful to do with a storage failure: a capture
 * still has to make a card, and the AnkiConnect adapter still has to be given
 * an endpoint. They get the shipped defaults. The options page is the one
 * caller that wants the failure, because it is about to write over whatever
 * could not be read — so it uses `load` directly.
 */
export async function loadSettingsOrDefaults(
  store: SettingsStore,
): Promise<Settings> {
  const stored = await store.load();

  return stored.ok ? stored.value : DEFAULT_SETTINGS;
}
