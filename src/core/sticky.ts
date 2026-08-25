import type { CardDraft } from "./draft";
import { isFieldEmpty } from "./field-html";
import { hasField } from "./note-type";

/**
 * Sticky fields (10.6) — Anki's own feature, and the one that makes capturing
 * several cards off one page fast: pin a field and its content is there again
 * on the next card.
 *
 * Keyed by note type and then by field, because a field belongs to its note
 * type (3.1): `Front` on Basic and `Front` on a custom note type share a name
 * and nothing else. A field's presence in the map *is* the pin, and the value
 * is what it last held — so a field can be pinned while empty, which is the
 * state right after pinning one.
 *
 * This is remembered state, not configuration (8.5): resetting the settings
 * leaves it alone, and it changing is not an edit to what the user chose.
 */
export type StickyFields = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

export function isFieldSticky(
  sticky: StickyFields,
  noteType: string,
  field: string,
): boolean {
  return Object.hasOwn(sticky[noteType] ?? {}, field);
}

/** The pinned fields of one note type, for the editor to render its pins from. */
export function stickyFieldsOf(
  sticky: StickyFields,
  noteType: string,
): readonly string[] {
  return Object.keys(sticky[noteType] ?? {});
}

export function pinField(
  sticky: StickyFields,
  noteType: string,
  field: string,
  value: string,
): StickyFields {
  return {
    ...sticky,
    [noteType]: { ...sticky[noteType], [field]: value },
  };
}

export function unpinField(
  sticky: StickyFields,
  noteType: string,
  field: string,
): StickyFields {
  const kept = Object.fromEntries(
    Object.entries(sticky[noteType] ?? {}).filter(([name]) => name !== field),
  );

  const next = { ...sticky };
  if (Object.keys(kept).length === 0) delete next[noteType];
  else next[noteType] = kept;

  return next;
}

/**
 * Note what the pinned fields held on the card that was just added.
 *
 * On the add rather than on every keystroke, for 8.5's reason: a field a card
 * actually went to Anki with is evidence of what the user is doing, and one
 * they were halfway through typing is not.
 */
export function recordSticky(
  sticky: StickyFields,
  draft: CardDraft,
): StickyFields {
  const pinned = sticky[draft.noteType.name];
  if (pinned === undefined) return sticky;

  const updated: Record<string, string> = {};
  for (const field of Object.keys(pinned)) {
    updated[field] = draft.fields[field] ?? pinned[field] ?? "";
  }

  return { ...sticky, [draft.noteType.name]: updated };
}

/**
 * Fill a fresh draft's pinned fields from what they last held.
 *
 * Only fields that are still empty: the capture is what the user just
 * selected, and a pin is a convenience that must never be the thing that
 * overwrites it. A pin naming a field this note type does not have is skipped
 * rather than invented, for the same reason `applySourceFields` skips one —
 * `unknown-field` at submit is three layers from where it could be explained.
 */
export function applySticky(draft: CardDraft, sticky: StickyFields): CardDraft {
  const pinned = sticky[draft.noteType.name];
  if (pinned === undefined) return draft;

  const fields: Record<string, string> = { ...draft.fields };
  let changed = false;
  for (const [field, value] of Object.entries(pinned)) {
    if (value === "") continue;
    if (!hasField(draft.noteType, field)) continue;
    if (!isFieldEmpty(fields[field] ?? "")) continue;

    fields[field] = value;
    changed = true;
  }

  return changed ? { ...draft, fields } : draft;
}
