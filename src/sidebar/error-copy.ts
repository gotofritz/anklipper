import type { ClozeIssue, ClozeIssueCode } from "@/core/cloze";
import type { DraftIssue, DraftIssueCode } from "@/core/draft";
import type {
  AnkiError,
  AnkiErrorKind,
  DraftStoreError,
  StoreErrorKind,
} from "@/core/ports/types";

/**
 * Every sentence the editor says about a failure (6.4).
 *
 * One module rather than strings inline in markup, for two reasons. M9 builds
 * onboarding on the same taxonomy and has to say the same things; and a cause
 * without a next action — "Failed to add note" — tells the user nothing they
 * can act on, which is easy to notice in a table and easy to miss in a
 * component.
 *
 * The tables are keyed by the unions themselves, so a cause added to M3's or
 * M4's taxonomy without copy here is a type error rather than a silent
 * "something went wrong".
 */
export interface ErrorCopy {
  /** What went wrong, in the user's terms. */
  readonly cause: string;
  /** The one thing to do about it. */
  readonly action: string;
}

const ANKI_COPY: Readonly<
  Record<AnkiErrorKind, (error: AnkiError) => ErrorCopy>
> = {
  "anki-not-running": () => ({
    cause: "Anki is not running.",
    action: "Start Anki, leave it open, and try again.",
  }),
  "addon-missing": () => ({
    cause: "Something answered on Anki’s port, but it was not AnkiConnect.",
    action:
      "Install the AnkiConnect add-on in Anki, restart Anki, and try again.",
  }),
  "permission-missing": () => ({
    cause: "Anklipper has not been allowed to reach Anki on this computer.",
    action: "Grant Anklipper access to the local Anki, then try again.",
  }),
  "api-key-required": () => ({
    cause:
      "AnkiConnect is set to require an API key, and this one was refused.",
    action: "Copy the key from AnkiConnect’s settings into Anklipper.",
  }),
  "malformed-response": () => ({
    cause: "AnkiConnect answered with something Anklipper cannot read.",
    action: "Update AnkiConnect and Anklipper, then try again.",
  }),
  "duplicate-note": () => ({
    cause: "Anki already has a note whose first field is this one.",
    action:
      "Change the first field, or add it anyway — duplicates are allowed.",
  }),
  "unknown-deck": () => ({
    cause: "Anki has no deck by that name.",
    action: "Pick a deck from the list, or create it in Anki first.",
  }),
  "unknown-note-type": () => ({
    cause: "Anki has no note type by that name.",
    action: "Pick a note type from the list, or create it in Anki first.",
  }),
  "unknown-field": () => ({
    cause: "This note type does not have the field the card was written for.",
    action: "Reload the note types, then check the field names in Anki.",
  }),
  timeout: () => ({
    cause: "Anki took the request and never answered.",
    action: "Check whether a dialog is waiting in Anki, then try again.",
  }),
  // The add-on's own words are the only information this one carries, so they
  // are the cause rather than a footnote to it (M4's taxonomy keeps them).
  "api-error": (error) => ({
    cause: `Anki refused the request: ${error.message}`,
    action: "Fix what Anki named above, then try again.",
  }),
};

export function ankiErrorCopy(error: AnkiError): ErrorCopy {
  return ANKI_COPY[error.kind](error);
}

const CLOZE_COPY: Readonly<
  Record<ClozeIssueCode, (issue: ClozeIssue) => string>
> = {
  "cloze-range-invalid": () =>
    "Select the text you want to hide, then mark it.",
  "cloze-ordinal-invalid": () =>
    "That is not a deletion number Anki can store.",
  "cloze-overlap": (issue) =>
    `That selection overlaps c${issue.ordinal}. Pick a range outside it, or remove c${issue.ordinal} first.`,
  "cloze-markup-malformed": () =>
    "The cloze markup in this field does not parse. Check the braces before marking anything else.",
  "cloze-markup-unstable": () =>
    "This text has braces of its own that would change what the markup means. Edit them, then mark again.",
};

export function clozeIssueCopy(issue: ClozeIssue): string {
  return CLOZE_COPY[issue.code](issue);
}

const DRAFT_COPY: Readonly<
  Record<DraftIssueCode, (issue: DraftIssue) => string>
> = {
  "deck-missing": () => "Choose the deck this card goes into.",
  "note-type-missing": () => "Choose a note type Anki knows about.",
  "unknown-field": (issue) => issue.message,
  "field-required": (issue) =>
    `${issue.field ?? "This field"} cannot be empty.`,
  "tag-malformed": (issue) =>
    `Tags cannot contain spaces — “${issue.tag ?? issue.message}” would be more than one tag in Anki.`,
  "cloze-no-deletions": (issue) =>
    `Mark at least one cloze deletion in ${issue.field ?? "the first field"} before adding this card.`,
  "cloze-markup-malformed": () =>
    "The cloze markup in this field does not parse. Check the braces.",
  "note-type-not-cloze": (issue) => issue.message,
  "note-type-not-standard": (issue) => issue.message,
};

export function draftIssueCopy(issue: DraftIssue): string {
  return DRAFT_COPY[issue.code](issue);
}

/**
 * 7.1's failure, in one line rather than a cause and an action: it is
 * appended to a sentence that already says what is at stake, so a second
 * "try again" would be the third imperative in a row.
 */
const STORE_COPY: Readonly<Record<StoreErrorKind, string>> = {
  "read-failed": "The browser would not give the saved copy back.",
  "write-failed": "The browser refused to store it — it may be out of space.",
  "malformed-stored-value":
    "What was stored is not a card Anklipper can read back.",
};

export function draftStoreErrorCopy(error: DraftStoreError): string {
  return `${STORE_COPY[error.kind]} Add it now, or copy the text somewhere safe.`;
}
