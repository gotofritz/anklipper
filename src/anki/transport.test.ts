import { describe, expect, it, vi } from "vitest";

import { isErr } from "@/core/result";

import { createTransport } from "./transport";

const ENDPOINT = "http://127.0.0.1:8765";

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function transportWith(
  handler: (call: FetchCall) => Promise<Response>,
  options: { readonly timeoutMs?: number } = {},
) {
  const calls: FetchCall[] = [];
  const fetch = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof globalThis.fetch;

  return {
    calls,
    transport: createTransport({
      endpoint: ENDPOINT,
      timeoutMs: options.timeoutMs ?? 5_000,
      fetch,
    }),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** What a browser throws when the request never leaves it — a dead port or a blocked one. */
function networkFailure(): Error {
  return new TypeError("NetworkError when attempting to fetch resource.");
}

describe("createTransport", () => {
  it("posts the body to the AnkiConnect endpoint and returns the parsed reply", async () => {
    const { transport, calls } = transportWith(async () =>
      jsonResponse({ result: ["Default"], error: null }),
    );

    const reply = await transport.post({ action: "deckNames", version: 6 });

    expect(reply).toEqual({
      ok: true,
      value: { result: ["Default"], error: null },
    });
    expect(calls[0]?.url).toBe(ENDPOINT);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"action":"deckNames","version":6}');
  });

  it("sends no request headers, so the call stays a simple one and never preflights", async () => {
    const { transport, calls } = transportWith(async () =>
      jsonResponse({ result: null, error: null }),
    );

    await transport.post({ action: "version", version: 6 });

    expect(calls[0]?.init.headers).toBeUndefined();
  });

  it("reads a failed fetch as anki-not-running", async () => {
    const { transport } = transportWith(async () => {
      throw networkFailure();
    });

    const reply = await transport.post({ action: "version", version: 6 });

    expect(isErr(reply) && reply.error.kind).toBe("anki-not-running");
  });

  it("makes one request, and no second one to disambiguate it", async () => {
    // AnkiConnect does not enforce webCorsOriginList server-side, and a
    // granted host permission exempts the extension from the browser's CORS
    // check — so a failed fetch has nothing left to be confused with. See the
    // archived M4 plan.
    const { transport, calls } = transportWith(async () => {
      throw networkFailure();
    });

    await transport.post({ action: "version", version: 6 });

    expect(calls).toHaveLength(1);
  });

  it("reads a readable non-2xx reply as addon-missing — something answered, but not AnkiConnect", async () => {
    const { transport } = transportWith(
      async () => new Response("<html>hello</html>", { status: 404 }),
    );

    const reply = await transport.post({ action: "version", version: 6 });

    expect(isErr(reply) && reply.error.kind).toBe("addon-missing");
  });

  it("reads a 200 that is not JSON as addon-missing", async () => {
    const { transport } = transportWith(async () => new Response("not json"));

    const reply = await transport.post({ action: "version", version: 6 });

    expect(isErr(reply) && reply.error.kind).toBe("addon-missing");
  });

  it("gives up on a reply that never arrives, and reports timeout", async () => {
    const { transport } = transportWith(
      ({ init }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }),
      { timeoutMs: 5 },
    );

    const reply = await transport.post({ action: "version", version: 6 });

    expect(isErr(reply) && reply.error.kind).toBe("timeout");
  });
});
