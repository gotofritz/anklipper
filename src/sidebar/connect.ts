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
