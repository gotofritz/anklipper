import type { AnkiError, AnkiErrorKind } from "@/core/ports/types";
import type { Result } from "@/core/result";
import { err, ok } from "@/core/result";

import type { AnkiRequest } from "./types";

/**
 * HTTP to the local add-on, and the classification of everything that can go
 * wrong before a reply is parsed. Nothing above this file touches `fetch`;
 * nothing in it knows what any particular action means.
 */
export interface TransportConfig {
  readonly endpoint: string;
  readonly timeoutMs: number;
  /** Injected so tests never need a socket, and never a running Anki. */
  readonly fetch: typeof globalThis.fetch;
}

export interface Transport {
  /** The parsed JSON body, or why it could not be had. Never throws. */
  post(request: AnkiRequest): Promise<Result<unknown, AnkiError>>;
}

function failure(kind: AnkiErrorKind, message: string): AnkiError {
  return { kind, message };
}

export function createTransport(config: TransportConfig): Transport {
  return {
    async post(request: AnkiRequest): Promise<Result<unknown, AnkiError>> {
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
            ),
          );
        }

        // The request never left the browser. The plan expected a rejected
        // origin to be indistinguishable from a dead port here, and for the
        // extension to have to tell them apart; M4's manual pass found the
        // add-on serving a request whose origin was absent from
        // `webCorsOriginList`, so it does not enforce the allowlist
        // server-side, and a granted host permission exempts the extension
        // from the browser's enforcement anyway. Without that permission the
        // client answers `permission-missing` before anything is sent. So
        // there is nothing left for this to be ambiguous with.
        return err(
          failure("anki-not-running", `nothing answered on ${config.endpoint}`),
        );
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
          ),
        );
      }
    },
  };
}
