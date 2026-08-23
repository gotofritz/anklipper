import type { AnkiErrorKind } from "@/core/ports/types";
import type { Result } from "@/core/result";
import { err, ok } from "@/core/result";

import type { AnkiFailure, AnkiRequest } from "./types";

/**
 * HTTP to the local add-on, and the classification of everything that can go
 * wrong before a reply is parsed. Nothing above this file touches `fetch`;
 * nothing in it knows what any particular action means.
 */
export interface TransportConfig {
  readonly endpoint: string;
  /** The extension's own origin, read at runtime (P8) — never a constant here. */
  readonly origin: string;
  readonly timeoutMs: number;
  /** Injected so tests never need a socket, and never a running Anki. */
  readonly fetch: typeof globalThis.fetch;
}

export interface Transport {
  /** The parsed JSON body, or why it could not be had. Never throws. */
  post(request: AnkiRequest): Promise<Result<unknown, AnkiFailure>>;
}

function failure(
  kind: AnkiErrorKind,
  message: string,
  extra: {
    readonly confident: boolean;
    readonly alternatives: readonly AnkiErrorKind[];
    readonly origin?: string;
  },
): AnkiFailure {
  return { kind, message, ...extra };
}

export function createTransport(config: TransportConfig): Transport {
  /**
   * Is *anything* listening on the port?
   *
   * A rejected origin and a dead port are the same failed `fetch` from the
   * browser's side: for a non-allowlisted origin the add-on answers with
   * `Access-Control-Allow-Origin: http://localhost`, so the extension cannot
   * read even the 403. A `no-cors` request sidesteps that — it resolves to an
   * opaque response when something answers and rejects when nothing is there,
   * which separates the two without needing a readable body.
   *
   * Opaque means opaque, so this is evidence rather than proof, and the caller
   * says as much in the `confident` flag it passes on.
   */
  async function somethingIsListening(): Promise<boolean> {
    try {
      await config.fetch(config.endpoint, {
        method: "POST",
        mode: "no-cors",
        body: "{}",
      });
      return true;
    } catch {
      return false;
    }
  }

  async function classifyNetworkFailure(): Promise<AnkiFailure> {
    return (await somethingIsListening())
      ? failure(
          "origin-rejected",
          `AnkiConnect is running but refused this extension: add ${config.origin} to webCorsOriginList`,
          {
            confident: false,
            alternatives: ["addon-missing"],
            origin: config.origin,
          },
        )
      : failure("anki-not-running", `nothing answered on ${config.endpoint}`, {
          confident: false,
          alternatives: ["origin-rejected"],
        });
  }

  return {
    async post(request: AnkiRequest): Promise<Result<unknown, AnkiFailure>> {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, config.timeoutMs);

      let response: Response;
      try {
        // No headers at all, deliberately. A `Content-Type: application/json`
        // would make this a preflighted request, and the add-on's answer to
        // the OPTIONS is one more thing to get wrong; without them the call is
        // a CORS-simple request, and AnkiConnect parses the body as JSON
        // regardless of what the browser labels it.
        response = await config.fetch(config.endpoint, {
          method: "POST",
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch {
        // Our own abort, not a network problem: Anki can accept the connection
        // and never answer, and reporting that as a dead port would send the
        // user to fix something that is not broken.
        if (controller.signal.aborted) {
          return err(
            failure(
              "timeout",
              `AnkiConnect did not answer within ${config.timeoutMs}ms`,
              {
                confident: true,
                alternatives: [],
              },
            ),
          );
        }

        return err(await classifyNetworkFailure());
      } finally {
        clearTimeout(timer);
      }

      // Readable, so something answered — and AnkiConnect answers 200 to
      // everything it understands, including its own errors.
      if (!response.ok) {
        return err(
          failure(
            "addon-missing",
            `${config.endpoint} answered ${response.status}, which AnkiConnect never does`,
            { confident: true, alternatives: [] },
          ),
        );
      }

      try {
        return ok((await response.json()) as unknown);
      } catch {
        return err(
          failure(
            "addon-missing",
            `${config.endpoint} answered with something that is not JSON`,
            {
              confident: true,
              alternatives: [],
            },
          ),
        );
      }
    },
  };
}
