import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

import autoImports from "./.wxt/eslint-auto-imports.mjs";
import svelteConfig from "./svelte.config.js";

export default ts.config(
  {
    ignores: [
      ".output/",
      ".wxt/",
      "coverage/",
      "node_modules/",
      // Vendored skills and plugin scripts; not ours to reformat.
      ".claude/",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    // `browser`, `defineBackground`, `storage`, … are injected by WXT rather
    // than imported, so ESLint has to be told they exist.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...autoImports.globals },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: [".svelte"],
        svelteConfig,
      },
    },
  },
  {
    // Ports and adapters (P3): the domain layer talks to interfaces, never to
    // the browser or to a UI framework. `src/platform/` is the exception by
    // definition — it is the adapter layer, and the only place `browser.*` is
    // reached (2.3). M3 widens this list again with the card model.
    files: [
      "src/core/**/*.ts",
      "src/lib/**/*.ts",
      "src/manifest/**/*.ts",
      "src/messaging/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "wxt/browser",
              message:
                "The domain layer depends on ports, not on browser APIs. Inject an adapter.",
            },
            {
              name: "webextension-polyfill",
              message:
                "The domain layer depends on ports, not on browser APIs. Inject an adapter.",
            },
            {
              name: "svelte",
              message:
                "The domain layer must not depend on the UI framework. Keep Svelte in components.",
            },
          ],
          patterns: [
            {
              group: ["*.svelte"],
              message:
                "The domain layer must not depend on the UI framework. Keep Svelte in components.",
            },
          ],
        },
      ],
    },
  },
  // Last: turns off every rule Prettier already decides.
  prettier,
);
