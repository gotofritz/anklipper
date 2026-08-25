import { describe, expect, it, vi } from "vitest";

import { createDraft } from "@/core/draft";
import type { AnkiError } from "@/core/ports/types";
import type { Result } from "@/core/result";
import { isErr, isOk } from "@/core/result";
import { BASIC, CLOZE } from "@/fixtures/note-types";

import { createAnkiClient, describeAnkiConnection } from "./client";

const ORIGIN = "moz-extension://11111111-2222-3333-4444-555555555555";
const API_KEY = "hunter2-not-in-any-output";

interface Sent {
  readonly action: string;
  readonly version: number;
  readonly params?: Record<string, unknown>;
  readonly key?: string;
}

type Reply = (sent: Sent) => unknown;

function clientWith(
  reply: Reply,
  options: { readonly apiKey?: string; readonly hostPermission?: boolean } = {},
) {
  const sent: Sent[] = [];
  const fetch = vi.fn(async (_url: string | URL, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body)) as Sent;
    sent.push(body);
    const answer = reply(body);
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer));
  }) as unknown as typeof globalThis.fetch;

  const client = createAnkiClient({
    origin: ORIGIN,
    timeoutMs: 50,
    fetch,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    hasHostPermission: async () => options.hostPermission ?? true,
  });

  return { client, sent, fetch };
}

const SOURCE = {
  text: "the capital of France is Paris",
  context: "",
  url: "https://example.test/france",
  title: "France",
};

function basicDraft() {
  return createDraft({
    deck: "Geography",
    noteType: BASIC,
    fields: { Front: "capital of France", Back: "Paris" },
    tags: ["geography"],
    source: SOURCE,
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "test", version: 1 },
  });
}

function clozeDraft(text: string) {
  return createDraft({
    deck: "Geography",
    noteType: CLOZE,
    fields: { Text: text, "Back Extra": "" },
    source: SOURCE,
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "test", version: 1 },
  });
}

/** What a browser throws when the request never leaves it. */
function networkFailure(): Error {
  return new TypeError("NetworkError when attempting to fetch resource.");
}

function ok(result: unknown): unknown {
  return { result, error: null };
}

describe("addNote", () => {
  it("yields the new note id from a valid reply (1)", async () => {
    const { client } = clientWith(() => ok(1496198395707));

    const added = await client.addNote(basicDraft());

    expect(added).toEqual({ ok: true, value: 1496198395707 });
  });

  it("sends the documented params, tags included (8)", async () => {
    const { client, sent } = clientWith(() => ok(1));

    await client.addNote(basicDraft());

    expect(sent[0]).toMatchObject({
      action: "addNote",
      params: {
        note: {
          deckName: "Geography",
          modelName: "Basic",
          fields: { Front: "capital of France", Back: "Paris" },
          tags: ["geography"],
        },
      },
    });
  });

  it("leaves cloze markup untouched on the wire (11)", async () => {
    const text = "the {{c1::capital}} of France is {{c2::Paris}}";
    const { client, sent } = clientWith(() => ok(1));

    await client.addNote(clozeDraft(text));

    const params = sent[0]?.params as {
      note: { fields: Record<string, string> };
    };
    expect(params.note.fields.Text).toBe(text);
  });

  it("surfaces an AnkiConnect error string as api-error carrying it (2)", async () => {
    const { client } = clientWith(() => ({
      result: null,
      error: "collection is not available",
    }));

    const added = await client.addNote(basicDraft());

    expect(isErr(added) && added.error).toEqual({
      kind: "api-error",
      message: "collection is not available",
    });
  });

  it("rejects a 200 of the wrong shape as malformed-response rather than casting it (5)", async () => {
    const { client } = clientWith(() => ok("not a note id"));

    const added = await client.addNote(basicDraft());

    expect(isErr(added) && added.error.kind).toBe("malformed-response");
  });
});

