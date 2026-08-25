import type { Result } from "./result";
import { err, ok } from "./result";

/**
 * Cloze deletions, as the `{{cN::answer::hint}}` markup Anki itself stores
 * (3.8). The field text is the single source of truth: a parallel list of
 * ranges would drift the moment the user edits the text by hand, so this
 * module parses on demand instead of remembering.
 *
 * The grammar is deliberately small — ordinal, answer, optional hint, no
 * nesting. Anything it cannot parse becomes a typed issue rather than a
 * silent reinterpretation of the user's text (3.11).
 */
export interface ClozeDeletion {
  readonly ordinal: number;
  /** Index of the opening `{{` in the field text. */
  readonly start: number;
  /** Index just past the closing `}}`. */
  readonly end: number;
  readonly answer: string;
  readonly hint?: string;
}

export type ClozeIssueCode =
  | "cloze-range-invalid"
  | "cloze-ordinal-invalid"
  | "cloze-overlap"
  | "cloze-markup-malformed"
  | "cloze-markup-unstable";

export interface ClozeIssue {
  readonly code: ClozeIssueCode;
  readonly message: string;
  /** The ordinal already occupying the range, on an overlap. */
  readonly ordinal?: number;
}

export interface DeletionRequest {
  readonly start: number;
  readonly end: number;
  /** Reusing an existing ordinal groups both spans under one `cN` (3.9). */
  readonly ordinal?: number;
  readonly hint?: string;
}

/** Ordinals start at 1; `c0` is not something Anki can represent. */
const DELETION = /\{\{c([1-9]\d*)::(.*?)(?:::(.*?))?\}\}/gs;

