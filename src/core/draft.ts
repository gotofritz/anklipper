import { findMalformedCloze, stripCloze } from "./cloze";
import type { NoteType, NoteTypeKind } from "./note-type";
import { hasField, primaryFieldOf } from "./note-type";
import type { Result } from "./result";
import { err, ok } from "./result";

/**
 * `CardDraft` is the only contract between generation, the editor, and
 * AnkiConnect (P4). It is a plain immutable value (3.3): every transition
 * below is a pure function returning a new draft, so nothing here has to
 * know about Svelte, the browser, or the wire format.
 */
export type FieldMap = Readonly<Record<string, string>>;

/** Where the draft came from, kept verbatim while the fields are edited (3.6). */
export interface CardSource {
  /** The selection exactly as it was captured, whitespace and all. */
  readonly text: string;
  /** The text around the selection, for context. */
  readonly context: string;
  readonly url: string;
  readonly title: string;
}

/** Provenance, so a later AI generator is distinguishable from this one. */
export interface GenerationMetadata {
  readonly name: string;
  readonly version: number;
}

export interface CardDraft {
  readonly deck: string;
  readonly noteType: NoteType;
  /** Keyed by the note type's real field names (3.1). */
  readonly fields: FieldMap;
  /** Content a note-type switch could not carry over, keyed by note type (3.2). */
  readonly stash: Readonly<Record<string, FieldMap>>;
  readonly tags: readonly string[];
  readonly source: CardSource;
  readonly createdAt: string;
  readonly generation: GenerationMetadata;
}

export type DraftIssueCode =
  | "deck-missing"
  | "note-type-missing"
  | "unknown-field"
  | "field-required"
  | "tag-malformed"
  | "cloze-no-deletions"
  | "cloze-markup-malformed"
  | "note-type-not-cloze"
  | "note-type-not-standard";

/**
 * Why a draft is not valid, or why a transition was refused. A list of these
 * rather than a boolean (3.4): the editor has to say which field is wrong.
 */
export interface DraftIssue {
  readonly code: DraftIssueCode;
  readonly message: string;
  readonly field?: string;
  readonly tag?: string;
}

export interface DraftSpec {
  readonly deck: string;
  readonly noteType: NoteType;
  /** Values for the note type's own fields; other names are ignored. */
  readonly fields?: FieldMap;
  readonly tags?: readonly string[];
  readonly source: CardSource;
  readonly createdAt: string;
  readonly generation: GenerationMetadata;
}

export function createDraft(spec: DraftSpec): CardDraft {
  const fields: Record<string, string> = {};
  for (const field of spec.noteType.fields) {
    fields[field] = spec.fields?.[field] ?? "";
  }

  return {
    deck: spec.deck,
    noteType: spec.noteType,
    fields,
    stash: {},
    tags: [...(spec.tags ?? [])],
    source: spec.source,
    createdAt: spec.createdAt,
    generation: spec.generation,
  };
}

/** Cloze is read off the note type, never chosen by the user (3.7). */
export function noteTypeKindOf(draft: CardDraft): NoteTypeKind {
  return draft.noteType.kind;
}

export function setDeck(draft: CardDraft, deck: string): CardDraft {
  return { ...draft, deck };
}

/**
 * Set one field. Clearing a field also clears that name from every stash: the
 * stash exists so a note-type switch loses nothing, not as a place for content
 * the user has deliberately thrown away.
 */
export function setField(
  draft: CardDraft,
  field: string,
  value: string,
): Result<CardDraft, DraftIssue> {
  if (!hasField(draft.noteType, field)) {
    return err({
      code: "unknown-field",
      message: `${draft.noteType.name} has no field called ${field}`,
      field,
    });
  }

  const fields = { ...draft.fields, [field]: value };
  const stash =
    value.trim() === "" ? withoutStashed(draft.stash, field) : draft.stash;

  return ok({ ...draft, fields, stash });
}

function withoutStashed(
  stash: Readonly<Record<string, FieldMap>>,
  field: string,
): Readonly<Record<string, FieldMap>> {
  const remaining: Record<string, FieldMap> = {};

  for (const [noteTypeName, stashed] of Object.entries(stash)) {
    const kept = Object.fromEntries(
      Object.entries(stashed).filter(([name]) => name !== field),
    );
    if (Object.keys(kept).length > 0) remaining[noteTypeName] = kept;
  }

  return remaining;
}

/**
 * Change note type, remapping by field name (3.2).
 *
 * Fields whose names exist in both carry over. The rest move to a stash kept
 * under the old note type's name, and come back if the user switches back —
 * silently dropping them on a dropdown change is the worst option available.
 */
