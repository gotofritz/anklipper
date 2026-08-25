import { describe, expect, it } from "vitest";

import { SETTINGS_VERSION } from "./settings";
import type { SettingsMigration } from "./settings-migrations";
import {
  SETTINGS_MIGRATIONS,
  payloadVersion,
  runMigrations,
} from "./settings-migrations";

/** Two migrations, deliberately declared out of order (test 6). */
const ORDERED: readonly SettingsMigration[] = [
  {
    to: 2,
    migrate: (payload) => ({
      ...payload,
      steps: [...(payload.steps as string[]), "b"],
    }),
  },
  { to: 1, migrate: (payload) => ({ ...payload, steps: ["a"] }) },
];

describe("payloadVersion", () => {
  it("reads an unversioned payload as v0", () => {
    expect(payloadVersion({ defaultDeck: "x" })).toBe(0);
  });

  it("reads a stored version", () => {
    expect(payloadVersion({ version: 3 })).toBe(3);
  });

  it("reads a version that is not a whole number as v0", () => {
    expect(payloadVersion({ version: "1" })).toBe(0);
    expect(payloadVersion({ version: 1.5 })).toBe(0);
    expect(payloadVersion({ version: -1 })).toBe(0);
  });
});

describe("running migrations", () => {
  // Test 5 of the M8 plan.
  it("migrates a v0 payload to the current version", () => {
    const migrated = runMigrations({ defaultDeck: "Spanish" });

    expect(payloadVersion(migrated)).toBe(SETTINGS_VERSION);
    expect(migrated.defaultDeck).toBe("Spanish");
  });

  it("changes nothing when run a second time", () => {
    const once = runMigrations({ defaultDeck: "Spanish" });

    expect(runMigrations(once)).toEqual(once);
  });

  // Test 6.
  it("runs migrations in version order, whatever order they are declared in", () => {
    expect(runMigrations({ steps: [] }, ORDERED).steps).toEqual(["a", "b"]);
  });

  it("stamps the version each migration produces", () => {
    expect(payloadVersion(runMigrations({ steps: [] }, ORDERED))).toBe(2);
  });

  it("runs only the migrations above the stored version", () => {
    const from1 = runMigrations({ version: 1, steps: ["a"] }, ORDERED);

    expect(from1.steps).toEqual(["a", "b"]);
  });

  it("does not touch a payload written by a newer version", () => {
    const newer = { version: 99, futureThing: true };

    expect(runMigrations(newer, ORDERED)).toEqual(newer);
  });

  it("starts from an empty payload when what is stored is not one", () => {
    expect(runMigrations("wiped")).toEqual({ version: SETTINGS_VERSION });
    expect(runMigrations(undefined)).toEqual({ version: SETTINGS_VERSION });
  });

  // The plan's first risk: a migration reading today's defaults instead of
  // the shape it was written for breaks silently, later and elsewhere.
  it("never mutates the payload it is given", () => {
    const stored = { defaultDeck: "Spanish" };
    const before = JSON.stringify(stored);

    runMigrations(stored);

    expect(JSON.stringify(stored)).toBe(before);
  });
});

describe("the shipped migrations", () => {
  it("reach the current schema version and no further (8.1)", () => {
    expect(SETTINGS_MIGRATIONS.map((one) => one.to)).toEqual([1]);
    expect(Math.max(...SETTINGS_MIGRATIONS.map((one) => one.to))).toBe(
      SETTINGS_VERSION,
    );
  });
});
