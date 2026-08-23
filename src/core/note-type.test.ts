import { describe, expect, it } from "vitest";

import {
  createNoteType,
  deriveNoteTypeKind,
  hasField,
  primaryFieldOf,
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
