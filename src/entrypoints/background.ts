import { startBackground } from "@/background/start";
import { createRuntimeMessaging } from "@/platform/runtime-messaging";

// A shell. The background is an event page on Firefox and a service worker on
// Chrome, and both are unloaded when idle — so this runs on every wake-up, and
// keeps no state of its own. Logic lives in `@/background/`, where tests reach
// it: the TDD gate exempts entrypoints.
export default defineBackground(() => {
  startBackground({ messaging: createRuntimeMessaging() });
});
