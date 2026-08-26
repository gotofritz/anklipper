import { describe, expect, it, vi } from "vitest";

import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import type { AnkiDiagnostics, AnkiError } from "@/core/ports/types";
import { BASIC } from "@/fixtures/note-types";

import { createDiagnosticsModel } from "./diagnostics-model.svelte";

const ORIGIN = "moz-extension://8b7c1f2e-0a3d-4c5b-9e6f-1a2b3c4d5e6f";

const FACTS: AnkiDiagnostics = {
  endpoint: "http://127.0.0.1:8765",
  origin: ORIGIN,
  apiKeyConfigured: false,
  timeoutMs: 5_000,
};

function modelFor(
  overrides: Partial<Parameters<typeof createDiagnosticsModel>[0]> = {},
) {
  const anki = createFakeAnkiClient({
    decks: ["Geography"],
    noteTypes: [BASIC],
    apiVersion: 6,
  });

  return {
    anki,
    model: createDiagnosticsModel({
      anki,
      describe: async () => FACTS,
      ...overrides,
    }),
  };
}

const NOT_RUNNING: AnkiError = {
  kind: "anki-not-running",
  message: "nothing answered on http://127.0.0.1:8765",
};

const NO_PERMISSION: AnkiError = {
  kind: "permission-missing",
  message: "the extension has not been granted access to the local Anki",
};

describe("what the report knows before it has checked", () => {
  it("says the check has not been made, rather than that it failed", () => {
    const { model } = modelFor();

    expect(model.state).toEqual({ kind: "unchecked" });
  });

  it("has nothing to report about a connection nobody has asked about", () => {
    const { model } = modelFor();

    expect(model.facts).toBeUndefined();
    expect(model.everConnected).toBe(false);
  });
});

describe("checking the connection", () => {
  it("reports the version Anki answered with", async () => {
    const { model } = modelFor();

    await model.check();

    expect(model.state).toEqual({ kind: "connected", apiVersion: 6 });
  });

  it("reports the cause when it cannot connect, not a boolean", async () => {
    const { anki, model } = modelFor();
    anki.failWith(NOT_RUNNING);

    await model.check();

    expect(model.state).toEqual({ kind: "failed", cause: NOT_RUNNING });
  });

  it("says it is checking while the probe is outstanding", async () => {
    let answer = (): void => {};
    const { anki, model } = modelFor();
    const probe = vi.spyOn(anki, "probe").mockImplementation(
      async () =>
        new Promise((resolve) => {
          answer = () => {
            resolve({ kind: "connected", apiVersion: 6 });
          };
        }),
    );

    const checking = model.check();
    expect(model.state).toEqual({ kind: "checking" });

    answer();
    await checking;
    expect(model.state).toEqual({ kind: "connected", apiVersion: 6 });
    probe.mockRestore();
  });

  it("reports the endpoint and origin it used", async () => {
    const { model } = modelFor();

    await model.check();

    expect(model.facts).toEqual(FACTS);
  });

  /**
   * The report is the one thing users paste into public issues (4.8), and the
   * key is a credential for a service that can delete a collection.
   */
  it("reports whether a key is set and never the key itself", async () => {
    const secret = "s3cret-key";
    const { model } = modelFor({
      describe: async () => ({ ...FACTS, apiKeyConfigured: true }),
    });

    await model.check();

    expect(model.facts?.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(model.facts)).not.toContain(secret);
  });

  it("still reports the cause when it cannot say how it was configured", async () => {
    const { anki, model } = modelFor({ describe: undefined });
    anki.failWith(NOT_RUNNING);

    await model.check();

    expect(model.state).toEqual({ kind: "failed", cause: NOT_RUNNING });
    expect(model.facts).toBeUndefined();
  });
});

/** Test 3: the failure recurs whenever Anki closes, so re-checking is the flow. */
describe("re-checking after the fix", () => {
  it("moves to connected without anything being reloaded", async () => {
    const { anki, model } = modelFor();
    anki.failWith(NOT_RUNNING);
    await model.check();
    expect(model.state.kind).toBe("failed");

    anki.failWith(undefined);
    await model.check();

    expect(model.state).toEqual({ kind: "connected", apiVersion: 6 });
  });

  it("names the new cause when a check that was passing starts failing", async () => {
    const { anki, model } = modelFor();
    await model.check();

    anki.failWith(NOT_RUNNING);
    await model.check();

    expect(model.state).toEqual({ kind: "failed", cause: NOT_RUNNING });
  });
});

/**
 * Test 8. A connection that has been had is the difference between guidance a
 * first-run user needs and a fault report someone mid-session needs.
 */
describe("what a connection that once worked settles", () => {
  it("remembers that it connected, even once it stops", async () => {
    const { anki, model } = modelFor();
    await model.check();
    expect(model.everConnected).toBe(true);

    anki.failWith(NOT_RUNNING);
    await model.check();

    expect(model.everConnected).toBe(true);
  });

  it("does not claim a connection it never had", async () => {
    const { anki, model } = modelFor();
    anki.failWith(NOT_RUNNING);

    await model.check();

    expect(model.everConnected).toBe(false);
  });
});

/**
 * 9.6. Firefox MV3 grants no host permission at install, and
 * `permissions.request` is refused outside a user gesture — so the ask is a
 * button, and this is what it calls.
 */
describe("asking the browser for access", () => {
  it("offers the ask only for the cause a press can fix", async () => {
    const { anki, model } = modelFor({ grantAccess: async () => true });

    anki.failWith(NO_PERMISSION);
    await model.check();
    expect(model.canGrant).toBe(true);

    anki.failWith(NOT_RUNNING);
    await model.check();
    expect(model.canGrant).toBe(false);
  });

  it("offers no ask when nothing can make one", async () => {
    const { anki, model } = modelFor();

    anki.failWith(NO_PERMISSION);
    await model.check();

    expect(model.canGrant).toBe(false);
  });

  it("re-checks once the browser has granted it", async () => {
    const anki = createFakeAnkiClient({ apiVersion: 6 });
    anki.failWith(NO_PERMISSION);
    const model = createDiagnosticsModel({
      anki,
      describe: async () => FACTS,
      grantAccess: async () => {
        anki.failWith(undefined);
        return true;
      },
    });
    await model.check();

    await model.grant();

    expect(model.state).toEqual({ kind: "connected", apiVersion: 6 });
  });

  /**
   * Declining is an answer, not an error: the message and the button both
   * stand, because the user may well press it again.
   */
  it("leaves the cause standing when the user declines", async () => {
    const { anki, model } = modelFor({ grantAccess: async () => false });
    anki.failWith(NO_PERMISSION);
    await model.check();

    await model.grant();

    expect(model.state).toEqual({ kind: "failed", cause: NO_PERMISSION });
    expect(model.canGrant).toBe(true);
  });

  it("does not probe again when there was nothing to ask", async () => {
    const { anki, model } = modelFor();
    const probe = vi.spyOn(anki, "probe");

    await model.grant();

    expect(probe).not.toHaveBeenCalled();
    expect(model.state).toEqual({ kind: "unchecked" });
    probe.mockRestore();
  });
});
