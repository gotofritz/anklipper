import type { CardDraft } from "./draft";
import { hasField } from "./note-type";

/**
 * Where a card's provenance goes, and in what form (M8).
 *
 * `draft.source` keeps the URL and the title verbatim and separately (3.6);
 * whether either is also *written into a field* is the user's choice, because
 * only they know whether their note type has somewhere to put it. That choice
 * is a setting; applying it is card-model work, so it lives here rather than
 * in a Svelte handler or in the AnkiConnect adapter.
 */

/**
 * How the source URL is written, once a field has been named for it.
 *
 * *Whether* it is written at all is the mapping's business — an unmapped
 * field is the off switch. Two knobs that can each veto the other is one
 * knob too many, and the pair contradicting is not a state a user can read
 * off a form.
 */
export type SourceUrlStyle =
  /** The address itself, as text. */
  | "plain"
  /** An anchor, titled with the page's own title. Anki renders fields as HTML. */
  | "link";

/** Which field each part of the source goes into. `""` means none. */
export interface FieldMapping {
  readonly sourceUrl: string;
  readonly sourceTitle: string;
}

export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  sourceUrl: "",
  sourceTitle: "",
};

/**
 * Anki stores fields as HTML, so the one style that emits markup has to escape
 * what it wraps. A page title is page content and may contain anything.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urlText(draft: CardDraft, style: SourceUrlStyle): string {
  if (style === "plain") return draft.source.url;

  const label =
    draft.source.title.trim() === "" ? draft.source.url : draft.source.title;
  return `<a href="${escapeHtml(draft.source.url)}">${escapeHtml(label)}</a>`;
}

/**
 * Fill the mapped fields, if the note type has them and they are still empty.
 *
 * Three restraints, each deliberate. A field the note type does not have is
 * skipped rather than invented — the mapping outlives any one note type, and
 * `unknown-field` at submit is three layers from where it could be explained.
 * A field the user has already written in is left alone, since generated
 * provenance is worth less than anything a person typed. And the draft itself
 * is returned unchanged when there is nothing to write, so a caller can tell
 * "mapped" from "not mapped" without comparing field maps.
 */
export function applySourceFields(
  draft: CardDraft,
  mapping: FieldMapping,
  style: SourceUrlStyle,
): CardDraft {
  const parts = new Map<string, string[]>();

  const put = (field: string, value: string) => {
    if (field === "" || value === "") return;
    if (!hasField(draft.noteType, field)) return;
    if ((draft.fields[field] ?? "").trim() !== "") return;

    parts.set(field, [...(parts.get(field) ?? []), value]);
  };

  // Title first: it reads as a caption above the address it belongs to.
  put(mapping.sourceTitle, draft.source.title);
  put(mapping.sourceUrl, urlText(draft, style));

  if (parts.size === 0) return draft;

  const fields = { ...draft.fields };
  for (const [field, values] of parts) fields[field] = values.join("\n");

  return { ...draft, fields };
}
