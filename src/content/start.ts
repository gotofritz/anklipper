import { createRegistry } from "@/messaging/registry";
import type { RuntimeMessagingPort } from "@/platform/runtime-messaging";

export interface ContentDeps {
  readonly messaging: RuntimeMessagingPort;
}

/**
 * Wire up the page context and start listening.
 *
 * The content script is absent on privileged pages, on the browser's own
 * add-on listing, in the PDF viewer, and in any tab that predates the
 * extension. That is ordinary: a message sent to a tab without one comes back
 * as `no-receiver`, and the caller acts on it.
 *
 * Selection and page-context extraction arrive in M5.
 */
export function startContent(deps: ContentDeps): () => void {
  const registry = createRegistry();

  registry.on("ping", () => ({ from: "content" }) as const);

  return deps.messaging.onMessage((raw, sender) =>
    registry.dispatch(raw, sender),
  );
}
