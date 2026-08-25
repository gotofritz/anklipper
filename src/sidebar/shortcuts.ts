/**
 * The editor's keyboard, matched to Anki's (10.7).
 *
 * Muscle memory is most of the value here, so a different set would be worse
 * than none — which is also why this is a table and not a pile of conditions
 * inside a Svelte handler: what is bound has to be readable in one place, and
 * testable without rendering anything.
 *
 * The exception 10.7 allows is a collision with the browser's own. Anki clears
 * formatting with **Ctrl+R**, which is reload; that one is a toolbar button
 * and nothing else. The rest are claimed with `preventDefault`, including
 * Ctrl+U and Ctrl+B, which the browser would otherwise spend on view-source
 * and the bookmarks sidebar.
 */
export type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "subscript"
  | "superscript"
  /** Mark the selection as a new deletion. */
  | "cloze"
  /** Mark it as part of the deletion already in progress (3.9). */
  | "cloze-group"
  /** Show the field as HTML source, or stop (10.4). */
  | "source"
  /** Anki's "remove formatting". Toolbar only — see the note above. */
  | "clear"
  | "submit";

/** As much of a `KeyboardEvent` as the table reads. */
export interface KeyChord {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

interface Binding {
  readonly command: EditorCommand;
  /** Matched case-insensitively against `key`, or against `code`. */
  readonly keys: readonly string[];
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/**
 * Ordered most specific first: Ctrl+Shift+Alt+C is also a Ctrl+Shift+C as far
 * as the letter goes, and the grouping variant has to win.
 */
const BINDINGS: readonly Binding[] = [
  { command: "cloze-group", keys: ["c"], shift: true, alt: true },
  { command: "cloze", keys: ["c"], shift: true },
  { command: "source", keys: ["x"], shift: true },
  // Anki's superscript is Ctrl+Shift+=, which on most layouts arrives as `+`.
  // `Equal` is the same physical key on any of them.
  { command: "superscript", keys: ["=", "+", "Equal"], shift: true },
  { command: "subscript", keys: ["=", "Equal"] },
  { command: "bold", keys: ["b"] },
  { command: "italic", keys: ["i"] },
  { command: "underline", keys: ["u"] },
  { command: "submit", keys: ["Enter"] },
];

/**
 * What each command's button is labelled with. Partial on purpose: `clear` is
 * the command with no chord, because Anki's Ctrl+R is the browser's reload.
 */
export const SHORTCUT_HINTS: Readonly<Partial<Record<EditorCommand, string>>> =
  {
    bold: "Ctrl+B",
    italic: "Ctrl+I",
    underline: "Ctrl+U",
    subscript: "Ctrl+=",
    superscript: "Ctrl+Shift+=",
    cloze: "Ctrl+Shift+C",
    "cloze-group": "Ctrl+Alt+Shift+C",
    source: "Ctrl+Shift+X",
    submit: "Ctrl+Enter",
  };

function matches(chord: KeyChord, binding: Binding): boolean {
  const key = chord.key.toLowerCase();
  const named = binding.keys.some(
    (one) => one.toLowerCase() === key || one === chord.code,
  );
  if (!named) return false;

  return (
    (chord.shiftKey ?? false) === (binding.shift ?? false) &&
    (chord.altKey ?? false) === (binding.alt ?? false)
  );
}

/**
 * Which command a keystroke asks for, if any.
 *
 * Ctrl or Command is required throughout: without one the keystroke is
 * somebody typing into a field, and stealing it would be the worst bug this
 * table could have.
 */
export function commandFor(chord: KeyChord): EditorCommand | undefined {
  if (!(chord.ctrlKey ?? false) && !(chord.metaKey ?? false)) return undefined;

  return BINDINGS.find((binding) => matches(chord, binding))?.command;
}