/** Every `{{c…` opener, valid or not, so malformed markup can be named. */
const OPENER = /\{\{c/g;

export function parseCloze(text: string): readonly ClozeDeletion[] {
  const deletions: ClozeDeletion[] = [];

  for (const match of text.matchAll(DELETION)) {
    const [whole, ordinal, answer, hint] = match;
    deletions.push({
      ordinal: Number(ordinal),
      start: match.index,
      end: match.index + whole.length,
      answer: answer ?? "",
      ...(hint === undefined ? {} : { hint }),
    });
  }

  return deletions;
}

/**
 * Markup this parser cannot account for — an unclosed deletion, or an ordinal
 * outside Anki's range. Plain braces in captured text are not malformed: they
 * only matter when they collide with a deletion, which `addDeletion` catches
 * by re-parsing what it produced (3.11).
 */
export function findMalformedCloze(text: string): ClozeIssue | undefined {
  const starts = new Set(parseCloze(text).map((deletion) => deletion.start));

  for (const opener of text.matchAll(OPENER)) {
    if (!starts.has(opener.index)) {
      return {
        code: "cloze-markup-malformed",
        message: `the cloze markup at character ${opener.index} does not parse`,
      };
    }
  }

  return undefined;
}

/**
 * The ordinal a new deletion takes: one past the highest in use (3.9). Public
 * because the editor labels its control with it, and a UI deriving `max + 1`
 * for itself would put the rule in two places.
 */
export function nextClozeOrdinal(deletions: readonly ClozeDeletion[]): number {
  return (
    deletions.reduce((highest, one) => Math.max(highest, one.ordinal), 0) + 1
  );
}

function markupFor(ordinal: number, answer: string, hint?: string): string {
  const suffix = hint === undefined || hint === "" ? "" : `::${hint}`;
  return `{{c${ordinal}::${answer}${suffix}}}`;
}

/** Ordinal, answer, and hint — what a round trip has to reproduce exactly. */
function contentOf(deletion: ClozeDeletion) {
  return {
    ordinal: deletion.ordinal,
    answer: deletion.answer,
    hint: deletion.hint,
  };
}

function sameContent(
  a: readonly ClozeDeletion[],
  b: readonly { ordinal: number; answer: string; hint?: string }[],
): boolean {
  return (
    a.length === b.length &&
    a.every((deletion, index) => {
      const expected = b[index];
      return (
        expected !== undefined &&
        deletion.ordinal === expected.ordinal &&
        deletion.answer === expected.answer &&
        (deletion.hint ?? "") === (expected.hint ?? "")
      );
    })
  );
}

/**
 * Wrap `[start, end)` of `text` in a deletion.
 *
 * The range is read against the text as given and used immediately — offsets
 * are never held across an edit.
 */
export function addDeletion(
  text: string,
  request: DeletionRequest,
): Result<string, ClozeIssue> {
  const malformed = findMalformedCloze(text);
  if (malformed) return err(malformed);

  const { start, end } = request;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > text.length ||
    start >= end
  ) {
    return err({
      code: "cloze-range-invalid",
      message: `${start}–${end} is not a range within the field`,
    });
  }

  if (
    request.ordinal !== undefined &&
    (!Number.isInteger(request.ordinal) || request.ordinal < 1)
  ) {
    return err({
      code: "cloze-ordinal-invalid",
      message: `c${request.ordinal} is not an ordinal Anki can represent`,
    });
  }

  const existing = parseCloze(text);
  const overlapping = existing.find(
    (deletion) => start < deletion.end && end > deletion.start,
  );
  if (overlapping) {
    return err({
      code: "cloze-overlap",
      message: `the range overlaps the deletion c${overlapping.ordinal}`,
      ordinal: overlapping.ordinal,
    });
  }

  const ordinal = request.ordinal ?? nextClozeOrdinal(existing);
  const answer = text.slice(start, end);
  const marked =
    text.slice(0, start) +
    markupFor(ordinal, answer, request.hint) +
    text.slice(end);

  // 3.11: assert the round trip rather than inventing an escaping scheme.
  // Captured web text may contain braces that collide with what we just wrote.
  const expected = [
    ...existing.filter((deletion) => deletion.end <= start).map(contentOf),
    { ordinal, answer, hint: request.hint },
    ...existing.filter((deletion) => deletion.start >= end).map(contentOf),
  ];
  if (
    findMalformedCloze(marked) ||
    !sameContent(parseCloze(marked), expected)
  ) {
    return err({
      code: "cloze-markup-unstable",
      message:
        "the text contains braces that would change what the markup means",
    });
  }

  return ok(marked);
}

/** Rebuild the text, replacing each deletion with whatever `replace` returns. */
function rewrite(
  text: string,
  replace: (deletion: ClozeDeletion) => string,
): string {
  let rebuilt = "";
  let cursor = 0;

  for (const deletion of parseCloze(text)) {
    rebuilt += text.slice(cursor, deletion.start) + replace(deletion);
    cursor = deletion.end;
  }

  return rebuilt + text.slice(cursor);
}

/**
 * Unwrap every span carrying `ordinal`. The remaining ordinals are left as
 * they are — a gap is legal in Anki, and renumbering here would rewrite
 * markup the user may have grouped deliberately (3.10).
 */
export function removeDeletionsByOrdinal(
  text: string,
  ordinal: number,
): string {
  return rewrite(text, (deletion) =>
    deletion.ordinal === ordinal
      ? deletion.answer
      : text.slice(deletion.start, deletion.end),
  );
}

/** Unwrap the deletion covering `index`, if there is one. */
export function removeDeletionAt(text: string, index: number): string {
  return rewrite(text, (deletion) =>
    deletion.start <= index && index < deletion.end
      ? deletion.answer
      : text.slice(deletion.start, deletion.end),
  );
}

/**
 * Close the gaps, on request only (3.10). Spans sharing an ordinal keep
 * sharing one.
 */
export function renumberDeletions(text: string): string {
  const ordinals = [
    ...new Set(parseCloze(text).map((one) => one.ordinal)),
  ].sort((a, b) => a - b);
  const renumbered = new Map(
    ordinals.map((ordinal, index) => [ordinal, index + 1]),
  );

  return rewrite(text, (deletion) =>
    markupFor(
      renumbered.get(deletion.ordinal) ?? deletion.ordinal,
      deletion.answer,
      deletion.hint,
    ),
  );
}

/** Back to plain text: every deletion becomes its answer, hints dropped (3.12). */
export function stripCloze(text: string): string {
  return rewrite(text, (deletion) => deletion.answer);
}