describe("connection causes", () => {
  it("reads a refused connection as anki-not-running (3)", async () => {
    const sent: unknown[] = [];
    const fetch = vi.fn(async (_url: string | URL, init: RequestInit = {}) => {
      sent.push(init);
      throw networkFailure();
    }) as unknown as typeof globalThis.fetch;

    const client = createAnkiClient({
      origin: ORIGIN,
      fetch,
      hasHostPermission: async () => true,
    });

    const probed = await client.probe();

    expect(probed).toMatchObject({
      kind: "unavailable",
      cause: { kind: "anki-not-running" },
    });
  });

  it("reads a failed request as anki-not-running, whatever blocked it (4)", async () => {
    const { client } = clientWith(() => networkFailure());

    const probed = await client.probe();

    expect(probed).toMatchObject({
      kind: "unavailable",
      cause: { kind: "anki-not-running" },
    });
  });

  it("reports a reply that never arrives as timeout (6)", async () => {
    const fetch = vi.fn(
      (_url: string | URL, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    ) as unknown as typeof globalThis.fetch;

    const client = createAnkiClient({
      origin: ORIGIN,
      timeoutMs: 5,
      fetch,
      hasHostPermission: async () => true,
    });

    const probed = await client.probe();

    expect(probed).toMatchObject({
      kind: "unavailable",
      cause: { kind: "timeout" },
    });
  });

  it("resolves to connected, reporting the version the add-on gives (4.9)", async () => {
    const { client } = clientWith(() => ok(6));

    expect(await client.probe()).toEqual({ kind: "connected", apiVersion: 6 });
  });

  it("refuses to trust a version reply of the wrong shape", async () => {
    const { client } = clientWith(() => ok("six"));

    expect(await client.probe()).toMatchObject({
      kind: "unavailable",
      cause: { kind: "malformed-response" },
    });
  });
});

describe("host permission", () => {
  it("reports permission-missing before any request is attempted (3a)", async () => {
    const { client, fetch } = clientWith(() => ok(6), {
      hostPermission: false,
    });

    const probed = await client.probe();

    expect(probed).toMatchObject({
      kind: "unavailable",
      cause: { kind: "permission-missing" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses every operation the same way, without reaching the network", async () => {
    const { client, fetch } = clientWith(() => ok(6), {
      hostPermission: false,
    });

    const attempts: Result<unknown, AnkiError>[] = [
      await client.deckNames(),
      await client.noteTypes(),
      await client.canAddNote(basicDraft()),
      await client.addNote(basicDraft()),
    ];

    for (const failed of attempts) {
      expect(isErr(failed) && failed.error.kind).toBe("permission-missing");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the optional API key (4.8)", () => {
  it("carries the key on every action (3e)", async () => {
    const { client, sent } = clientWith(() => ok([]), { apiKey: API_KEY });

    await client.probe();
    await client.deckNames();
    await client.noteTypes();

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((one) => one.key === API_KEY)).toBe(true);
  });

  it("surfaces the add-on's key error as api-key-required (3e)", async () => {
    const { client } = clientWith(() => ({
      result: null,
      error: "valid api key must be provided",
    }));

    const decks = await client.deckNames();

    expect(isErr(decks) && decks.error.kind).toBe("api-key-required");
  });

  it("keeps the key out of every message and every diagnostic (3f)", async () => {
    const { client } = clientWith(() => ({
      result: null,
      error: "valid api key must be provided",
    }));

    const decks = await client.deckNames();
    const diagnostics = describeAnkiConnection({
      origin: ORIGIN,
      apiKey: API_KEY,
    });

    expect(JSON.stringify(diagnostics)).not.toContain(API_KEY);
    expect(diagnostics).toMatchObject({
      apiKeyConfigured: true,
      origin: ORIGIN,
    });
    expect(isErr(decks) && decks.error.message).not.toContain(API_KEY);
  });

  it("reports no key configured when there is none", () => {
    expect(describeAnkiConnection({ origin: ORIGIN })).toMatchObject({
      apiKeyConfigured: false,
    });
  });
});

describe("decks and note types", () => {
  it("reads the deck names", async () => {
    const { client } = clientWith(() => ok(["Default", "Geography"]));

    expect(await client.deckNames()).toEqual({
      ok: true,
      value: ["Default", "Geography"],
    });
  });

  it("validates the deck-names reply rather than casting it (9)", async () => {
    const { client } = clientWith(() => ok(["Default", 7]));

    const decks = await client.deckNames();

    expect(isErr(decks) && decks.error.kind).toBe("malformed-response");
  });

  it("describes each note type with its fields and its cloze flavour (10, 4.6)", async () => {
    const { client } = clientWith((body) => {
      const model = (body.params as { modelName?: string } | undefined)
        ?.modelName;
      if (body.action === "modelNames") return ok(["Basic", "Lückentext"]);
      if (body.action === "modelFieldNames") {
        return ok(model === "Basic" ? ["Front", "Back"] : ["Text", "Extra"]);
      }
      return ok(
        model === "Basic"
          ? { "Card 1": { Front: "{{Front}}", Back: "{{Back}}" } }
          : { "Card 1": { Front: "{{cloze:Text}}", Back: "{{cloze:Text}}" } },
      );
    });

    const noteTypes = await client.noteTypes();

    expect(isOk(noteTypes) && noteTypes.value).toEqual([
      expect.objectContaining({
        name: "Basic",
        fields: ["Front", "Back"],
        kind: "standard",
      }),
      expect.objectContaining({
        name: "Lückentext",
        fields: ["Text", "Extra"],
        kind: "cloze",
      }),
    ]);
  });

  it("falls back to the name heuristic when templates cannot be read", async () => {
    const { client } = clientWith((body) => {
      if (body.action === "modelNames") return ok(["Cloze"]);
      if (body.action === "modelFieldNames") return ok(["Text", "Back Extra"]);
      return { result: null, error: "modelTemplates is not supported" };
    });

    const noteTypes = await client.noteTypes();

    expect(isOk(noteTypes) && noteTypes.value[0]?.kind).toBe("cloze");
  });

  it("validates the field-names reply rather than casting it (9)", async () => {
    const { client } = clientWith((body) =>
      body.action === "modelNames" ? ok(["Basic"]) : ok("Front"),
    );

    const noteTypes = await client.noteTypes();

    expect(isErr(noteTypes) && noteTypes.error.kind).toBe("malformed-response");
  });

  // 10.1: the collection's own order, and nothing on the way through may sort
  // it. A note type whose fields read alphabetically by accident would prove
  // nothing, so this one is deliberately out of order.
  it("keeps the field order the collection reports", async () => {
    const { client } = clientWith((body) => {
      if (body.action === "modelNames") return ok(["Recipe"]);
      if (body.action === "modelFieldNames") {
        return ok(["Title", "Ingredients", "Method", "Applies to"]);
      }
      return ok({ "Card 1": { Front: "{{Title}}", Back: "{{Method}}" } });
    });

    const noteTypes = await client.noteTypes();

    expect(isOk(noteTypes) && noteTypes.value[0]?.fields).toEqual([
      "Title",
      "Ingredients",
      "Method",
      "Applies to",
    ]);
  });
});

describe("the collection's existing tags (10.9)", () => {
  it("reads them", async () => {
    const { client, sent } = clientWith(() => ok(["europe", "geo::capitals"]));

    expect(await client.tags()).toEqual({
      ok: true,
      value: ["europe", "geo::capitals"],
    });
    expect(sent[0]?.action).toBe("getTags");
  });

  it("validates the reply rather than casting it (9)", async () => {
    const { client } = clientWith(() => ok(["europe", 7]));

    const tags = await client.tags();

    expect(isErr(tags) && tags.error.kind).toBe("malformed-response");
  });

  // Completion is a convenience; a collection that will not report its tags
  // must not stop a card being made, so the cause travels rather than throwing.
  it("reports why it could not read them", async () => {
    const { client } = clientWith(() => new Error("connection refused"));

    const tags = await client.tags();

    expect(isErr(tags) && tags.error.kind).toBe("anki-not-running");
  });
});

describe("duplicate detection (4.4)", () => {
  it("reports a duplicate as a warning, and the draft stays addable (7)", async () => {
    const { client } = clientWith((body) =>
      body.action === "canAddNotes" ? ok([false]) : ok(1496198395707),
    );

    const canAdd = await client.canAddNote(basicDraft());
    const added = await client.addNote(basicDraft());

    expect(canAdd).toEqual({ ok: true, value: false });
    expect(added).toEqual({ ok: true, value: 1496198395707 });
  });

  it("asks about exactly the note it is about to add", async () => {
    const { client, sent } = clientWith(() => ok([true]));

    await client.canAddNote(basicDraft());

    expect(sent[0]).toMatchObject({
      action: "canAddNotes",
      params: { notes: [{ deckName: "Geography", modelName: "Basic" }] },
    });
  });

  it("validates the canAddNotes reply rather than casting it (9)", async () => {
    const { client } = clientWith(() => ok(["yes"]));

    const canAdd = await client.canAddNote(basicDraft());

    expect(isErr(canAdd) && canAdd.error.kind).toBe("malformed-response");
  });

  it("refuses an empty canAddNotes reply, which answers about no note at all", async () => {
    const { client } = clientWith(() => ok([]));

    const canAdd = await client.canAddNote(basicDraft());

    expect(isErr(canAdd) && canAdd.error.kind).toBe("malformed-response");
  });
});
