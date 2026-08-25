import { describe, expect, it } from "vitest";

import { createDraft } from "./draft";
import type { CardDraft } from "./draft";
import type { NoteType } from "./note-type";
import { createNoteType } from "./note-type";
import type { StickyFields } from "./sticky";
import {
  applySticky,
  isFieldSticky,
  pinField,
  recordSticky,
  stickyFieldsOf,
  unpinField,
} from "./sticky";

const BASIC = createNoteType({ name: "Basic", fields: ["Front", "Back"] });
const VOCAB = createNoteType({ name: "Vocab", fields: ["Front", "Example"] });

function draftOf(
  noteType: NoteType,
  fields: Record<string, string>,
): CardDraft {
  return createDraft({
    deck: "Default",
    noteType,
    fields,
    source: {
      text: "",
      context: "",
      url: "https://example.test",
      title: "Example",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "basic", version: 1 },
  });
}

describe("1. pinning", () => {
  it("starts with nothing pinned", () => {
    expect(isFieldSticky({}, "Basic", "Back")).toBe(false);
    expect(stickyFieldsOf({}, "Basic")).toEqual([]);
  });

  it("pins and unpins one field of one note type", () => {
    const pinned = pinField({}, "Basic", "Back", "Source: Wikipedia");

    expect(isFieldSticky(pinned, "Basic", "Back")).toBe(true);
    expect(isFieldSticky(pinned, "Basic", "Front")).toBe(false);
    expect(stickyFieldsOf(pinned, "Basic")).toEqual(["Back"]);

    expect(
      isFieldSticky(unpinField(pinned, "Basic", "Back"), "Basic", "Back"),
    ).toBe(false);
  });

  // The field set belongs to the note type (3.1), so a pin does too: `Front`
  // on Basic and `Front` on Vocab are different fields that share a name.
  it("keeps one note type's pins out of another's", () => {
    const pinned = pinField({}, "Basic", "Front", "x");

    expect(isFieldSticky(pinned, "Vocab", "Front")).toBe(false);
  });

  it("holds a pin whose content is empty", () => {
    const pinned = pinField({}, "Basic", "Back", "");

    expect(isFieldSticky(pinned, "Basic", "Back")).toBe(true);
  });
});

describe("2. what a pinned field remembers", () => {
  it("takes the value from the card that was added", () => {
    const pinned = pinField({}, "Basic", "Back", "");
    const recorded = recordSticky(
      pinned,
      draftOf(BASIC, { Front: "Capital?", Back: "Source: Wikipedia" }),
    );

    expect(recorded).toEqual({ Basic: { Back: "Source: Wikipedia" } });
  });

  it("ignores fields that are not pinned", () => {
    const recorded = recordSticky(
      pinField({}, "Basic", "Back", ""),
      draftOf(BASIC, { Front: "Capital?", Back: "Paris" }),
    );

    expect(recorded.Basic?.Front).toBeUndefined();
  });

  it("leaves another note type's memory untouched", () => {
    const both: StickyFields = {
      Basic: { Back: "old" },
      Vocab: { Example: "kept" },
    };

    expect(recordSticky(both, draftOf(BASIC, { Back: "new" }))).toEqual({
      Basic: { Back: "new" },
      Vocab: { Example: "kept" },
    });
  });
});

describe("3. carrying to the next card (10.6)", () => {
  it("fills a pinned field, and not an unpinned one", () => {
    const sticky = pinField({}, "Basic", "Back", "Source: Wikipedia");
    const next = applySticky(
      draftOf(BASIC, { Front: "Longest river?" }),
      sticky,
    );

    expect(next.fields.Back).toBe("Source: Wikipedia");
    expect(next.fields.Front).toBe("Longest river?");
  });

  it("carries nothing when nothing is pinned", () => {
    const next = applySticky(draftOf(BASIC, { Front: "x" }), {});

    expect(next.fields.Back).toBe("");
  });

  // The capture is what the user just selected. A pin is a convenience and
  // must never be the thing that overwrites it.
  it("does not overwrite what the capture already filled", () => {
    const sticky = pinField({}, "Basic", "Front", "remembered");
    const next = applySticky(draftOf(BASIC, { Front: "captured" }), sticky);

    expect(next.fields.Front).toBe("captured");
  });

  it("skips a pin for a field this note type does not have", () => {
    const sticky = pinField({}, "Vocab", "Example", "carried");
    const next = applySticky(draftOf(BASIC, { Front: "x" }), sticky);

    expect(Object.keys(next.fields)).toEqual(["Front", "Back"]);
  });

  it("returns the draft itself when there is nothing to carry", () => {
    const draft = draftOf(VOCAB, { Front: "x" });

    expect(applySticky(draft, {})).toBe(draft);
  });
});
