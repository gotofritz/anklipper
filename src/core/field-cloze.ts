import type { ClozeDeletion, ClozeIssue, DeletionRequest } from "./cloze";
import {
  addDeletion,
  findMalformedCloze,
  nextClozeOrdinal,
  parseCloze,
} from "./cloze";
import type { FieldEdit } from "./field-html";
import { editField, fieldText } from "./field-html";
import type { Result } from "./result";
import { err, ok } from "./result";

/**
 * Cloze markup against a field that holds HTML (M10).
 *
 * The model does not change: `cloze.ts` still takes text plus a range and
 * returns text (3.8–3.11). What changes is that a field is markup now, so
 * something has to map between the two — and this is that something, kept out
 * of any Svelte handler because the mapping is where the off-by-one bugs live
 * and it needs tests of its own.
 *
 * The whole approach is one idea: `field-html.ts` puts markup and text in the
 * same coordinate space, so a range chosen in the rendered field is already a
 * range the model understands. What this module adds is splicing the braces
 * back in without disturbing the formatting they now wrap.
 */

/** The deletions in a field, read off its text (3.8). */
export function fieldDeletions(html: string): readonly ClozeDeletion[] {
  return parseCloze(fieldText(html));
}

export function nextFieldOrdinal(html: string): number {
  return nextClozeOrdinal(fieldDeletions(html));
}

export function findMalformedClozeInField(
  html: string,
): ClozeIssue | undefined {
  return findMalformedCloze(fieldText(html));
}

export interface MarkedField {
  readonly html: string;
  /** Where the caret belongs afterwards, as a **text** offset. */
  readonly caret: number;
}

function openerFor(ordinal: number): string {
  return `{{c${ordinal}::`;
}

function closerFor(hint?: string): string {
  return hint === undefined || hint === "" ? "}}" : `::${hint}}}`;
}

/**
 * Wrap `[start, end)` of the field's text in a deletion.
 *
 * The model is asked first and its answer is authoritative: an invalid range,
 * a taken ordinal, an overlap, and braces already in the text are all its
 * verdicts, not this module's. Only once it has said yes are the braces
 * spliced into the markup — as unmarked text, so `Paris` in bold becomes
 * `{{c1::<b>Paris</b>}}` and not `<b>{{c1::Paris}}</b>`.
 *
 * The result is then checked against what the model produced. If the two ever
 * disagree the mapping is wrong, and saying so is better than writing markup
 * whose meaning nobody can predict (3.11's rule, applied one layer up).
 */
export function markClozeInField(
  html: string,
  request: DeletionRequest,
): Result<MarkedField, ClozeIssue> {
  const text = fieldText(html);
  const inText = addDeletion(text, request);
  if (!inText.ok) return inText;

  const ordinal = request.ordinal ?? nextClozeOrdinal(parseCloze(text));
  const opener = openerFor(ordinal);
  const closer = closerFor(request.hint);

  const marked = editField(html, [
    { start: request.start, end: request.start, insert: opener, marks: [] },
    { start: request.end, end: request.end, insert: closer, marks: [] },
  ]);

  if (fieldText(marked) !== inText.value) {
    return err({
      code: "cloze-markup-unstable",
      message: "the field's markup and its text do not agree",
    });
  }

  return ok({
    html: marked,
    caret: request.end + opener.length + closer.length,
  });
}

/** Where a deletion's own braces sit, as two text ranges to cut out. */
function bracesOf(deletion: ClozeDeletion): readonly FieldEdit[] {
  const opener = openerFor(deletion.ordinal).length;
  const answerEnd = deletion.start + opener + deletion.answer.length;

  return [
    { start: deletion.start, end: deletion.start + opener, insert: "" },
    { start: answerEnd, end: deletion.end, insert: "" },
  ];
}

function unwrap(
  html: string,
  keep: (deletion: ClozeDeletion) => boolean,
): string {
  const edits = fieldDeletions(html)
    .filter((deletion) => !keep(deletion))
    .flatMap(bracesOf);

  return edits.length === 0 ? html : editField(html, edits);
}

/**
 * Unwrap every span carrying `ordinal`, leaving the rest — and the formatting
 * inside them — as they were (3.10).
 */
export function removeClozeFromField(html: string, ordinal: number): string {
  return unwrap(html, (deletion) => deletion.ordinal !== ordinal);
}

/** Back to plain content: every deletion becomes its answer, hints dropped (3.12). */
export function stripClozeFromField(html: string): string {
  return unwrap(html, () => false);
}
