import { resolve } from "node:path";
import { defineConfig } from "wxt";

import { manifestExtras } from "./src/manifest/manifest";

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
    // The permission ceiling and the pinned extension identity live in
    // `src/manifest/manifest.ts`, where a test pins them (2.4, 2.5). WXT adds
    // the sidebar surface itself, from the sidepanel entrypoint:
    // `sidebar_action` on Firefox, `side_panel` plus its permission on Chrome.
    ...manifestExtras(browser),
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
