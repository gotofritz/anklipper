import { describe, expect, it } from "vitest";

import { BASIC, CLOZE } from "@/fixtures/note-types";

import { createDraft } from "../../draft";
import { isErr, isOk } from "../../result";
import { createFakeAnkiClient } from "./fake-anki-client";

function draft(front: string) {
  return createDraft({
    deck: "Geography",
    noteType: BASIC,
    fields: { Front: front },
    source: {
      text: front,
      context: "",
      url: "https://example.test",
      title: "",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "basic", version: 1 },
  });
}

describe("createFakeAnkiClient", () => {
  it("answers with the decks and note types it was given", async () => {
    const client = createFakeAnkiClient({
      decks: ["Geography", "Default"],
      noteTypes: [BASIC, CLOZE],
    });

    const decks = await client.deckNames();
    const noteTypes = await client.noteTypes();

    expect(isOk(decks) && decks.value).toEqual(["Geography", "Default"]);
    expect(isOk(noteTypes) && noteTypes.value).toEqual([BASIC, CLOZE]);
  });

  it("records what it was asked to add", async () => {
    const client = createFakeAnkiClient();
    const result = await client.addNote(draft("Paris"));

    expect(isOk(result)).toBe(true);
    expect(client.added.map((added) => added.fields.Front)).toEqual(["Paris"]);
  });

  it("can be driven into failure and reports it in the port's error shape", async () => {
    const client = createFakeAnkiClient();
    client.failWith({
      kind: "anki-not-running",
      message: "Anki is not running",
    });

    const result = await client.addNote(draft("Paris"));

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("anki-not-running");
    expect(client.added).toEqual([]);
  });

  it("fails every action while it is failing, not only the one under test", async () => {
    const client = createFakeAnkiClient();
    client.failWith({
      kind: "origin-rejected",
      message: "origin not allowlisted",
    });

    expect(isErr(await client.deckNames())).toBe(true);
    expect(isErr(await client.noteTypes())).toBe(true);
    expect(isErr(await client.canAddNote(draft("Paris")))).toBe(true);
  });

  it("stops failing when the failure is cleared", async () => {
    const client = createFakeAnkiClient();
    client.failWith({ kind: "addon-missing", message: "no AnkiConnect" });
    client.failWith(undefined);

    expect(isOk(await client.deckNames())).toBe(true);
  });

  it("reports a duplicate as a warning, and still adds the note (4.4)", async () => {
    const client = createFakeAnkiClient({ duplicates: ["Paris"] });

    const canAdd = await client.canAddNote(draft("Paris"));
    const result = await client.addNote(draft("Paris"));

    expect(isOk(canAdd) && canAdd.value).toBe(false);
    // The adapter sends `allowDuplicate`, so a caller that warned and was told
    // to go ahead anyway gets the note added. A fake that refused here would
    // have every consumer build a block instead of the warning 4.4 pins.
    expect(isOk(result)).toBe(true);
    expect(client.added).toHaveLength(1);
  });

  it("can still be driven down the refusing path a duplicate used to take", async () => {
    const client = createFakeAnkiClient();
    client.failWith({ kind: "duplicate-note", message: "already there" });

    expect(isErr(await client.addNote(draft("Paris")))).toBe(true);
  });

  it("probes as connected, reporting a version, until it is driven into failure", async () => {
    const client = createFakeAnkiClient({ apiVersion: 6 });

    expect(await client.probe()).toEqual({ kind: "connected", apiVersion: 6 });

    client.failWith({ kind: "origin-rejected", message: "not allowlisted" });

    expect(await client.probe()).toMatchObject({
      kind: "unavailable",
      cause: { kind: "origin-rejected" },
    });
  });

  it("answers the handshake, and counts how often it was asked", async () => {
    const client = createFakeAnkiClient();

    expect(await client.requestPermission()).toEqual({
      kind: "granted",
      apiVersion: 6,
    });
    expect(client.handshakes.count).toBe(1);
  });

  it("can be told to refuse the handshake, so P9's dead end is testable", async () => {
    const client = createFakeAnkiClient({
      handshake: {
        kind: "denied",
        cause: {
          kind: "permission-denied",
          message: "declined",
          needsManualFix: true,
        },
      },
    });

    expect(await client.requestPermission()).toMatchObject({ kind: "denied" });
  });
});
