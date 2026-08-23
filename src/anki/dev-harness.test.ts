import { describe, expect, it } from "vitest";

import { parseCloze } from "@/core/cloze";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import type { AnkiConnection, AnkiError } from "@/core/ports/types";
import { err } from "@/core/result";
import { BASIC, CLOZE } from "@/fixtures/note-types";

import { createDevHarness } from "./dev-harness";

const ORIGIN = "moz-extension://11111111-2222-3333-4444-555555555555";
const API_KEY = "hunter2-not-in-any-output";

function harnessWith(
  options: {
    readonly client?: ReturnType<typeof createFakeAnkiClient>;
    readonly hostPermission?: boolean;
    readonly apiKey?: string;
  } = {},
) {
  const client =
    options.client ??
    createFakeAnkiClient({
      decks: ["Default", "Geography"],
      noteTypes: [BASIC, CLOZE],
    });

  return {
    client,
    harness: createDevHarness({
      origin: ORIGIN,
      hasHostPermission: async () => options.hostPermission ?? true,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      client,
    }),
  };
}

describe("survey", () => {
  it("reports the origin to paste into webCorsOriginList", async () => {
    const { harness } = harnessWith();

    expect((await harness.survey()).origin).toBe(ORIGIN);
  });

  it("reports the host permission, and stops there when it is missing", async () => {
    const { harness } = harnessWith({ hostPermission: false });

    const survey = await harness.survey();

    expect(survey.hostPermission).toBe(false);
    expect(survey.connection).toMatchObject({
      kind: "unavailable",
      cause: { kind: "permission-missing" },
    });
    expect(survey.decks).toBeUndefined();
    expect(survey.noteTypes).toBeUndefined();
  });

  it("reports the decks and note types when connected", async () => {
    const { harness } = harnessWith();

    const survey = await harness.survey();

    expect(survey.connection).toMatchObject({ kind: "connected" });
    expect(survey.decks).toEqual(["Default", "Geography"]);
    expect(survey.noteTypes).toEqual([
      { name: "Basic", kind: "standard", fields: ["Front", "Back"] },
      { name: "Cloze", kind: "cloze", fields: ["Text", "Back Extra"] },
    ]);
  });

  it("names the cloze-flavoured note types on their own, which is the 4.6 check", async () => {
    const { harness } = harnessWith();

    expect((await harness.survey()).clozeNoteTypes).toEqual(["Cloze"]);
  });

  it("records a failing step instead of throwing, so one failure does not hide the rest", async () => {
    // A client that connects but cannot answer: the fake couples `failWith`
    // to the probe, and the case worth covering is a reachable Anki whose
    // collection is not open.
    const error: AnkiError = {
      kind: "api-error",
      message: "collection is not available",
    };
    const failing = {
      ...createFakeAnkiClient(),
      async probe(): Promise<AnkiConnection> {
        return { kind: "connected", apiVersion: 6 };
      },
      async deckNames() {
        return err(error);
      },
      async noteTypes() {
        return err(error);
      },
    };

    const harness = createDevHarness({
      origin: ORIGIN,
      hasHostPermission: async () => true,
      client: failing,
    });

    const survey = await harness.survey();

    expect(survey.failures).toEqual([
      { step: "deckNames", error },
      { step: "noteTypes", error },
    ]);
    expect(survey.decks).toBeUndefined();
  });

  it("never writes to the collection — it is someone's real Anki", async () => {
    const { harness, client } = harnessWith();

    await harness.survey();

    expect(client.added).toEqual([]);
  });

  it("keeps the API key out of what it reports", async () => {
    const { harness } = harnessWith({ apiKey: API_KEY });

    const survey = await harness.survey();

    expect(JSON.stringify(survey)).not.toContain(API_KEY);
    expect(survey.diagnostics).toMatchObject({
      apiKeyConfigured: true,
      origin: ORIGIN,
    });
  });
});

describe("sample drafts", () => {
  it("builds a basic draft through the real generation path", () => {
    const { harness } = harnessWith();

    const draft = harness.drafts.basic("Geography", BASIC);

    expect(draft).toMatchObject({
      deck: "Geography",
      noteType: BASIC,
      fields: { Front: expect.any(String) as string },
    });
    expect(draft.fields.Front).not.toBe("");
    expect(draft.source.url).not.toBe("");
  });

  it("builds a cloze draft whose markup survives into the field", () => {
    const { harness } = harnessWith();

    const draft = harness.drafts.cloze("Geography", CLOZE);

    expect(parseCloze(draft.fields.Text ?? "")).toHaveLength(1);
  });

  it("builds a cloze draft with no deletions at all, for the empty-cloze check", () => {
    const { harness } = harnessWith();

    const draft = harness.drafts.emptyCloze("Geography", CLOZE);

    expect(parseCloze(draft.fields.Text ?? "")).toHaveLength(0);
    expect(draft.fields.Text).not.toBe("");
  });

  it("tags every sample, so a test run is findable in Anki afterwards", () => {
    const { harness } = harnessWith();

    for (const draft of [
      harness.drafts.basic("Default", BASIC),
      harness.drafts.cloze("Default", CLOZE),
      harness.drafts.emptyCloze("Default", CLOZE),
    ]) {
      expect(draft.tags).toContain("anklipper-manual-check");
    }
  });
});
