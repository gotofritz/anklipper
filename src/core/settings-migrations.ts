import type { SettingsPayload } from "./settings";
import { SETTINGS_VERSION } from "./settings";

/**
 * Stored settings, brought up to the shape this version reads (8.1).
 *
 * Versioning is here from the first release rather than added once there is
 * data to guess about, and the runner is exercised from the first release for
 * the same reason: machinery that has never run is machinery nobody knows the
 * shape of.
 *
 * The rule that keeps this working is that **a migration is a pure function of
 * its input payload**. One that reads today's defaults produces a different
 * result next year, which is a bug that only appears in the collections of
 * users who skipped a version — the hardest kind to reproduce.
 */
export interface SettingsMigration {
  /** The version this migration produces. Runs when the payload is below it. */
  readonly to: number;
  migrate(payload: SettingsPayload): SettingsPayload;
}

/**
 * v0 → v1. There is no released v0 *shape*: M8 is the first version that
 * stores settings at all, so an unversioned payload is a hand edit, a
 * pre-release build, or something else entirely under the key. Its whole job
 * is to stamp the version, which gives every later migration a floor to start
 * from — and gets the runner exercised before anything depends on it.
 *
 * It deliberately keeps every key it does not understand: `readSettings`
 * decides what is readable, and a newer version may own the rest (8.2).
 */
const TO_V1: SettingsMigration = {
  to: 1,
  migrate: (payload) => payload,
};

export const SETTINGS_MIGRATIONS: readonly SettingsMigration[] = [TO_V1];

/** An unversioned payload is v0 — which is what pre-versioning data looks like. */
export function payloadVersion(payload: SettingsPayload): number {
  const version = payload.version;

  return typeof version === "number" &&
    Number.isInteger(version) &&
    version >= 0
    ? version
    : 0;
}

/**
 * Bring a stored payload up to date.
 *
 * The runner stamps the version, not the migrations: an invariant every
 * migration author has to remember is one that eventually gets forgotten.
 * A payload from a **newer** version is left exactly as it is — there is no
 * downgrade, and `readSettings` will take what it recognises and default the
 * rest (8.2).
 */
export function runMigrations(
  stored: unknown,
  migrations: readonly SettingsMigration[] = SETTINGS_MIGRATIONS,
): SettingsPayload {
  const payload: SettingsPayload =
    typeof stored === "object" && stored !== null && !Array.isArray(stored)
      ? { ...(stored as SettingsPayload) }
      : {};

  const from = payloadVersion(payload);
  const pending = [...migrations]
    .sort((a, b) => a.to - b.to)
    .filter((migration) => migration.to > from);

  if (pending.length === 0) {
    // Nothing to run: either it is current, or it is from a version that
    // knows more than this one does. Both are left alone — except that an
    // unstamped payload with no migrations to run still needs a version.
    return from === 0 ? { ...payload, version: SETTINGS_VERSION } : payload;
  }

  return pending.reduce<SettingsPayload>(
    (current, migration) => ({
      ...migration.migrate(current),
      version: migration.to,
    }),
    payload,
  );
}
