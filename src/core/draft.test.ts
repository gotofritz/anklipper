import { describe, expect, it } from "vitest";

import { createNoteType } from "@/core/note-type";
import { BASIC, CLOZE, VOCAB } from "@/fixtures/note-types";

import {
  addTag,
  applyDefaults,
  convertFromCloze,
  convertToCloze,
  createDraft,
  isWellFormedTag,
  noteTypeKindOf,
  refreshNoteType,
  removeTag,
  setDeck,
  setField,
  setNoteType,
} from "./draft";
import type { CardDraft } from "./draft";
import { isErr, isOk } from "./result";

const SOURCE = {
  text: "  Paris is the capital of France.  ",
  context: "France is a country in Europe. Paris is the capital of France.",
  url: "https://example.test/france",
  title: "France — Example",
};

function draft(overrides: Partial<Parameters<typeof createDraft>[0]> = {}) {
  return createDraft({
    deck: "Geography",
    noteType: BASIC,
    fields: { Front: "Paris is the capital of France.", Back: "Paris" },
    tags: ["geography"],
    source: SOURCE,
    createdAt: "2026-01-01T00:00:00.000Z",
    generation: { name: "basic", version: 1 },
    ...overrides,
  });
}

/** Transitions that can fail return a Result; most tests want the draft. */
function unwrap(result: ReturnType<typeof setField>): CardDraft {
  if (isErr(result)) throw new Error(`expected a draft: ${result.error.code}`);
  return result.value;
}

describe("createDraft", () => {
  it("gives the note type's every field a value, empty where unset (3.1)", () => {
    const created = createDraft({
      deck: "Geography",
      noteType: BASIC,
      source: SOURCE,
      createdAt: "2026-01-01T00:00:00.000Z",
      generation: { name: "basic", version: 1 },
    });

    expect(created.fields).toEqual({ Front: "", Back: "" });
    expect(created.stash).toEqual({});
    expect(created.tags).toEqual([]);
  });

  it("carries the note type's kind (3.7)", () => {
    expect(noteTypeKindOf(draft())).toBe("standard");
    expect(noteTypeKindOf(draft({ noteType: CLOZE, fields: {} }))).toBe(
      "cloze",
    );
  });

  it("ignores values for names the note type does not have", () => {
    const created = draft({ fields: { Front: "kept", Nonsense: "dropped" } });

    expect(created.fields).toEqual({ Front: "kept", Back: "" });
  });
});

describe("setDeck", () => {
  it("returns a new draft and leaves the input alone (3.3)", () => {
    const before = draft();
    const after = setDeck(before, "Geography::Europe");

    expect(after.deck).toBe("Geography::Europe");
    expect(before.deck).toBe("Geography");
  });
});

describe("setField", () => {
  it("sets a field without touching the input draft (3.3)", () => {
    const before = draft();
    const after = unwrap(setField(before, "Back", "Paris."));

    expect(after.fields).toEqual({
      Front: "Paris is the capital of France.",
      Back: "Paris.",
    });
    expect(before.fields.Back).toBe("Paris");
  });

  it("rejects a field name the note type does not have", () => {
    const result = setField(draft(), "Extra", "nope");

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("unknown-field");
      expect(result.error.field).toBe("Extra");
    }
  });

  it("clearing a field clears it from every stash, so the stash stays bounded", () => {
    // 3.2 remaps by name, so a name the user has deliberately emptied must
    // not come back from another note type's stash.
    const stashed = setNoteType(setNoteType(draft(), CLOZE), VOCAB);
    expect(stashed.stash).toEqual({
      Basic: { Front: "Paris is the capital of France.", Back: "Paris" },
    });

    const cleared = unwrap(setField(stashed, "Front", "   "));

    expect(cleared.stash).toEqual({ Basic: { Back: "Paris" } });
    expect(setNoteType(cleared, BASIC).fields).toEqual({
      Front: "",
      Back: "Paris",
    });
  });
});

describe("setNoteType", () => {
  it("carries over fields the two note types share (3.2)", () => {
    const after = setNoteType(draft(), VOCAB);

    expect(after.noteType).toBe(VOCAB);
    expect(after.fields.Front).toBe("Paris is the capital of France.");
    expect(after.fields.Example).toBe("");
  });

  it("stashes unmatched content instead of dropping it (3.2)", () => {
    const after = setNoteType(draft(), VOCAB);

    expect(after.fields.Back).toBe(undefined);
    expect(after.stash).toEqual({ Basic: { Back: "Paris" } });
  });

  it("restores the stash when the user switches back (3.2)", () => {
    const back = setNoteType(setNoteType(draft(), VOCAB), BASIC);

    expect(back.fields).toEqual({
      Front: "Paris is the capital of France.",
      Back: "Paris",
    });
    expect(back.stash).toEqual({});
  });

  it("never lets a restored value overwrite content that carried over", () => {
    // Basic → Cloze stashes both Basic fields; Cloze → Vocab then carries
    // a hand-typed Front back into Basic, where the stash also holds one.
    const stashed = setNoteType(draft(), CLOZE);
    const typed = unwrap(
      setField(setNoteType(stashed, VOCAB), "Front", "Lyon"),
    );
    const back = setNoteType(typed, BASIC);

    expect(back.fields.Front).toBe("Lyon");
    expect(back.fields.Back).toBe("Paris");
  });

  it("stashes nothing when the unmatched fields are empty", () => {
    const after = setNoteType(draft({ fields: { Front: "kept" } }), VOCAB);

    expect(after.stash).toEqual({});
  });

  it("is a no-op for the note type the draft already has", () => {
    const before = draft();

    expect(setNoteType(before, BASIC)).toBe(before);
  });

  it("does not mutate the input draft (3.3)", () => {
    const before = draft();
    setNoteType(before, VOCAB);

    expect(before.noteType).toBe(BASIC);
    expect(before.fields.Back).toBe("Paris");
    expect(before.stash).toEqual({});
  });
});

