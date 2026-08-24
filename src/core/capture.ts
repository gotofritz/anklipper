/**
 * What one capture off a page amounts to, before any of it becomes a card
 * (M5). A plain value with no DOM in it: `src/content/extract.dom.ts` fills it
 * in from a live page, `generateFromCapture` turns it into a `CardDraft`, and
 * neither this module nor anything importing it needs a browser.
 */

/** 5.3. Select-all on a long article is megabytes; the cap bites first. */
export const SELECTION_CAP = 10_000;

/** 5.3. The surrounding block's text, which is context and not content. */
export const CONTEXT_CAP = 1_000;

/**
 * 5.2 keeps the original markup for a later milestone to offer rich capture
 * from. Markup is several times the length of the text it wraps, so its cap
 * is looser than the selection's — but it is still a cap, because this
 * crosses a message boundary.
 */
export const HTML_CAP = 40_000;

/**
 * What could not be captured, or was captured only in part (5.4). A card
 * silently missing its context is worse than a message saying so, and each
 * kind names a different thing for the user to do about it.
 */
export type CaptureWarningKind =
  /** The selection was longer than `SELECTION_CAP`. */
  | "selection-truncated"
  /** The surrounding block was longer than `CONTEXT_CAP`. */
  | "context-truncated"
  /** The markup was longer than `HTML_CAP` and was not kept. */
  | "html-dropped"
  /** No block-level ancestor carried any usable text. */
  | "context-unavailable"
  /** `getSelection()` does not reach into a shadow root. */
  | "shadow-dom"
  /** A cross-origin frame is a separate context; this one cannot read it. */
  | "cross-origin-frame"
  /** No content script ran — a privileged page, or the built-in PDF viewer. */
  | "no-content-script";

export interface CaptureWarning {
  readonly kind: CaptureWarningKind;
  readonly message: string;
}

export function warn(
  kind: CaptureWarningKind,
  message: string,
): CaptureWarning {
  return { kind, message };
}

/** One capture: the selection, what surrounds it, and where it came from. */
export interface PageCapture {
  /** The selection as plain text, line breaks preserved (5.2), capped (5.3). */
  readonly text: string;
  /** The original markup, kept for a later rich capture (5.2). Empty if dropped. */
  readonly html: string;
  /** The nearest block-level ancestor's text (5.3). */
  readonly context: string;
  /** The nearest preceding `h1`–`h6` (5.3), or empty. */
  readonly heading: string;
  readonly title: string;
  readonly url: string;
  readonly warnings: readonly CaptureWarning[];
}

export interface CappedText {
  readonly text: string;
  readonly truncated: boolean;
}

/** Cut at the cap and say whether it cut. The caller decides what to warn. */
export function capText(value: string, cap: number): CappedText {
  return value.length <= cap
    ? { text: value, truncated: false }
    : { text: value.slice(0, cap), truncated: true };
}
