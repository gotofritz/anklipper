import type { GenerationDefaults } from "@/core/generate";
import type { DraftStore } from "@/core/ports/types";
import { createRegistry } from "@/messaging/registry";
import { createMessenger } from "@/messaging/messenger";
import type { CommandsPort } from "@/platform/commands";
import type { ContextMenusPort } from "@/platform/context-menus";
import type { RuntimeMessagingPort } from "@/platform/runtime-messaging";
import type { ScriptingPort } from "@/platform/scripting";
import type { SidebarPort } from "@/platform/sidebar";

import type { CaptureReport, CaptureTrigger } from "./capture";
import { captureFromGesture, describeCapture } from "./capture";

/** The context-menu entry, and the `commands` key its shortcut is declared under. */
export const CAPTURE_MENU_ITEM = "create-anki-card";
export const CAPTURE_COMMAND = "create-anki-card";
export const CAPTURE_TITLE = "Create Anki Card";

export interface BackgroundDeps {
  readonly messaging: RuntimeMessagingPort;
  readonly menus: ContextMenusPort;
  readonly commands: CommandsPort;
  readonly scripting: ScriptingPort;
  readonly sidebar: SidebarPort;
  readonly drafts: DraftStore;
  /** Where a capture waits when a draft is already in flight (7.4). */
  readonly pending: DraftStore;
  readonly defaults?: GenerationDefaults;
  readonly now?: () => Date;
  /**
   * Told what each capture did (5.4). A failed capture stores nothing, so
   * without this it reaches the user as a sidebar that appears to do nothing.
   * The report carries no page content — see `describeCapture`.
   */
  readonly report?: (report: CaptureReport) => void;
}

/**
 * Wire up the background context and start listening.
 *
 * Nothing is kept in module scope: Firefox's event page and Chrome's service
 * worker are both unloaded when idle, so this runs again on every wake-up and
 * anything durable belongs in a store. The menus are therefore re-registered
 * on every start, which is why they are removed first.
 *
 * Returns the function that stops it again, which is what the tests use.
 */
export function startBackground(deps: BackgroundDeps): () => void {
  const registry = createRegistry();
  const messenger = createMessenger(deps.messaging);

  registry.on("ping", () => ({ from: "background" }) as const);
  registry.on("get-draft", async () => {
    const [stored, waiting] = await Promise.all([
      deps.drafts.load(),
      deps.pending.load(),
    ]);

    // A read that failed and an empty store are the same thing to the sidebar:
    // there is nothing to show. The store's own error is not the sidebar's.
    return {
      draft: stored.ok ? stored.value : undefined,
      // 7.4: what the sidebar asks about, when a second gesture arrived while
      // the first card was still being edited.
      pending: waiting.ok ? waiting.value : undefined,
    };
  });

  const capture = async (trigger: CaptureTrigger) => {
    const result = await captureFromGesture(trigger, {
      messenger,
      scripting: deps.scripting,
      sidebar: deps.sidebar,
      drafts: deps.drafts,
      pending: deps.pending,
      ...(deps.defaults === undefined ? {} : { defaults: deps.defaults }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
    });

    deps.report?.(describeCapture(result));
  };

  // Not awaited: the click handler has to reach `sidebar.open` inside the
  // gesture's own task, and the menu API does not wait for this promise.
  const stopClicks = deps.menus.onClicked((click) => {
    if (click.menuItemId !== CAPTURE_MENU_ITEM) return;
    void capture(click);
  });

  const stopCommands = deps.commands.onCommand((invocation) => {
    if (invocation.command !== CAPTURE_COMMAND) return;
    void capture(invocation);
  });

  void registerMenu(deps);

  const stopMessages = deps.messaging.onMessage((raw, sender) =>
    registry.dispatch(raw, sender),
  );

  return () => {
    stopMessages();
    stopClicks();
    stopCommands();
  };
}

/** Shown only on a selection: there is nothing to capture without one. */
async function registerMenu(deps: BackgroundDeps): Promise<void> {
  await deps.menus.removeAll();
  await deps.menus.create({
    id: CAPTURE_MENU_ITEM,
    title: CAPTURE_TITLE,
    contexts: ["selection"],
  });
}
