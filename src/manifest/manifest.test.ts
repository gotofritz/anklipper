import { describe, expect, it } from "vitest";

import {
  ANKI_CONNECT_HOST_PERMISSION,
  CAPTURE_COMMAND,
  CHROME_EXTENSION_KEY,
  GECKO_ID,
  manifestExtras,
} from "./manifest";

// The permission ceiling is a constraint, not a default: `AGENTS.md` and the
// plan index both name this exact set, and anything beyond it needs a written
// justification. These assertions are whole-object equality on purpose —
// widening the manifest has to break a test, not slip through a diff.
describe("manifest permissions", () => {
  it("declares exactly the MVP permission set on Firefox", () => {
    expect(manifestExtras("firefox").permissions).toEqual([
      "activeTab",
      "contextMenus",
      "scripting",
      "storage",
    ]);
  });

  it("declares exactly the MVP permission set on Chrome", () => {
    // `sidePanel` is not here: WXT adds it from the sidepanel entrypoint, and
    // the generated-manifest test is what holds it to the ceiling.
    expect(manifestExtras("chrome").permissions).toEqual([
      "activeTab",
      "contextMenus",
      "scripting",
      "storage",
    ]);
  });

  it.each(["firefox", "chrome"])(
    "asks %s for loopback AnkiConnect and nothing else",
    (target) => {
      expect(manifestExtras(target).host_permissions).toEqual([
        "http://127.0.0.1:8765/*",
      ]);
    },
  );

  it("never asks for every site", () => {
    for (const target of ["firefox", "chrome"]) {
      const extras = manifestExtras(target);
      expect([...extras.permissions, ...extras.host_permissions]).not.toContain(
        "<all_urls>",
      );
    }
  });

  it("keeps the host permission and the AnkiConnect URL in step", () => {
    expect(ANKI_CONNECT_HOST_PERMISSION).toBe("http://127.0.0.1:8765/*");
  });
});

// 2.4 / P8: AnkiConnect allowlists this extension by origin, so the origin has
// to survive a reload. On Firefox that means a pinned gecko id; on Chrome, a
// pinned `key`, which fixes the id an unpacked build loads under.
describe("manifest identity", () => {
  it("pins the Firefox extension id", () => {
    expect(manifestExtras("firefox").browser_specific_settings?.gecko.id).toBe(
      GECKO_ID,
    );
  });

  it("does not emit Firefox settings on Chrome", () => {
    expect(manifestExtras("chrome").browser_specific_settings).toBeUndefined();
  });

  it("pins the Chrome extension key", () => {
    expect(manifestExtras("chrome").key).toBe(CHROME_EXTENSION_KEY);
  });

  it("does not emit a Chrome key on Firefox", () => {
    expect(manifestExtras("firefox").key).toBeUndefined();
  });

  it("declares no data collection, as AMO requires of a new extension", () => {
    expect(
      manifestExtras("firefox").browser_specific_settings?.gecko
        .data_collection_permissions,
    ).toEqual({ required: ["none"] });
  });
});

// M5's keyboard shortcut. `commands` is a manifest key, not a permission, so
// it adds nothing to the ceiling — but the name has to match the one the
// background listens for, and only a test keeps the two in step.
describe("manifest commands", () => {
  it.each(["firefox", "chrome"])("declares one shortcut on %s", (target) => {
    expect(Object.keys(manifestExtras(target).commands ?? {})).toEqual([
      CAPTURE_COMMAND,
    ]);
  });

  it("suggests a shortcut neither browser has already taken", () => {
    const command = manifestExtras("firefox").commands?.[CAPTURE_COMMAND];

    expect(command?.suggested_key?.default).toBe("Alt+Shift+A");
    expect(command?.description).toContain("Anki card");
  });
});
