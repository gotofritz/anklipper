import { describe, expect, it } from "vitest";

import { BASIC, CLOZE } from "@/fixtures/note-types";

import { createDraft } from "./draft";
import type { CardDraft } from "./draft";
import { DEFAULT_FIELD_MAPPING, applySourceFields } from "./source-fields";

const SOURCE = {
  text: "the selected sentence",
  context: "the paragraph it sat in",
  url: "https://example.test/a?b=1&c=2",
  title: "An Example Page",
};

function draftOn(noteType = BASIC): CardDraft {
  return createDraft({
    deck: "Default",
    noteType,
    fields: { Front: "the selected sentence" },
    source: SOURCE,
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "basic", version: 1 },
  });
}

describe("applySourceFields", () => {
  it("writes nothing when no field is mapped", () => {
    const draft = draftOn();

    expect(applySourceFields(draft, DEFAULT_FIELD_MAPPING, "plain")).toBe(
      draft,
    );
  });

  // Test 9 of the M8 plan.
  it("puts the source URL in the configured field", () => {
    const mapped = applySourceFields(
      draftOn(),
      { sourceUrl: "Back", sourceTitle: "" },
      "plain",
    );

    expect(mapped.fields.Back).toBe(SOURCE.url);
  });

  it("puts the source title in the configured field", () => {
    const mapped = applySourceFields(
      draftOn(),
      { sourceUrl: "", sourceTitle: "Back" },
      "plain",
    );

    expect(mapped.fields.Back).toBe(SOURCE.title);
  });

  it("writes the URL as a link when that is the chosen style", () => {
    const mapped = applySourceFields(
      draftOn(),
      { sourceUrl: "Back", sourceTitle: "" },
      "link",
    );

    expect(mapped.fields.Back).toBe(
      '<a href="https://example.test/a?b=1&amp;c=2">An Example Page</a>',
    );
  });

  it("escapes a title that would otherwise close the anchor", () => {
    const draft = {
      ...draftOn(),
      source: { ...SOURCE, title: '</a><script>alert("x")</script>' },
    };

    const mapped = applySourceFields(
      draft,
      { sourceUrl: "Back", sourceTitle: "" },
      "link",
    );

    expect(mapped.fields.Back).not.toContain("<script>");
    expect(mapped.fields.Back).toContain("&lt;/a&gt;");
  });

  // Whether the URL is written is the mapping's business, not the style's.
  it("writes no URL when no field is mapped for one", () => {
    const mapped = applySourceFields(
      draftOn(),
      { sourceUrl: "", sourceTitle: "Back" },
      "link",
    );

    expect(mapped.fields.Back).toBe(SOURCE.title);
  });

  // A note type is edited in Anki, or the user picks a different one: the
  // mapping names a field that is not there, and that is not an error.
  it("skips a mapped field the note type does not have", () => {
    const draft = draftOn(CLOZE);

    const mapped = applySourceFields(
      draft,
      { sourceUrl: "Back", sourceTitle: "Front" },
      "plain",
    );

    expect(mapped).toBe(draft);
    expect(mapped.fields).not.toHaveProperty("Back");
  });

  it("never overwrites a field the user has already filled", () => {
    const draft = draftOn();
    const typed = { ...draft, fields: { ...draft.fields, Back: "my answer" } };

    const mapped = applySourceFields(
      typed,
      { sourceUrl: "Back", sourceTitle: "" },
      "plain",
    );

    expect(mapped.fields.Back).toBe("my answer");
  });

  it("puts both into one field when both are mapped to it", () => {
    const mapped = applySourceFields(
      draftOn(),
      { sourceUrl: "Back", sourceTitle: "Back" },
      "plain",
    );

    expect(mapped.fields.Back).toBe(`${SOURCE.title}\n${SOURCE.url}`);
  });
});
