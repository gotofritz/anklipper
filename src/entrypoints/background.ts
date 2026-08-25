import { createDevHarness } from "@/anki/dev-harness";
import { ankiConfigFrom } from "@/anki/from-settings";
import type { CaptureReport } from "@/background/capture";
import { resolveDefaults } from "@/background/defaults";
import { startBackground } from "@/background/start";
import { createCommands } from "@/platform/commands";
import { createContextMenus } from "@/platform/context-menus";
import { PENDING_KEY, createStoredDrafts } from "@/platform/draft-store";
import { createOrigin } from "@/platform/origin";
import { createPermissions, hostPermissionFor } from "@/platform/permissions";
import { createStoredRemembered } from "@/platform/remembered-store";
import { createRuntimeMessaging } from "@/platform/runtime-messaging";
import { createScripting } from "@/platform/scripting";
import {
  createStoredSettings,
  loadSettingsOrDefaults,
} from "@/platform/settings-store";
import { createBrowserSidebar } from "@/platform/sidebar";
import { createStorage } from "@/platform/storage";

// A shell. The background is an event page on Firefox and a service worker on
// Chrome, and both are unloaded when idle — so this runs on every wake-up, and
// keeps no state of its own. Logic lives in `@/background/`, where tests reach
// it: the TDD gate exempts entrypoints.
export default defineBackground(() => {
  const storage = createStorage();

  // What a new draft starts from (M8): what the user configured, and the deck
  // the last card actually went into. Resolved per gesture rather than read
  // once — the background is unloaded when idle, so there is nothing to cache
  // it in, and the options page can change it between two captures.
  const settings = createStoredSettings(storage);
  const remembered = createStoredRemembered(storage);

  startBackground({
    messaging: createRuntimeMessaging(),
    menus: createContextMenus(),
    commands: createCommands(),
    scripting: createScripting(),
    sidebar: createBrowserSidebar(),
    drafts: createStoredDrafts(storage),
    // One draft is edited at a time (7.4): a gesture made while another card
    // is open parks its draft here, and the sidebar asks which was meant.
    pending: createStoredDrafts(storage, PENDING_KEY),
    defaults: () => resolveDefaults({ settings, remembered }),
    // What each capture did, in development only. The report carries kinds
    // and our own messages — never the draft, the selection, or the page —
    // so this stays inside the privacy rule; the DEV guard keeps it out of a
    // release regardless.
    //
    // Every capture, not only the failures: a clean capture logging nothing
    // is indistinguishable from a build that never ran, which is exactly the
    // ambiguity this exists to remove.
    ...(import.meta.env.DEV
      ? {
          report: (report: CaptureReport) => {
            console[report.outcome === "failed" ? "warn" : "info"](
              "anklipper: capture",
              report,
            );
          },
        }
      : {}),
  });

  // M4's manual checks need the adapter driven from a real extension origin,
  // which only exists in a running browser. This is the wiring for that, and
  // it is the wiring only: the harness itself is `@/anki/dev-harness`, under
  // test. `import.meta.env.DEV` is false in every build, so nothing here
  // reaches a release — see docs/developer-guide.md.
  if (import.meta.env.DEV) {
    const permissions = createPermissions();
    const origin = createOrigin().extensionOrigin();
    const hasHostPermission = (endpoint: string) =>
      permissions.has(hostPermissionFor(endpoint));

    // Built from the settings, so a developer who moved AnkiConnect's port
    // gets a harness pointed at it (M8). Reading them is asynchronous, so the
    // global appears a microtask after this runs — which is long before a
    // console is open to type into it. It reflects the settings as of this
    // start; changing them and reloading the background gives a fresh one.
    void loadSettingsOrDefaults(settings).then((current) => {
      (globalThis as unknown as Record<string, unknown>).anklipper =
        createDevHarness({
          ...ankiConfigFrom(current, { origin, hasHostPermission }),
          hasHostPermission: () => hasHostPermission(current.endpoint),
        });
    });
  }
});
