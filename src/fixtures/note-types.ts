import { createNoteType } from "@/core/note-type";

/**
 * Note types used by tests. Field names are Anki's real ones, per 3.1 — the
 * model keys fields by name, so a fixture with invented names would prove
 * nothing about the note-type switch.
 */
export const BASIC = createNoteType({
  name: "Basic",
  fields: ["Front", "Back"],
});

/** Shares `Front` with `Basic` and nothing else, so a switch both carries and stashes. */
export const VOCAB = createNoteType({
  name: "Vocab",
  fields: ["Front", "Example"],
});

/** Shares no field name with `Basic` at all — the case 3.12 exists for. */
export const CLOZE = createNoteType({
  name: "Cloze",
  fields: ["Text", "Back Extra"],
});

/**
 * The shape a real collection's note types have: several fields, in an order
 * the collection chose and not the one an alphabetical sort would give. 10.1
 * is only worth testing against a note type that would fail it.
 */
export const RECIPE = createNoteType({
  name: "Recipe",
  fields: ["Title", "Ingredients", "Method", "Applies to"],
});
