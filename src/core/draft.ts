import type { CaptureWarning } from "./capture";
import { findMalformedClozeInField, stripClozeFromField } from "./field-cloze";
import {
  fieldFromText,
  fieldText,
  isFieldEmpty,
  spliceField,
} from "./field-html";
import type { NoteType, NoteTypeKind } from "./note-type";
import { hasField, primaryFieldOf, sameNoteType } from "./note-type";
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
  /** The nearest heading above the selection, when the page had one (5.3). */
  readonly heading?: string;
  /**
   * The selection's original markup. Fields carry plain text (5.2); this is
   * kept so a later milestone can offer rich capture without re-extracting.
   */
  readonly html?: string;
}

/** Provenance, so a later AI generator is distinguishable from this one. */
export interface GenerationMetadata {
  readonly name: string;
  readonly version: number;
  /**
   * What the capture could not read, or read only in part (5.4). Kept with
   * the draft because the editor has to say so: a card silently missing its
   * context is worse than one that names what is missing.
   */
  readonly warnings?: readonly CaptureWarning[];
}

export interface CardDraft {
  readonly deck: string;
  readonly noteType: NoteType;
  /**
   * Keyed by the note type's real field names (3.1). The values are **HTML**,
   * as Anki itself stores them (10.2) — `field-html.ts` is what may produce
   * one, and what reads the text back out of it.
   */
  readonly fields: FieldMap;
  /** Content a note-type switch could not carry over, keyed by note type (3.2). */
  readonly stash: Readonly<Record<string, FieldMap>>;
  /**
   * The landing area (10a.1): the selected text, as plain text, kept apart
   * from the fields.
   *
   * A note type owns its field names (3.1), so changing note type remaps by
   * name and stashes what does not match (3.2) — which for Basic → Cloze is
   * everything, and looks from the outside like the selection being thrown
   * away. This is the copy that is not a field and therefore never moves:
   * the user works from it, sends pieces of it into whichever fields the
   * note type has, and changing note type leaves it alone.
   *
   * Plain text, not HTML. What the extractor pulls off the page is plain
   * (5.2, 10.3), and this is that text; `sendToField` is what turns a piece
   * of it into a field's HTML. It is never sent to Anki — it is the material
   * a card is made from, not part of the note — and it is where M12's
   * generation will read from.
   */
  readonly scratch: string;
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
  /** The landing area's starting text (10a.1). */
  readonly scratch?: string;
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
    scratch: spec.scratch ?? "",
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

/** Edit the landing area. Nothing else in the draft moves with it (10a.1). */
export function setScratch(draft: CardDraft, scratch: string): CardDraft {
  return { ...draft, scratch };
}

/** Where a piece of the landing area is going, and how it lands (10a.2). */
export interface SendTarget {
  readonly field: string;
  /**
   * Where in the field's text to put it — the caret the user left there, or a
   * selection to overwrite. Omitted, it goes on the end, because appending
   * loses nothing and overwriting from a distance would.
   */
  readonly start?: number;
  readonly end?: number;
  /** Replace the field outright, whatever the range says. */
  readonly replace?: boolean;
}

/**
 * Put a piece of the landing area into one field (10a.2).
 *
 * The text arrives plain and leaves as the field's HTML, escaped and with its
 * line breaks kept — a page's text must not become a collection's markup
 * (10.5). What surrounds the insertion point keeps its formatting, so sending
 * into the middle of a bolded phrase does not flatten it.
 */
export function sendToField(
  draft: CardDraft,
  text: string,
  target: SendTarget,
): Result<CardDraft, DraftIssue> {
  const current = draft.fields[target.field];
  if (!hasField(draft.noteType, target.field) || current === undefined) {
    return err({
      code: "unknown-field",
      message: `${draft.noteType.name} has no field called ${target.field}`,
      field: target.field,
    });
  }

  const html = fieldFromText(text);
  if (target.replace === true) return setField(draft, target.field, html);

  const end = fieldText(current).length;
  return setField(
    draft,
    target.field,
    spliceField(
      current,
      target.start ?? end,
      target.end ?? target.start ?? end,
      html,
    ),
  );
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
  const stash = isFieldEmpty(value)
    ? withoutStashed(draft.stash, field)
    : draft.stash;

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
    else if (!isFieldEmpty(value)) unmatched[field] = value;
  }

  const stash: Record<string, FieldMap> = { ...draft.stash };
  if (Object.keys(unmatched).length > 0) stash[draft.noteType.name] = unmatched;
  else delete stash[draft.noteType.name];

  const restored = stash[noteType.name];
  delete stash[noteType.name];

  const fields: Record<string, string> = {};
  for (const field of noteType.fields) {
    const value = carried[field] ?? "";
    fields[field] = isFieldEmpty(value) ? (restored?.[field] ?? "") : value;
  }

  return { ...draft, noteType, fields, stash };
}

/**
 * The same note type, re-read from Anki.
 *
 * A user may rename or reorder a note type's fields in Anki while a draft is
 * open, and a draft still keyed by the old names would be refused by
 * AnkiConnect at submit — three layers from where it could be explained. The
 * sidebar reconciles on open, and this is the reconciliation: 3.2's rule,
 * applied to a note type that kept its name.
 *
 * The fresh descriptor is taken even when the field list is identical, since
 * it also carries the flavour Anki reads off the templates (4.6) in place of
 * the name heuristic's guess. A reading that says the same thing returns the
 * draft itself, so a caller can tell "nothing changed" from "reconciled"
 * without comparing note types of its own.
 */
export function refreshNoteType(
  draft: CardDraft,
  noteType: NoteType,
): CardDraft {
  if (noteType.name !== draft.noteType.name) return draft;
  if (sameNoteType(noteType, draft.noteType)) return draft;

  const carried: Record<string, string> = {};
  const unmatched: Record<string, string> = {};
  for (const [field, value] of Object.entries(draft.fields)) {
    if (hasField(noteType, field)) carried[field] = value;
    else if (!isFieldEmpty(value)) unmatched[field] = value;
  }

  const stash: Record<string, FieldMap> = { ...draft.stash };
  // Under its own name, so switching away and back restores it (3.2). What
  // was already stashed under that name stays: it belongs to this note type
  // too, and the switch that put it there has not been undone.
  if (Object.keys(unmatched).length > 0) {
    stash[noteType.name] = { ...stash[noteType.name], ...unmatched };
  }

  const fields: Record<string, string> = {};
  for (const field of noteType.fields) fields[field] = carried[field] ?? "";

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
  if (findMalformedClozeInField(text)) {
    return err({
      code: "cloze-markup-malformed",
      message: `the markup in ${from} does not parse, so it cannot be stripped`,
      ...(from === undefined ? {} : { field: from }),
    });
  }

  return carryPrimary(draft, noteType, stripClozeFromField(text));
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
  if (isFieldEmpty(value)) return ok(switched);

  return ok({ ...switched, fields: { ...switched.fields, [to]: value } });
}
