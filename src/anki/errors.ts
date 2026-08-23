import { parseCloze } from "@/core/cloze";
import type { CardDraft } from "@/core/draft";
import { primaryFieldOf } from "@/core/note-type";
import type { AnkiError, AnkiErrorKind } from "@/core/ports/types";

/**
 * AnkiConnect's error strings, turned into the typed taxonomy (4.2).
 *
 * The add-on answers `{"result": null, "error": "..."}` and the string is all
 * there is to go on, so this is pattern matching by necessity. The add-on's
 * own words are always kept: a kind we guessed wrong is still recoverable if
 * the user can read what Anki actually said.
 */
const PATTERNS: readonly (readonly [RegExp, AnkiErrorKind])[] = [
  // Before everything else: a key failure makes every other call fail too,
  // and the fix is a settings change rather than a connection one (4.8).
  [/api key/i, "api-key-required"],
  [
    /no cloze deletion|cloze deletion.*(missing|none)|has no cloze/i,
    "empty-cloze",
  ],
  [/duplicate/i, "duplicate-note"],
  [/deck was not found|unknown deck|deck name/i, "unknown-deck"],
  [
    /model was not found|note type was not found|unknown model/i,
    "unknown-note-type",
  ],
  [/field/i, "unknown-field"],
];

export function classifyApiError(message: string): AnkiError {
  for (const [pattern, kind] of PATTERNS) {
    if (pattern.test(message)) return { kind, message };
  }

  return { kind: "api-error", message };
}

/**
 * The same, with the draft in hand.
 *
 * Anki refuses a cloze note that has no deletions with the same "it is empty"
 * it uses for a blank first field, and the two need different fixes. The draft
 * settles it: this layer can see whether the note type is cloze-flavoured and
 * whether its primary field parses to any deletions at all. M3's validation
 * should have caught this before the request went out, so reaching here means
 * the two disagree — which is exactly why it gets its own cause rather than
 * being folded into `api-error`.
 */
export function classifyAddNoteError(
  message: string,
  draft: CardDraft,
): AnkiError {
  const classified = classifyApiError(message);
  if (classified.kind === "empty-cloze") return classified;
  if (!/empty/i.test(message)) return classified;
  if (draft.noteType.kind !== "cloze") return classified;

  const primary = primaryFieldOf(draft.noteType);
  const text = primary === undefined ? "" : (draft.fields[primary] ?? "");
  if (parseCloze(text).length > 0) return classified;

  return { kind: "empty-cloze", message };
}