describe("tags", () => {
  it("adds a tag once", () => {
    const once = unwrap(addTag(draft(), "europe"));

    expect(unwrap(addTag(once, "europe")).tags).toEqual([
      "geography",
      "europe",
    ]);
  });

  it("trims what it stores", () => {
    expect(unwrap(addTag(draft(), "  europe  ")).tags).toEqual([
      "geography",
      "europe",
    ]);
  });

  it("rejects a tag Anki cannot store, since a space separates tags", () => {
    for (const tag of ["", "   ", "two words"]) {
      const result = addTag(draft(), tag);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe("tag-malformed");
    }
  });

  it("accepts Anki's hierarchy separator", () => {
    expect(isWellFormedTag("geography::europe")).toBe(true);
  });

  it("removes a tag without touching the input draft (3.3)", () => {
    const before = draft();

    expect(removeTag(before, "geography").tags).toEqual([]);
    expect(before.tags).toEqual(["geography"]);
  });
});

describe("applyDefaults", () => {
  it("fills a missing deck and adds default tags, keeping what is set", () => {
    const after = applyDefaults(draft({ deck: "  " }), {
      deck: "Default",
      tags: ["anklipper", "geography"],
    });

    expect(after.deck).toBe("Default");
    expect(after.tags).toEqual(["geography", "anklipper"]);
  });

  it("leaves a deck the user chose alone", () => {
    expect(applyDefaults(draft(), { deck: "Default" }).deck).toBe("Geography");
  });
});

describe("convertToCloze", () => {
  it("carries the primary field into the cloze note type's own (3.12)", () => {
    const result = convertToCloze(draft(), CLOZE);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.noteType).toBe(CLOZE);
      expect(result.value.fields.Text).toBe("Paris is the capital of France.");
      expect(result.value.stash).toEqual({
        Basic: { Front: "Paris is the capital of France.", Back: "Paris" },
      });
    }
  });

  it("refuses a note type that is not cloze", () => {
    const result = convertToCloze(draft(), VOCAB);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("note-type-not-cloze");
  });
});

describe("convertFromCloze", () => {
  it("strips the markup back to plain text and keeps it (3.12)", () => {
    const cloze = draft({
      noteType: CLOZE,
      fields: { Text: "{{c1::Paris::city}} is the capital of France." },
    });
    const result = convertFromCloze(cloze, BASIC);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.noteType).toBe(BASIC);
      expect(result.value.fields.Front).toBe("Paris is the capital of France.");
    }
  });

  it("refuses to convert a draft that is not cloze", () => {
    const result = convertFromCloze(draft(), VOCAB);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("note-type-not-cloze");
  });

  it("refuses a cloze note type as the target", () => {
    const cloze = draft({ noteType: CLOZE, fields: { Text: "plain" } });
    const result = convertFromCloze(cloze, CLOZE);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("note-type-not-standard");
  });
});

describe("provenance (3.6)", () => {
  it("keeps the source verbatim while the fields are edited freely", () => {
    const edited = unwrap(setField(draft(), "Front", "rewritten by hand"));

    expect(edited.source).toEqual(SOURCE);
  });
});

/**
 * The same note type, re-read from Anki (M7's risk). A user may edit a note
 * type in Anki while a draft is open, and submitting field names it no longer
 * has would be refused three layers away — so the sidebar reconciles on open,
 * by 3.2's rule rather than a second one.
 */
describe("refreshNoteType", () => {
  const renamed = createNoteType({
    name: "Basic",
    fields: ["Front", "Reverse"],
  });

  it("carries fields whose names survived", () => {
    const before = unwrap(setField(draft(), "Front", "Paris"));

    const after = refreshNoteType(before, renamed);

    expect(after.noteType.fields).toEqual(["Front", "Reverse"]);
    expect(after.fields).toEqual({ Front: "Paris", Reverse: "" });
  });

  it("stashes content whose field is gone rather than dropping it", () => {
    const before = unwrap(setField(draft(), "Back", "In France"));

    const after = refreshNoteType(before, renamed);

    expect(after.stash).toEqual({ Basic: { Back: "In France" } });
  });

  it("takes the fresh descriptor even when the fields are unchanged", () => {
    // Anki reports the flavour from the templates (4.6); the capture's own
    // note type is the name heuristic's guess, and this is where it is
    // corrected.
    const fromAnki = createNoteType({
      name: "Basic",
      fields: ["Front", "Back"],
      kind: "cloze",
    });

    expect(noteTypeKindOf(refreshNoteType(draft(), fromAnki))).toBe("cloze");
  });

  it("leaves a draft alone when the note type is a different one", () => {
    const before = draft();

    expect(refreshNoteType(before, VOCAB)).toBe(before);
  });
});
