import { describe, expect, it } from "vitest";

import { addTag, createDraft } from "@/core/draft";
import { BASIC, CLOZE } from "@/fixtures/note-types";

import { isClozeTemplateMap, toAnkiNote, toNoteType } from "./mapping";

const SOURCE = {
  text: "the capital of France is Paris",
  context: "…a paragraph about France…",
  url: "https://example.test/france",
  title: "France",
};

function draftOf(noteType: typeof BASIC, fields: Record<string, string>) {
  return createDraft({
    deck: "Geography",
    noteType,
    fields,
    tags: ["geography"],
    source: SOURCE,
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "test", version: 1 },
  });
}

describe("toAnkiNote", () => {
  it("maps a draft to the documented addNote params, tags included", () => {
    const draft = draftOf(BASIC, { Front: "capital of France", Back: "Paris" });

    expect(toAnkiNote(draft)).toEqual({
      deckName: "Geography",
      modelName: "Basic",
      fields: { Front: "capital of France", Back: "Paris" },
      tags: ["geography"],
      options: { allowDuplicate: true, duplicateScope: "deck" },
    });
  });

  it("allows the duplicate, because 4.4 makes it a warning rather than a block", () => {
    const draft = draftOf(BASIC, { Front: "a", Back: "b" });

    // `canAddNote` is what reports the duplicate. If the request that follows
    // the user's decision refused it, the warning would be a block.
    expect(toAnkiNote(draft).options.allowDuplicate).toBe(true);
  });

  it("carries every tag the draft holds", () => {
    const draft = draftOf(BASIC, { Front: "a", Back: "b" });
    const tagged = addTag(draft, "europe");

    expect(tagged.ok && toAnkiNote(tagged.value).tags).toEqual([
      "geography",
      "europe",
    ]);
  });

  it("sends the note type's own fields and injects nothing else — the source is not a field", () => {
    const draft = draftOf(BASIC, { Front: "a", Back: "b" });

    expect(Object.keys(toAnkiNote(draft).fields)).toEqual(["Front", "Back"]);
  });

  it("leaves cloze markup exactly as the draft holds it", () => {
    const text = "the {{c1::capital}} of {{c2::France}} is {{c1::Paris}}";
    const draft = draftOf(CLOZE, { Text: text, "Back Extra": "" });

    expect(toAnkiNote(draft).fields.Text).toBe(text);
  });

  it("is a copy, so the draft cannot be mutated through the request", () => {
    const draft = draftOf(BASIC, { Front: "a", Back: "b" });
    const note = toAnkiNote(draft);

    expect(note.fields).not.toBe(draft.fields);
    expect(note.tags).not.toBe(draft.tags);
  });
});

describe("isClozeTemplateMap", () => {
  it("reads a template referencing {{cloze:…}} as cloze-flavoured (4.6)", () => {
    expect(
      isClozeTemplateMap({
        "Card 1": {
          Front: "{{cloze:Text}}",
          Back: "{{cloze:Text}}<br>{{Back Extra}}",
        },
      }),
    ).toBe(true);
  });

  it("reads a standard note type's templates as not cloze", () => {
    expect(
      isClozeTemplateMap({
        "Card 1": {
          Front: "{{Front}}",
          Back: "{{FrontSide}}<hr id=answer>{{Back}}",
        },
      }),
    ).toBe(false);
  });

  it("sees through a filter chain, which is how Anki lets cloze be written", () => {
    expect(
      isClozeTemplateMap({
        "Card 1": { Front: "{{text:cloze:Text}}", Back: "" },
      }),
    ).toBe(true);
    expect(
      isClozeTemplateMap({
        "Card 1": { Front: "{{cloze-only:Text}}", Back: "" },
      }),
    ).toBe(true);
  });

  it("is not fooled by a field merely named Cloze", () => {
    expect(
      isClozeTemplateMap({ "Card 1": { Front: "{{Cloze Hint}}", Back: "" } }),
    ).toBe(false);
  });
});

describe("toNoteType", () => {
  it("reports a custom cloze-flavoured note type from its templates, not its name (4.6)", () => {
    const noteType = toNoteType("Lückentext", ["Text", "Extra"], {
      "Card 1": { Front: "{{cloze:Text}}", Back: "{{cloze:Text}}" },
    });

    expect(noteType).toMatchObject({
      name: "Lückentext",
      fields: ["Text", "Extra"],
      kind: "cloze",
    });
  });

  it("reports a standard note type as standard even when its name says otherwise", () => {
    const noteType = toNoteType("Cloze-style Basic", ["Front", "Back"], {
      "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
    });

    expect(noteType.kind).toBe("standard");
  });

  it("falls back to the built-in name heuristic when the templates are unavailable", () => {
    expect(toNoteType("Cloze", ["Text", "Back Extra"]).kind).toBe("cloze");
    expect(toNoteType("Basic", ["Front", "Back"]).kind).toBe("standard");
  });

  it("keeps Anki's own field order, since fields are named rather than positional", () => {
    expect(toNoteType("Basic", ["Front", "Back"]).fields).toEqual([
      "Front",
      "Back",
    ]);
  });
});
