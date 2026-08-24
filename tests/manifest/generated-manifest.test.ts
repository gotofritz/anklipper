import { existsSync } from "node:fs";
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
  browser_specific_settings?: { gecko?: { id?: string } };
  key?: string;
  sidebar_action?: unknown;
  side_panel?: unknown;
  commands?: Record<string, unknown>;
  content_scripts?: unknown;
};

const built: Record<string, Manifest> = {};

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

  it("gives each browser its own sidebar surface", () => {
    expect(built.firefox?.sidebar_action).toBeDefined();
    expect(built.chrome?.side_panel).toBeDefined();
  });
});
