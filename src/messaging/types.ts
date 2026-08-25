import type { PageCapture } from "@/core/capture";
import type { CardDraft } from "@/core/draft";
import type { Result } from "@/core/result";
import type { ExtensionContext, TransportErrorKind } from "@/platform/types";

/**
 * Every message the extension sends, as one discriminated union on `type`
 * (2.1). Background, content script, and sidebar all import this module, and
 * that shared import is the only thing keeping the three from drifting apart.
 *
 * Adding a message means adding a member here and its reply in `ResponseMap`;
 * the compiler then finds every place that has to change.
 */
export type Message =
  | { readonly type: "ping" }
  /** Background to a content script: read the page's current selection (5.1). */
  | { readonly type: "capture-selection" }
  /** Sidebar to the background: what was captured, if anything. */
  | { readonly type: "get-draft" };

export type MessageType = Message["type"];

export type MessageOf<K extends MessageType> = Extract<Message, { type: K }>;

/** What each message is answered with, keyed by the message's `type`. */
export interface ResponseMap {
  /** Which context answered — the sidebar uses it to know the background is up. */
  readonly ping: { readonly from: ExtensionContext };
  /**
   * What the page gave up. Blind spots arrive as warnings on the capture
   * rather than as a failed reply (5.4): a degraded capture still makes a
   * card, and the warning is what makes the degradation visible.
   */
  readonly "capture-selection": PageCapture;
  /**
   * `draft` is `undefined` when nothing has been captured yet — the first-run
   * state. `pending` is the capture that arrived while `draft` was already
   * being edited (7.4), which the sidebar asks the user about rather than
   * replacing their work with.
   */
  readonly "get-draft": {
    readonly draft: CardDraft | undefined;
    readonly pending: CardDraft | undefined;
  };
}

export type ResponseOf<K extends MessageType> = ResponseMap[K];

/**
 * Why a message did not produce its reply. The transport's own failures pass
 * through unchanged; the rest happen at the far end.
 */
export type MessagingErrorKind =
  | TransportErrorKind
  /** No handler is registered for this type, or it was not a message at all. */
  | "unknown-message"
  /** A handler threw. The exception does not escape the far context. */
  | "handler-failed"
  /** Something answered, but not with the `Result` every handler owes (2.2). */
  | "malformed-reply";

export interface MessagingError {
  readonly kind: MessagingErrorKind;
  readonly message: string;
}

/** Every message is answered with a Result, never a bare value (2.2). */
export type Reply<K extends MessageType> = Result<
  ResponseOf<K>,
  MessagingError
>;
