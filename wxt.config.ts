import { resolve } from "node:path";
import { defineConfig } from "wxt";

// Firefox is the default target (P5); `pnpm dev:chrome` / `pnpm build:chrome`
// keep the Chrome build compiling.
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte"],
  // Firefox still accepts MV2, and WXT defaults to it for Firefox. Pin MV3 so
  // both targets build the same manifest generation.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Anklipper",
    description:
      "Turn text selected on a web page into an Anki card, via AnkiConnect.",
    // M1 declares no permissions. The permission set and the host permission
    // for AnkiConnect arrive in M2, with the code that needs them.
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              // Pinned so the moz-extension:// origin survives reloads —
              // AnkiConnect allowlists the extension by origin, and a new UUID
              // would break the user's own allowlist entry (P8).
              id: "anklipper@gotofritz.net",
              strict_min_version: "128.0",
              // Required by AMO for new extensions. Nothing leaves the browser
              // except to the local AnkiConnect on loopback.
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
  zip: {
    // AMO needs sources it can rebuild from; it does not need the plans or
    // the vendored agent tooling.
    excludeSources: ["docs/**", ".claude/**"],
  },
  webExt: {
    // A temporary profile draws a new moz-extension:// UUID on every reload,
    // which would break the developer's own AnkiConnect allowlist entry (1.10).
    firefoxProfile: resolve(".wxt/firefox-data"),
    keepProfileChanges: true,
  },
});
