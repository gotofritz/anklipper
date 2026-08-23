import { browser } from "wxt/browser";

/**
 * The extension's own origin, read from the running extension (2.6, P8).
 *
 * AnkiConnect rejects any request whose `Origin` is absent from its
 * `webCorsOriginList`, so this string is what the user ends up adding there.
 * Firefox mints a fresh `moz-extension://<uuid>` per installation, so no
 * constant is correct for two users — it is always read at runtime.
 */
export interface OriginPort {
  /** e.g. `moz-extension://<uuid>` — a bare origin, with no trailing slash. */
  extensionOrigin(): string;
}

export function createOrigin(): OriginPort {
  return {
    extensionOrigin() {
      // `getURL("")` returns the root URL, which carries a trailing slash an
      // `Origin` header never has.
      return browser.runtime.getURL("").replace(/\/$/, "");
    },
  };
}
