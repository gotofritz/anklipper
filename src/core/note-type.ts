/**
 * An Anki note type, as much of it as the card model needs (3.1).
 *
 * Fields are named, never positional: a note type edited in Anki reorders or
 * renames its fields, and an index would then point at the wrong content.
 */
export type NoteTypeKind = "standard" | "cloze";

export interface NoteType {
  readonly name: string;
  /** The note type's real field names, in Anki's own order. */
  readonly fields: readonly string[];
  /** Cloze is a flavour of note type, not a second kind of draft (3.7). */
  readonly kind: NoteTypeKind;
  /** Anki's rule is that the first field may not be empty; a caller may add more. */
  readonly requiredFields: readonly string[];
}

export interface NoteTypeSpec {
  readonly name: string;
  readonly fields: readonly string[];
  readonly kind?: NoteTypeKind;
  readonly requiredFields?: readonly string[];
}

/**
 * Whether a note type is a cloze one, read from its name.
 *
 * A heuristic, and deliberately the fallback: the kind belongs to the note
 * type rather than to the user (3.7), so an adapter that can see the note
 * type's templates passes `kind` explicitly instead.
 */
export function deriveNoteTypeKind(name: string): NoteTypeKind {
  return /cloze/i.test(name) ? "cloze" : "standard";
}

export function createNoteType(spec: NoteTypeSpec): NoteType {
  const first = spec.fields[0];

  return {
    name: spec.name,
    fields: [...spec.fields],
    kind: spec.kind ?? deriveNoteTypeKind(spec.name),
    requiredFields: [
      ...(spec.requiredFields ?? (first === undefined ? [] : [first])),
    ],
  };
}

export function hasField(noteType: NoteType, field: string): boolean {
  return noteType.fields.includes(field);
}

/**
 * The field a note type leads with — `Front` on Basic, `Text` on Cloze. It is
 * the one Anki requires, the one that carries a conversion (3.12), and the one
 * a cloze note's deletions have to be in.
 */
export function primaryFieldOf(noteType: NoteType): string | undefined {
  return noteType.fields[0];
}
