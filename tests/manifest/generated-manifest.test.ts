import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { build } from "wxt";
import { beforeAll, describe, expect, it } from "vitest";

import { CONTENT_SCRIPT_FILE } from "@/platform/scripting";

// Test 6 of the M2 plan, against the artefact that actually ships. The unit
// test above `manifestExtras` covers what this repository declares; this one
// covers what WXT emits, which is a superset — the sidepanel entrypoint adds
// Chrome's `sidePanel` permission by itself. A permission can be widened from
// either side, so both are pinned.
type Manifest = {
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  browser_specific_settings?: { gecko?: { id?: string } };
  key?: string;
  sidebar_action?: unknown;
  side_panel?: unknown;
  commands?: Record<string, unknown>;
  icons?: Record<string, string>;
  name?: string;
  description?: string;
  content_scripts?: unknown;
  options_ui?: { page?: string; open_in_tab?: boolean };
};

const built: Record<string, Manifest> = {};

/** The one place the description is written. Read, never retyped. */
const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  description: string;
};

beforeAll(async () => {
  for (const browser of ["firefox", "chrome"]) {
    const output = await build({ browser, mode: "production" });
    built[browser] = output.manifest as Manifest;
  }
}, 120_000);

describe("generated manifest", () => {
  it("ships exactly the MVP permission set on Firefox", () => {
    expect(built.firefox?.permissions).toEqual([
      "activeTab",
      "contextMenus",
      "scripting",
      "storage",
    ]);
  });

  it("ships the MVP permission set plus Chrome's own sidebar permission", () => {
    expect(built.chrome?.permissions?.slice().sort()).toEqual([
      "activeTab",
      "contextMenus",
      "scripting",
      "sidePanel",
      "storage",
    ]);
  });

  it.each(["firefox", "chrome"])(
    "asks %s for loopback AnkiConnect and no other host",
    (browser) => {
      expect(built[browser]?.host_permissions).toEqual([
        "http://127.0.0.1:8765/*",
      ]);
    },
  );

  // M8. The endpoint is a setting because AnkiConnect's own bind address and
  // port are; a port the manifest does not name is one the browser will not
  // let the extension reach. Optional, so nothing is granted at install, and
  // loopback-only, so no setting can point this extension off the machine.
  it.each(["firefox", "chrome"])(
    "offers %s the other loopback ports, and nothing else, as optional",
    (browser) => {
      expect(built[browser]?.optional_host_permissions).toEqual([
        "http://127.0.0.1/*",
        "http://localhost/*",
      ]);
    },
  );

  it("pins the extension identity on both targets, so the origin survives a reload", () => {
    expect(built.firefox?.browser_specific_settings?.gecko?.id).toBe(
      "anklipper@gotofritz.net",
    );
    expect(built.chrome?.key).toEqual(expect.any(String));
  });

  // M5 injects on the gesture through `activeTab` + `scripting`, by file path.
  // A path that drifts fails at runtime on a page the tests never open, so it
  // is pinned against the built output rather than assumed.
  it.each(["firefox", "chrome"])(
    "emits the content script where %s injection asks for it",
    (browser) => {
      expect(
        // The constant is a runtime path and so starts with a slash; the
        // build writes it under the browser's output directory.
        existsSync(resolve(`.output/${browser}-mv3${CONTENT_SCRIPT_FILE}`)),
      ).toBe(true);
    },
  );

  // WXT falls back to `package.json`'s description when the manifest sets
  // none, so the sentence is written once. It was written twice — the same
  // string in `wxt.config.ts` and in `package.json`, with nothing holding
  // them together and the config silently winning. This is what stops that
  // coming back: re-add an override that drifts and this fails.
  it.each(["firefox", "chrome"])(
    "describes %s with package.json's description and no other",
    (browser) => {
      expect(built[browser]?.description).toBe(pkg.description);
    },
  );

  // The name is overridden on purpose: `package.json`'s is the npm one,
  // lower-case, and what a user reads in about:addons is not.
  it.each(["firefox", "chrome"])("names the extension in %s", (browser) => {
    expect(built[browser]?.name).toBe("Anklipper");
  });

  // WXT discovers these from `public/icon/`, so nothing declares them and
  // nothing could point them at a file that is not there. What that costs is
  // a stray PNG dropped in that directory silently becoming an icon — which
  // is what this pins. The set is five *drawings*, not one scaled five ways
  // (see `docs/icon/README.md`), so a missing size is a mark that stops
  // reading, not merely a blurry one.
  const SIZES = ["16", "24", "32", "48", "128"];

  it.each(["firefox", "chrome"])(
    "gives %s exactly the five icons",
    (browser) => {
      expect(built[browser]?.icons).toEqual(
        Object.fromEntries(SIZES.map((size) => [size, `icon/${size}.png`])),
      );
    },
  );

  it.each(["firefox", "chrome"])("emits every %s icon file", (browser) => {
    for (const size of SIZES) {
      expect(
        existsSync(resolve(`.output/${browser}-mv3/icon/${size}.png`)),
      ).toBe(true);
    }
  });

  // A declared content script needs match patterns, and those become
  // install-time host permissions the ceiling does not allow.
  it.each(["firefox", "chrome"])(
    "declares no content script in the %s manifest",
    (browser) => {
      expect(built[browser]?.content_scripts).toBeUndefined();
    },
  );

  it.each(["firefox", "chrome"])("declares the %s shortcut", (browser) => {
    expect(Object.keys(built[browser]?.commands ?? {})).toEqual([
      "create-anki-card",
    ]);
  });

  // M8's options page. It needs no permission of its own — which is the
  // point of asserting it beside the permission set rather than on its own.
  it.each(["firefox", "chrome"])("gives %s an options page", (browser) => {
    expect(built[browser]?.options_ui?.page).toBe("options.html");
  });

  it("opens the options page in a tab, not in a panel a form does not fit", () => {
    expect(built.firefox?.options_ui?.open_in_tab).toBe(true);
  });

  it("gives each browser its own sidebar surface", () => {
    expect(built.firefox?.sidebar_action).toBeDefined();
    expect(built.chrome?.side_panel).toBeDefined();
  });
});
