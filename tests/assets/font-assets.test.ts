import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// The skin's `@font-face` blocks point at absolute paths — wxt copies
// `public/` to the bundle root, so `/fonts/x.woff2` resolves there. MV3's CSP
// blocks `fonts.googleapis.com`, so a missing file is not a 404 a developer
// notices: the text silently falls back to Helvetica and the extended masthead
// quietly stops being extended. Pin the references to real files instead.

const ROOT = resolve(import.meta.dirname, "../..");
const SKIN = resolve(ROOT, "src/entrypoints/sidepanel/tdr.css");
const PUBLIC_DIR = resolve(ROOT, "public");

// `wOF2` — the WOFF2 magic number. Catches a truncated download, an HTML
// error page saved under a font's name, or a git-lfs pointer file.
const WOFF2_MAGIC = "wOF2";

function fontUrlsInSkin(): string[] {
  const css = readFileSync(SKIN, "utf8");
  const urls: string[] = [];
  for (const [, url] of css.matchAll(/url\(\s*"([^"]+)"\s*\)/g)) {
    if (url) urls.push(url);
  }
  return urls;
}

describe("skin font assets", () => {
  it("references the three vendored font files", () => {
    expect(fontUrlsInSkin()).toEqual([
      "/fonts/Archivo-Variable.woff2",
      "/fonts/IBMPlexMono-Regular.woff2",
      "/fonts/IBMPlexMono-SemiBold.woff2",
    ]);
  });

  it.each(fontUrlsInSkin())("ships %s as a real WOFF2 in public/", (url) => {
    const file = resolve(PUBLIC_DIR, url.replace(/^\//, ""));
    const bytes = readFileSync(file);

    expect(bytes.subarray(0, 4).toString("latin1")).toBe(WOFF2_MAGIC);
    expect(bytes.byteLength).toBeGreaterThan(1024);
  });
});
