import { describe, expect, it } from "vitest";

import { createDraft } from "@/core/draft";
import { BASIC, CLOZE } from "@/fixtures/note-types";

import { classifyAddNoteError, classifyApiError } from "./errors";

const SOURCE = { text: "", context: "", url: "", title: "" };

function draftOf(noteType: typeof BASIC, fields: Record<string, string>) {
  return createDraft({
    deck: "Default",
    noteType,
    fields,
    source: SOURCE,
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "test", version: 1 },
  });
}

describe("classifyApiError", () => {
  it.each([
    ["cannot create note because it is a duplicate", "duplicate-note"],
    ["deck was not found: Spanish", "unknown-deck"],
    ["model was not found: Basic", "unknown-note-type"],
    ["valid api key must be provided", "api-key-required"],
    ["Field name is invalid", "unknown-field"],
    ["collection is not available", "api-error"],
  ])("reads %j as %s", (message, kind) => {
    expect(classifyApiError(message)).toMatchObject({ kind, message });
  });

  it("keeps the add-on's own words, whatever kind it lands on", () => {
    expect(classifyApiError("deck was not found: Spanish").message).toBe(
      "deck was not found: Spanish",
    );
  });
});

describe("classifyAddNoteError", () => {
  it("reads an explicit cloze refusal as empty-cloze, not api-error", () => {
    const draft = draftOf(CLOZE, { Text: "no deletions here" });

    expect(
      classifyAddNoteError(
        "cannot create note because there are no cloze deletions",
        draft,
      ).kind,
    ).toBe("empty-cloze");
  });

  it("reads Anki's generic empty-note refusal as empty-cloze when the draft is a cloze one with no deletions", () => {
    const draft = draftOf(CLOZE, { Text: "no deletions here" });

    expect(
      classifyAddNoteError("cannot create note because it is empty", draft)
        .kind,
    ).toBe("empty-cloze");
  });

  it("leaves the same refusal alone when the cloze field does have deletions", () => {
    const draft = draftOf(CLOZE, { Text: "the {{c1::capital}} of France" });

    expect(
      classifyAddNoteError("cannot create note because it is empty", draft)
        .kind,
    ).not.toBe("empty-cloze");
  });

  it("leaves the same refusal alone for a standard note type", () => {
    const draft = draftOf(BASIC, { Front: "", Back: "" });

    expect(
      classifyAddNoteError("cannot create note because it is empty", draft)
        .kind,
    ).not.toBe("empty-cloze");
  });

  it("still classifies everything classifyApiError does", () => {
    const draft = draftOf(BASIC, { Front: "hello", Back: "" });

    expect(
      classifyAddNoteError(
        "cannot create note because it is a duplicate",
        draft,
      ).kind,
    ).toBe("duplicate-note");
  });
});
