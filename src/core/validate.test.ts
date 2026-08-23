import { describe, expect, it } from "vitest";

import { BASIC, CLOZE } from "@/fixtures/note-types";

import { createDraft } from "./draft";
import type { CardDraft, DraftIssueCode } from "./draft";
import { createNoteType } from "./note-type";
import { validateDraft } from "./validate";

const SOURCE = {
  text: "Paris is the capital of France.",
  context: "",
  url: "https://example.test/france",
  title: "France",
};

function draft(overrides: Partial<Parameters<typeof createDraft>[0]> = {}) {
  return createDraft({
    deck: "Geography",
    noteType: BASIC,
    fields: { Front: "Paris is the capital of France." },
    source: SOURCE,
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "basic", version: 1 },
    ...overrides,
  });
}

function codes(candidate: CardDraft): readonly DraftIssueCode[] {
  return validateDraft(candidate).map((issue) => issue.code);
}

describe("validateDraft", () => {
  it("passes a draft with a deck, a note type, and its required field", () => {
    expect(validateDraft(draft())).toEqual([]);
  });

  it("reports a missing deck", () => {
    expect(codes(draft({ deck: "   " }))).toEqual(["deck-missing"]);
  });

  it("reports a note type with no fields", () => {
    const empty = createNoteType({ name: "", fields: [] });

    expect(codes(draft({ noteType: empty, fields: {} }))).toContain(
      "note-type-missing",
    );
  });

  it("names the field that is missing, not just that the draft is invalid (3.4)", () => {
    const issues = validateDraft(draft({ fields: {} }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("field-required");
    expect(issues[0]?.field).toBe("Front");
    expect(issues[0]?.message).toContain("Front");
  });

  it("counts whitespace-only content as empty", () => {
    expect(codes(draft({ fields: { Front: " \n\t " } }))).toEqual([
      "field-required",
    ]);
  });

  it("rejects a field name the note type does not have", () => {
    const smuggled = {
      ...draft(),
      fields: { Front: "Paris", Sideways: "smuggled" },
    };
    const issues = validateDraft(smuggled);

    expect(issues[0]?.code).toBe("unknown-field");
    expect(issues[0]?.field).toBe("Sideways");
  });

  it("rejects a tag with a space in it", () => {
    const tagged = { ...draft(), tags: ["two words"] };
    const issues = validateDraft(tagged);

    expect(issues[0]?.code).toBe("tag-malformed");
    expect(issues[0]?.tag).toBe("two words");
  });

  it("collects every issue rather than stopping at the first (3.4)", () => {
    expect(codes(draft({ deck: "", fields: {} }))).toEqual([
      "deck-missing",
      "field-required",
    ]);
  });
});

describe("cloze validation (3.7)", () => {
  function clozeDraft(text: string) {
    return draft({ noteType: CLOZE, fields: { Text: text } });
  }

  it("rejects a cloze note with no deletions, before AnkiConnect has to", () => {
    const issues = validateDraft(clozeDraft("Paris is the capital of France."));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("cloze-no-deletions");
    expect(issues[0]?.field).toBe("Text");
  });

  it("passes a cloze note with one deletion", () => {
    expect(validateDraft(clozeDraft("{{c1::Paris}} is the capital."))).toEqual(
      [],
    );
  });

  it("reports markup it cannot parse rather than guessing (3.11)", () => {
    const issues = validateDraft(clozeDraft("{{c1::Paris is the capital."));

    expect(issues.map((issue) => issue.code)).toContain(
      "cloze-markup-malformed",
    );
    expect(issues[0]?.field).toBe("Text");
  });

  it("leaves a standard note type alone", () => {
    expect(validateDraft(draft({ fields: { Front: "{{c1::Paris" } }))).toEqual(
      [],
    );
  });
});