export function setNoteType(draft: CardDraft, noteType: NoteType): CardDraft {
  if (noteType.name === draft.noteType.name) return draft;

  const carried: Record<string, string> = {};
  const unmatched: Record<string, string> = {};
  for (const [field, value] of Object.entries(draft.fields)) {
    if (hasField(noteType, field)) carried[field] = value;
    else if (value.trim() !== "") unmatched[field] = value;
  }

  const stash: Record<string, FieldMap> = { ...draft.stash };
  if (Object.keys(unmatched).length > 0) stash[draft.noteType.name] = unmatched;
  else delete stash[draft.noteType.name];

  const restored = stash[noteType.name];
  delete stash[noteType.name];

  const fields: Record<string, string> = {};
  for (const field of noteType.fields) {
    const value = carried[field] ?? "";
    fields[field] = value.trim() === "" ? (restored?.[field] ?? "") : value;
  }

  return { ...draft, noteType, fields, stash };
}

/**
 * Anki separates tags with spaces, so a tag containing one is two tags. `::`
 * is its hierarchy separator and stays legal.
 */
export function isWellFormedTag(tag: string): boolean {
  return tag.trim() !== "" && !/\s/.test(tag.trim());
}

export function addTag(
  draft: CardDraft,
  tag: string,
): Result<CardDraft, DraftIssue> {
  const trimmed = tag.trim();
  if (!isWellFormedTag(trimmed)) {
    return err({
      code: "tag-malformed",
      message: `"${tag}" is not a tag Anki can store`,
      tag,
    });
  }
  if (draft.tags.includes(trimmed)) return ok(draft);

  return ok({ ...draft, tags: [...draft.tags, trimmed] });
}

export function removeTag(draft: CardDraft, tag: string): CardDraft {
  return { ...draft, tags: draft.tags.filter((one) => one !== tag) };
}

export interface DraftDefaults {
  readonly deck?: string;
  readonly tags?: readonly string[];
}

/** Fill in what the user has not chosen, without overwriting what they have. */
export function applyDefaults(
  draft: CardDraft,
  defaults: DraftDefaults,
): CardDraft {
  const deck =
    draft.deck.trim() === "" ? (defaults.deck ?? draft.deck) : draft.deck;
  const tags = [...draft.tags];
  for (const tag of defaults.tags ?? []) {
    if (isWellFormedTag(tag) && !tags.includes(tag)) tags.push(tag);
  }

  return { ...draft, deck, tags };
}

/**
 * Basic → Cloze (3.12). The two note types share no field name, so the switch
 * alone would stash everything; this carries the primary field across — `Front`
 * into `Text` — which is useful but has to be the user's choice, never
 * automatic.
 */
export function convertToCloze(
  draft: CardDraft,
  noteType: NoteType,
): Result<CardDraft, DraftIssue> {
  if (noteType.kind !== "cloze") {
    return err({
      code: "note-type-not-cloze",
      message: `${noteType.name} is not a cloze note type`,
    });
  }

  const from = primaryFieldOf(draft.noteType);
  return carryPrimary(
    draft,
    noteType,
    from === undefined ? "" : (draft.fields[from] ?? ""),
  );
}

/** Cloze → Basic (3.12). The markup is stripped; the plain text survives. */
export function convertFromCloze(
  draft: CardDraft,
  noteType: NoteType,
): Result<CardDraft, DraftIssue> {
  if (draft.noteType.kind !== "cloze") {
    return err({
      code: "note-type-not-cloze",
      message: `${draft.noteType.name} is not a cloze note type`,
    });
  }
  if (noteType.kind !== "standard") {
    return err({
      code: "note-type-not-standard",
      message: `${noteType.name} is a cloze note type`,
    });
  }

  const from = primaryFieldOf(draft.noteType);
  const text = from === undefined ? "" : (draft.fields[from] ?? "");
  if (findMalformedCloze(text)) {
    return err({
      code: "cloze-markup-malformed",
      message: `the markup in ${from} does not parse, so it cannot be stripped`,
      ...(from === undefined ? {} : { field: from }),
    });
  }

  return carryPrimary(draft, noteType, stripCloze(text));
}

/** The switch first, so 3.2 still stashes; then the carried value on top. */
function carryPrimary(
  draft: CardDraft,
  noteType: NoteType,
  value: string,
): Result<CardDraft, DraftIssue> {
  const to = primaryFieldOf(noteType);
  if (to === undefined) {
    return err({
      code: "note-type-missing",
      message: `${noteType.name} has no fields`,
    });
  }

  const switched = setNoteType(draft, noteType);
  if (value.trim() === "") return ok(switched);

  return ok({ ...switched, fields: { ...switched.fields, [to]: value } });
}
