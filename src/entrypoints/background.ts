import { createDevHarness } from "@/anki/dev-harness";
import { startBackground } from "@/background/start";
import { createCommands } from "@/platform/commands";
import { createContextMenus } from "@/platform/context-menus";
import { createStoredDrafts } from "@/platform/draft-store";
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
  startBackground({
    messaging: createRuntimeMessaging(),
    menus: createContextMenus(),
    commands: createCommands(),
    scripting: createScripting(),
    sidebar: createBrowserSidebar(),
    drafts: createStoredDrafts(createStorage()),
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
