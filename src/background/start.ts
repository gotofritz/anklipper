import { createRegistry } from "@/messaging/registry";
import type { RuntimeMessagingPort } from "@/platform/runtime-messaging";

export interface BackgroundDeps {
  readonly messaging: RuntimeMessagingPort;
}

/**
 * Wire up the background context and start listening.
 *
 * Nothing is kept in module scope: Firefox's event page and Chrome's service
 * worker are both unloaded when idle, so this runs again on every wake-up and
 * anything durable belongs in `StoragePort`.
 *
 * Returns the function that stops it again, which is what the tests use.
 */
export function startBackground(deps: BackgroundDeps): () => void {
  const registry = createRegistry();

  registry.on("ping", () => ({ from: "background" }) as const);

  return deps.messaging.onMessage((raw, sender) =>
    registry.dispatch(raw, sender),
  );
}
