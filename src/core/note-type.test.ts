import { describe, expect, it } from "vitest";

import {
  createNoteType,
  deriveNoteTypeKind,
  hasField,
  primaryFieldOf,
  sameNoteType,
} from "./note-type";

describe("deriveNoteTypeKind", () => {
  it("reads cloze out of the note type's name", () => {
    expect(deriveNoteTypeKind("Cloze")).toBe("cloze");
    expect(deriveNoteTypeKind("Cloze (overlapping)")).toBe("cloze");
    expect(deriveNoteTypeKind("Basic")).toBe("standard");
  });
});

describe("createNoteType", () => {
  it("derives the kind from the name when none is given (3.7)", () => {
    expect(createNoteType({ name: "Cloze", fields: ["Text"] }).kind).toBe(
      "cloze",
    );
    expect(createNoteType({ name: "Basic", fields: ["Front"] }).kind).toBe(
      "standard",
    );
  });

  it("takes an explicit kind over the name heuristic", () => {
    const noteType = createNoteType({
      name: "Lückentext",
      fields: ["Text"],
      kind: "cloze",
    });

    expect(noteType.kind).toBe("cloze");
  });

  it("requires the first field, which is Anki's own rule", () => {
    const noteType = createNoteType({
      name: "Basic",
      fields: ["Front", "Back"],
    });

    expect(noteType.requiredFields).toEqual(["Front"]);
  });

  it("takes an explicit required set", () => {
    const noteType = createNoteType({
      name: "Basic",
      fields: ["Front", "Back"],
      requiredFields: ["Front", "Back"],
    });

    expect(noteType.requiredFields).toEqual(["Front", "Back"]);
  });

  it("copies the field list, so the caller cannot mutate it afterwards", () => {
    const fields = ["Front", "Back"];
    const noteType = createNoteType({ name: "Basic", fields });

    fields.push("Sneaked");

    expect(noteType.fields).toEqual(["Front", "Back"]);
  });
});

describe("field helpers", () => {
  const basic = createNoteType({ name: "Basic", fields: ["Front", "Back"] });

  it("reports whether a name belongs to the note type", () => {
    expect(hasField(basic, "Front")).toBe(true);
    expect(hasField(basic, "Fronts")).toBe(false);
  });

  it("names the primary field, which carries across a conversion (3.12)", () => {
    expect(primaryFieldOf(basic)).toBe("Front");
    expect(primaryFieldOf(createNoteType({ name: "Empty", fields: [] }))).toBe(
      undefined,
    );
  });
});

/**
 * Whether two descriptors of the same note type say the same thing. The
 * sidebar re-reads note types from Anki on open (M7) and reconciles the draft
 * when they have changed underneath it; without this every open would rewrite
 * a draft nothing had happened to.
 */
describe("sameNoteType", () => {
  const basic = createNoteType({ name: "Basic", fields: ["Front", "Back"] });

  it("is true for two readings of an unchanged note type", () => {
    expect(
      sameNoteType(
        basic,
        createNoteType({ name: "Basic", fields: ["Front", "Back"] }),
      ),
    ).toBe(true);
  });

  it("is false when a field was renamed", () => {
    expect(
      sameNoteType(
        basic,
        createNoteType({ name: "Basic", fields: ["Front", "Reverse"] }),
      ),
    ).toBe(false);
  });

  // Anki reorders fields, and the draft's field order is Anki's (3.1).
  it("is false when the fields were reordered", () => {
    expect(
      sameNoteType(
        basic,
        createNoteType({ name: "Basic", fields: ["Back", "Front"] }),
      ),
    ).toBe(false);
  });

  // The flavour comes off the templates (4.6) and the capture's own guess is
  // the name heuristic's; a disagreement is exactly what has to be noticed.
  it("is false when the flavour differs", () => {
    expect(
      sameNoteType(
        basic,
        createNoteType({
          name: "Basic",
          fields: ["Front", "Back"],
          kind: "cloze",
        }),
      ),
    ).toBe(false);
  });

  it("is false for two different note types", () => {
    expect(
      sameNoteType(
        basic,
        createNoteType({ name: "Vocab", fields: ["Front", "Back"] }),
      ),
    ).toBe(false);
  });

  it("is false when what Anki requires has changed", () => {
    expect(
      sameNoteType(
        basic,
        createNoteType({
          name: "Basic",
          fields: ["Front", "Back"],
          requiredFields: ["Front", "Back"],
        }),
      ),
    ).toBe(false);
  });
});
