import { browser } from "wxt/browser";
import { describe, expect, it, vi } from "vitest";

import { createOrigin } from "./origin";

// P8: Firefox mints a new `moz-extension://<uuid>` per installation, so no
// constant is correct for two users. Every expectation here is derived from
// the running extension's own API — never from a literal origin.
describe("origin", () => {
  it("reports the running extension's own origin", () => {
    expect(createOrigin().extensionOrigin()).toBe(
      browser.runtime.getURL("").replace(/\/$/, ""),
    );
  });

  it("drops the trailing slash AnkiConnect's allowlist does not want", () => {
    const origin = createOrigin().extensionOrigin();

    expect(browser.runtime.getURL("")).toMatch(/\/$/);
    expect(origin).not.toMatch(/\/$/);
  });

  it("returns an extension-scheme origin and nothing more", () => {
    expect(createOrigin().extensionOrigin()).toMatch(
      /^(moz|chrome)-extension:\/\/[^/]+$/,
    );
  });

  // Firefox mints the uuid at install time, so the helper has to read it
  // every time rather than capture it once.
  it("follows the installation it is running in, rather than a baked-in value", () => {
    const before = createOrigin().extensionOrigin();
    vi.spyOn(browser.runtime, "getURL").mockReturnValue(
      "moz-extension://a-different-installation/",
    );

    expect(createOrigin().extensionOrigin()).not.toBe(before);
    expect(createOrigin().extensionOrigin()).toBe(
      "moz-extension://a-different-installation",
    );
  });
});
