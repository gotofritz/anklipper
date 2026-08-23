import { build } from "wxt";
import { beforeAll, describe, expect, it } from "vitest";

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

  it("gives each browser its own sidebar surface", () => {
    expect(built.firefox?.sidebar_action).toBeDefined();
    expect(built.chrome?.side_panel).toBeDefined();
  });
});
