import { createDevHarness } from "@/anki/dev-harness";
import type { CaptureReport } from "@/background/capture";
import { startBackground } from "@/background/start";
import { createCommands } from "@/platform/commands";
import { createContextMenus } from "@/platform/context-menus";
import { PENDING_KEY, createStoredDrafts } from "@/platform/draft-store";
import { createOrigin } from "@/platform/origin";
import {
  ANKI_CONNECT_HOST_PERMISSION,
  createPermissions,
} from "@/platform/permissions";
import { createRuntimeMessaging } from "@/platform/runtime-messaging";
import { createScripting } from "@/platform/scripting";
import { createBrowserSidebar } from "@/platform/sidebar";
import { createStorage } from "@/platform/storage";

// A shell. The background is an event page on Firefox and a service worker on
// Chrome, and both are unloaded when idle — so this runs on every wake-up, and
// keeps no state of its own. Logic lives in `@/background/`, where tests reach
// it: the TDD gate exempts entrypoints.
export default defineBackground(() => {
  const storage = createStorage();

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

    (globalThis as unknown as Record<string, unknown>).anklipper =
      createDevHarness({
        origin: createOrigin().extensionOrigin(),
        hasHostPermission: () => permissions.has(ANKI_CONNECT_HOST_PERMISSION),
      });
  }
});
