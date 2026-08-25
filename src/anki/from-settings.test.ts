import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "@/core/settings";
import { isErr } from "@/core/result";
import { createDraft } from "@/core/draft";
import { BASIC } from "@/fixtures/note-types";

import { describeAnkiConnection } from "./client";
import { ankiConfigFrom, createSettingsAnkiClient } from "./from-settings";

const ORIGIN = "moz-extension://11111111-2222-3333-4444-555555555555";

const DRAFT = createDraft({
  deck: "Default",
  noteType: BASIC,
  fields: { Front: "front", Back: "back" },
  source: {
    text: "front",
    context: "",
    url: "https://example.test/a",
    title: "A",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  generation: { name: "basic", version: 1 },
});

/**
 * A stubbed `fetch`, typed as one: `fetch.mock.calls` is what these cases
 * assert on, and an untyped `vi.fn` gives it an empty tuple.
 */
function replying(body: unknown) {
  return vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("ankiConfigFrom", () => {
  it("takes the endpoint and timeout the user configured", () => {
    const config = ankiConfigFrom(
      {
        ...DEFAULT_SETTINGS,
        endpoint: "http://127.0.0.1:9999",
        timeoutMs: 250,
      },
      { origin: ORIGIN },
    );

    expect(config.endpoint).toBe("http://127.0.0.1:9999");
    expect(config.timeoutMs).toBe(250);
  });

  it("carries a configured API key, and omits an unset one", () => {
    expect(
      ankiConfigFrom(
        { ...DEFAULT_SETTINGS, apiKey: "s3cret" },
        { origin: ORIGIN },
      ).apiKey,
    ).toBe("s3cret");
    expect(
      ankiConfigFrom(DEFAULT_SETTINGS, { origin: ORIGIN }).apiKey,
    ).toBeUndefined();
  });

  // Test 11 of the M8 plan, on the half a user is asked to paste into an issue.
  it("never puts the key into diagnostics (8.5a)", () => {
    const diagnostics = describeAnkiConnection(
      ankiConfigFrom(
        { ...DEFAULT_SETTINGS, apiKey: "s3cret" },
        { origin: ORIGIN },
      ),
    );

    expect(JSON.stringify(diagnostics)).not.toContain("s3cret");
    expect(diagnostics.apiKeyConfigured).toBe(true);
  });
});

describe("createSettingsAnkiClient", () => {
  // Test 10.
  it("puts a configured API key into the request it sends", async () => {
    const fetch = replying({ result: 6, error: null });
    const client = createSettingsAnkiClient({
      loadSettings: async () => ({ ...DEFAULT_SETTINGS, apiKey: "s3cret" }),
      origin: ORIGIN,
      fetch,
    });

    await client.probe();

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as {
      key?: string;
    };
    expect(body.key).toBe("s3cret");
  });

  it("sends no key at all when none is configured", async () => {
    const fetch = replying({ result: 6, error: null });
    const client = createSettingsAnkiClient({
      loadSettings: async () => DEFAULT_SETTINGS,
      origin: ORIGIN,
      fetch,
    });

    await client.probe();

    expect(
      JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)),
    ).not.toHaveProperty("key");
  });

  // The M8 done-when: the endpoint setting is honoured by the M4 adapter.
  it("sends to the endpoint the settings name", async () => {
    const fetch = replying({ result: ["Default"], error: null });
    const client = createSettingsAnkiClient({
      loadSettings: async () => ({
        ...DEFAULT_SETTINGS,
        endpoint: "http://127.0.0.1:9999",
      }),
      origin: ORIGIN,
      fetch,
    });

    await client.deckNames();

    expect(fetch.mock.calls[0]?.[0]).toBe("http://127.0.0.1:9999");
  });

  it("re-reads the settings on every call, so a change needs no reload", async () => {
    const fetch = replying({ result: 6, error: null });
    let endpoint = "http://127.0.0.1:8765";
    const client = createSettingsAnkiClient({
      loadSettings: async () => ({ ...DEFAULT_SETTINGS, endpoint }),
      origin: ORIGIN,
      fetch,
    });

    await client.probe();
    endpoint = "http://127.0.0.1:9999";
    await client.probe();

    expect(fetch.mock.calls[1]?.[0]).toBe("http://127.0.0.1:9999");
  });

  // Test 11's other half: an error payload is something the user is shown.
  it("keeps the key out of the error it reports when nothing answers", async () => {
    const client = createSettingsAnkiClient({
      loadSettings: async () => ({
        ...DEFAULT_SETTINGS,
        apiKey: "s3cret",
        endpoint: "http://127.0.0.1:9999",
      }),
      origin: ORIGIN,
      fetch: async () => {
        throw new TypeError("network error");
      },
    });

    const added = await client.addNote(DRAFT);

    expect(isErr(added)).toBe(true);
    expect(JSON.stringify(added)).not.toContain("s3cret");
  });

  it("checks the host permission before it reads anything (2.7)", async () => {
    const fetch = replying({ result: 6, error: null });
    const client = createSettingsAnkiClient({
      loadSettings: async () => DEFAULT_SETTINGS,
      origin: ORIGIN,
      hasHostPermission: async () => false,
      fetch,
    });

    const probed = await client.probe();

    expect(probed.kind === "unavailable" && probed.cause.kind).toBe(
      "permission-missing",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  // The endpoint is a setting, so the permission is not a constant: a
  // configured port the extension holds no permission for would otherwise
  // fail as `anki-not-running` and send the user to start a running Anki.
  it("asks about the configured endpoint, not a fixed one", async () => {
    const asked: string[] = [];
    const client = createSettingsAnkiClient({
      loadSettings: async () => ({
        ...DEFAULT_SETTINGS,
        endpoint: "http://127.0.0.1:9999",
      }),
      origin: ORIGIN,
      hasHostPermission: async (endpoint) => {
        asked.push(endpoint);
        return true;
      },
      fetch: replying({ result: 6, error: null }),
    });

    await client.probe();

    expect(asked).toEqual(["http://127.0.0.1:9999"]);
  });

  it("answers every port method through the configured adapter", async () => {
    const fetch = replying({ result: [true], error: null });
    const client = createSettingsAnkiClient({
      loadSettings: async () => DEFAULT_SETTINGS,
      origin: ORIGIN,
      fetch,
    });

    const answer = await client.canAddNote(DRAFT);

    expect(answer.ok && answer.value).toBe(true);
  });

  it("reads note types through the configured adapter", async () => {
    const replies = [
      { result: ["Basic"], error: null },
      { result: ["Front", "Back"], error: null },
      {
        result: { Card1: { Front: "{{Front}}", Back: "{{Back}}" } },
        error: null,
      },
    ];
    let call = 0;
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(replies[call++]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const client = createSettingsAnkiClient({
      loadSettings: async () => DEFAULT_SETTINGS,
      origin: ORIGIN,
      fetch,
    });

    const noteTypes = await client.noteTypes();

    expect(noteTypes.ok && noteTypes.value.map((one) => one.name)).toEqual([
      "Basic",
    ]);
  });
});
