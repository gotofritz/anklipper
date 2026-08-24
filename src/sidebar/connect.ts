import type { CardDraft } from "@/core/draft";
import type { Messenger } from "@/messaging/messenger";
import type { ExtensionContext } from "@/platform/types";

export type SidebarStatus =
  | { readonly kind: "connecting" }
  | { readonly kind: "connected"; readonly from: ExtensionContext }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Ask the background whether it is up.
 *
 * The background is unloaded when idle on both browsers, so an unanswered
 * ping is a state to show, not a crash to propagate.
 */
export async function pingBackground(
  messenger: Messenger,
): Promise<SidebarStatus> {
  const reply = await messenger.send({ type: "ping" });

  return reply.ok
    ? { kind: "connected", from: reply.value.from }
    : {
        kind: "unavailable",
        reason: `${reply.error.kind}: ${reply.error.message}`,
      };
}

/**
 * What the sidebar has to show. `empty` is the first-run state and not a
 * failure: the sidebar persists per window on Firefox, so it is often open
 * before anything has been captured.
 */
export type DraftStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "captured"; readonly draft: CardDraft }
  | { readonly kind: "empty" }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Pull the captured draft (M5).
 *
 * The sidebar reads the draft back out rather than being handed it: the
 * gesture opens the sidebar and the capture stores the draft, and those two
 * finish in no fixed order.
 */
export async function loadDraft(messenger: Messenger): Promise<DraftStatus> {
  const reply = await messenger.send({ type: "get-draft" });

  if (!reply.ok) {
    return {
      kind: "unavailable",
      reason: `${reply.error.kind}: ${reply.error.message}`,
    };
  }
  return reply.value.draft === undefined
    ? { kind: "empty" }
    : { kind: "captured", draft: reply.value.draft };
}
