import { describe, expect, it } from "vitest";

import { BASIC, CLOZE } from "@/fixtures/note-types";

import { BASIC_GENERATOR, generateBasicCard } from "./generate";
import { validateDraft } from "./validate";

const SELECTION = { text: "  Paris is the capital of France.  " };
const CONTEXT = {
  surroundingText:
    "France is a country in Europe. Paris is the capital of France.",
  url: "https://example.test/france",
  title: "France — Example",
};
const DEFAULTS = { deck: "Geography", noteType: BASIC, tags: ["anklipper"] };
const AT = () => new Date("2026-01-01T12:00:00.000Z");

describe("generateBasicCard", () => {
  it("preserves the selection, url, and title verbatim (3.6)", () => {
    const draft = generateBasicCard(SELECTION, CONTEXT, DEFAULTS, { now: AT });

    expect(draft.source).toEqual({
      text: "  Paris is the capital of France.  ",
      context: CONTEXT.surroundingText,
      url: CONTEXT.url,
      title: CONTEXT.title,
    });
  });

  it("puts the selection in the primary field and leaves the rest to the user", () => {
    const draft = generateBasicCard(SELECTION, CONTEXT, DEFAULTS, { now: AT });

    expect(draft.fields).toEqual({
      Front: "Paris is the capital of France.",
      Back: "",
    });
  });

  it("takes the deck, note type, and tags from the defaults", () => {
    const draft = generateBasicCard(SELECTION, CONTEXT, DEFAULTS, { now: AT });

    expect(draft.deck).toBe("Geography");
    expect(draft.noteType).toBe(BASIC);
    expect(draft.tags).toEqual(["anklipper"]);
  });

  it("records which generator made it, so a later one is distinguishable", () => {
    const draft = generateBasicCard(SELECTION, CONTEXT, DEFAULTS, { now: AT });

    expect(draft.generation).toEqual(BASIC_GENERATOR);
    expect(draft.createdAt).toBe("2026-01-01T12:00:00.000Z");
  });

  it("produces a draft that validates", () => {
    expect(
      validateDraft(
        generateBasicCard(SELECTION, CONTEXT, DEFAULTS, { now: AT }),
      ),
    ).toEqual([]);
  });

  it("produces a cloze draft that does not validate until a deletion is marked", () => {
    const draft = generateBasicCard(
      SELECTION,
      CONTEXT,
      { ...DEFAULTS, noteType: CLOZE },
      { now: AT },
    );

    expect(draft.fields.Text).toBe("Paris is the capital of France.");
    expect(validateDraft(draft).map((issue) => issue.code)).toEqual([
      "cloze-no-deletions",
    ]);
  });

  it("stamps the current time when no clock is given", () => {
    const before = Date.now();
    const draft = generateBasicCard(SELECTION, CONTEXT, DEFAULTS);

    expect(Date.parse(draft.createdAt)).toBeGreaterThanOrEqual(before);
  });
});
