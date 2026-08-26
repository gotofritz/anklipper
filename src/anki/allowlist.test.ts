import { describe, expect, it } from "vitest";

import {
  ALLOWLIST_KEY,
  DEFAULT_ALLOWLIST,
  allowlistEntries,
  allowlistSnippet,
} from "./allowlist";

const ORIGIN = "moz-extension://8b7c1f2e-0a3d-4c5b-9e6f-1a2b3c4d5e6f";

/** What AnkiConnect's config would hold after the snippet was pasted in. */
function parsed(snippet: string): Record<string, unknown> {
  return JSON.parse(`{${snippet}}`) as Record<string, unknown>;
}

describe("the manual allowlist fallback", () => {
  it("names AnkiConnect's own key", () => {
    expect(ALLOWLIST_KEY).toBe("webCorsOriginList");
    expect(allowlistSnippet(ORIGIN)).toContain(`"${ALLOWLIST_KEY}"`);
  });

  it("carries the running extension's own origin, not a placeholder", () => {
    expect(allowlistEntries(ORIGIN)).toContain(ORIGIN);
    expect(allowlistSnippet(ORIGIN)).toContain(ORIGIN);
  });

  it("keeps the entry AnkiConnect ships with, so a paste adds rather than removes", () => {
    for (const entry of DEFAULT_ALLOWLIST) {
      expect(allowlistEntries(ORIGIN)).toContain(entry);
    }
  });

  it("pastes into the add-on's config as valid JSON", () => {
    expect(parsed(allowlistSnippet(ORIGIN))).toEqual({
      [ALLOWLIST_KEY]: [...DEFAULT_ALLOWLIST, ORIGIN],
    });
  });

  /**
   * 9.8. `"*"` is honoured, and web pages are the one class CORS does
   * constrain — so it is the value that would let any site the user visits
   * drive their collection. Never offered, not even as a shortcut.
   */
  it("never offers a wildcard", () => {
    expect(allowlistSnippet(ORIGIN)).not.toContain("*");
    expect(allowlistEntries(ORIGIN)).not.toContain("*");
    expect(DEFAULT_ALLOWLIST).not.toContain("*");
  });

  it("lists an origin once, however many times it is already there", () => {
    const [first] = DEFAULT_ALLOWLIST;
    expect(first).toBeDefined();
    expect(allowlistEntries(first as string)).toEqual([...DEFAULT_ALLOWLIST]);
  });

  /**
   * There is no origin to name before the extension has one. A snippet with an
   * empty string in it would be pasted, and would then be an entry that
   * matches nothing.
   */
  it("drops an origin it was not given", () => {
    expect(allowlistEntries("")).toEqual([...DEFAULT_ALLOWLIST]);
    expect(allowlistSnippet("")).not.toContain('""');
  });

  it("indents the way the add-on's own config editor does", () => {
    expect(allowlistSnippet(ORIGIN)).toBe(
      `"webCorsOriginList": [\n    "http://localhost",\n    "${ORIGIN}"\n]`,
    );
  });
});
