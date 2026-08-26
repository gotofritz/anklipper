import type {
  AnkiClient,
  AnkiDiagnostics,
  AnkiError,
} from "@/core/ports/types";

/**
 * The connection report, and the onboarding built on it (9.1, 9.3, 9.4).
 *
 * The view-model between the diagnostics view and the ports, on M6's rule
 * (6.2): nothing here imports `browser.*`, Svelte components, or the
 * AnkiConnect adapter. It is handed the `AnkiClient` port, which in tests is
 * M3's in-memory fake.
 *
 * What it exists to say is that a check that has not been made is not a check
 * that failed (9.1) — the default state of a fresh install is broken through
 * no fault of the user, and telling them so before anyone has looked would be
 * a lie either way round.
 */
export type ConnectionState =
  /** Nobody has looked yet. Not a failure, and not a connection. */
  | { readonly kind: "unchecked" }
  | { readonly kind: "checking" }
  | { readonly kind: "connected"; readonly apiVersion: number }
  | { readonly kind: "failed"; readonly cause: AnkiError };

export interface DiagnosticsDeps {
  readonly anki: AnkiClient;
  /**
   * How the adapter is configured, for the report: the endpoint in use, the
   * running extension's origin, and whether a key is set — never the key
   * (4.8). Absent where nothing can say, which costs the report those lines
   * and never the cause.
   */
  readonly describe?: () => Promise<AnkiDiagnostics>;
  /**
   * Ask the browser for the host permission (9.6). Called from a click and
   * from nowhere else: Firefox MV3 grants none at install and refuses a
   * `permissions.request` made outside a user input handler. Answers whether
   * it was granted.
   */
  readonly grantAccess?: () => Promise<boolean>;
}

export interface DiagnosticsModel {
  readonly state: ConnectionState;
  /** How the connection was made, once a check has been made. */
  readonly facts: AnkiDiagnostics | undefined;
  /**
   * Whether Anki has answered at least once in this sidebar's life.
   *
   * The difference between a first-run user, who needs to be walked through
   * setting the connection up, and someone mid-session whose Anki has just
   * closed, who needs the cause and nothing else (9.4, test 8).
   */
  readonly everConnected: boolean;
  /**
   * Whether a press could fix this (9.7). True for exactly one cause: the
   * host permission, which is the browser's to grant and not Anki's. Every
   * other cause is fixed somewhere else, and a button here would be a loop.
   */
  readonly canGrant: boolean;
  check(): Promise<void>;
  /** Ask for the permission, and re-check if the browser gave it. */
  grant(): Promise<void>;
}

export function createDiagnosticsModel(
  deps: DiagnosticsDeps,
): DiagnosticsModel {
  let state = $state.raw<ConnectionState>({ kind: "unchecked" });
  let facts = $state.raw<AnkiDiagnostics | undefined>(undefined);
  let everConnected = $state.raw(false);

  /** Latest-wins: a re-check pressed twice must not be settled by the first. */
  let run = 0;

  async function check(): Promise<void> {
    const mine = ++run;
    state = { kind: "checking" };

    // Read alongside the probe rather than after it: the endpoint is part of
    // what a failure has to name, and a failure is when it matters most.
    const [connection, described] = await Promise.all([
      deps.anki.probe(),
      deps.describe?.(),
    ]);
    if (mine !== run) return;

    if (described !== undefined) facts = described;
    if (connection.kind === "connected") {
      everConnected = true;
      state = { kind: "connected", apiVersion: connection.apiVersion };
      return;
    }

    state = { kind: "failed", cause: connection.cause };
  }

  async function grant(): Promise<void> {
    if (deps.grantAccess === undefined) return;
    if (state.kind !== "failed" || state.cause.kind !== "permission-missing") {
      return;
    }

    // Declined is the user's answer, not an error: the cause stands, and so
    // does the button, because they may well press it again.
    if (await deps.grantAccess()) await check();
  }

  return {
    get state() {
      return state;
    },
    get facts() {
      return facts;
    },
    get everConnected() {
      return everConnected;
    },
    get canGrant() {
      return (
        deps.grantAccess !== undefined &&
        state.kind === "failed" &&
        state.cause.kind === "permission-missing"
      );
    },
    check,
    grant,
  };
}
