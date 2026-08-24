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
