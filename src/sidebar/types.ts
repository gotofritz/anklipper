import type { TextRange } from "./selection.dom";

/**
 * What a field editor lets the rest of the editor do to it (M10).
 *
 * The toolbar acts on whichever field has the caret, and the caret lives in a
 * `contenteditable` that only that component owns. Rather than passing DOM
 * nodes upward, each field registers this — three verbs and a question — so
 * the toolbar stays a set of intents (6.1) and nothing above it holds a node.
 */
export interface FieldApi {
  /** What the user has selected in this field, in the field's text offsets. */
  selection(): TextRange | undefined;
  /** Put the caret at a text offset, after the value has been rewritten. */
  placeCaret(offset: number): void;
  /** Put a whole selection back, after a toolbar action rewrote the markup. */
  select(start: number, end: number): void;
  focus(): void;
  /** Whether the field is currently showing its HTML source (10.4). */
  isSource(): boolean;
  /** Show the source, or stop (10.4). The editor's Ctrl+Shift+X ends here. */
  toggleSource(): void;
}

/** Registered on mount, and given up on unmount. */
export type RegisterField = (name: string, api: FieldApi | undefined) => void;

/**
 * Told whenever a field's selection moves, so the toolbar can act on it after
 * the button has taken the focus away from the field.
 */
export type ReportSelection = (
  field: string,
  range: TextRange | undefined,
) => void;
