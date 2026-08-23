import { findMalformedCloze, parseCloze } from "./cloze";
import type { CardDraft, DraftIssue } from "./draft";
import { isWellFormedTag } from "./draft";
import { hasField, primaryFieldOf } from "./note-type";

/**
 * Everything wrong with a draft, as a list of typed issues rather than a
 * boolean (3.4): the editor has to point at the field and say why.
 *
 * The list is complete — validation does not stop at the first problem, since
 * a user fixing one at a time is a worse experience than seeing all of them.
 */
export function validateDraft(draft: CardDraft): readonly DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (draft.deck.trim() === "") {
    issues.push({ code: "deck-missing", message: "the draft has no deck" });
  }

  if (draft.noteType.name.trim() === "" || draft.noteType.fields.length === 0) {
    issues.push({
      code: "note-type-missing",
      message: "the draft has no usable note type",
    });
    return issues;
  }

  for (const field of Object.keys(draft.fields)) {
    if (!hasField(draft.noteType, field)) {
      issues.push({
        code: "unknown-field",
        message: `${draft.noteType.name} has no field called ${field}`,
        field,
      });
    }
  }

  for (const field of draft.noteType.requiredFields) {
    if ((draft.fields[field] ?? "").trim() === "") {
      issues.push({
        code: "field-required",
        message: `${field} may not be empty`,
        field,
      });
    }
  }

  for (const tag of draft.tags) {
    if (!isWellFormedTag(tag)) {
      issues.push({
        code: "tag-malformed",
        message: `"${tag}" is not a tag Anki can store`,
        tag,
      });
    }
  }

  issues.push(...clozeIssues(draft));

  return issues;
}

/**
 * A cloze note with no deletion is rejected by AnkiConnect anyway; catching it
 * here gives a better error and one fewer round trip. Standard note types are
 * left alone — braces in their fields are just text (3.7).
 */
function clozeIssues(draft: CardDraft): readonly DraftIssue[] {
  if (draft.noteType.kind !== "cloze") return [];

  const field = primaryFieldOf(draft.noteType);
  if (field === undefined) return [];
  const text = draft.fields[field] ?? "";

  // Malformed markup is reported on its own: how many deletions the field
  // holds is exactly what cannot be known while it does not parse (3.11).
  const malformed = findMalformedCloze(text);
  if (malformed) {
    return [
      { code: "cloze-markup-malformed", message: malformed.message, field },
    ];
  }

  if (parseCloze(text).length === 0) {
    return [
      {
        code: "cloze-no-deletions",
        message: `${field} has no cloze deletion`,
        field,
      },
    ];
  }

  return [];
}
