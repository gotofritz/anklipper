/**
 * The manual `webCorsOriginList` fallback (9.2a).
 *
 * A pure string builder, and deliberately in the adapter layer: the key, its
 * default value, and the shape of the add-on's config file are AnkiConnect
 * protocol details, and nothing above `src/anki/` should have to know them.
 *
 * Why it exists at all, given that M4 found the add-on serving this extension
 * from a non-allowlisted origin: the browser is what enforces CORS, a granted
 * host permission is what exempts the extension from it, and neither of those
 * is true of every Anki, every AnkiConnect version, or every browser the user
 * may be running. When the connection cannot be had any other way, this is the
 * edit that has always worked — and on Firefox no value for it could have been
 * documented in advance, because the `moz-extension://` UUID is minted per
 * installation (P8). So the running extension fills it in itself.
 */

/** The key in AnkiConnect's own config. */
export const ALLOWLIST_KEY = "webCorsOriginList";

/**
 * What AnkiConnect ships with. Kept in the snippet so pasting it adds the
 * extension rather than quietly removing whatever else the user was reaching
 * Anki from.
 */
export const DEFAULT_ALLOWLIST: readonly string[] = ["http://localhost"];

/**
 * The list as it should read, with this installation's origin in it.
 *
 * Never `"*"` (9.8): it is honoured as a wildcard, and web pages are the one
 * class CORS does constrain — so it is exactly the value that would let any
 * site the user visits drive their collection.
 */
export function allowlistEntries(origin: string): readonly string[] {
  const entries = [...DEFAULT_ALLOWLIST];
  // An origin the extension could not report is no origin: an empty entry
  // would be pasted in and would then match nothing.
  if (origin !== "" && !entries.includes(origin)) entries.push(origin);

  return entries;
}

/**
 * The line to paste into the add-on's config, indented the way its own editor
 * shows it. A fragment rather than a whole config object on purpose: the user
 * has other keys in there — `apiKey` among them — and a paste that replaced
 * the object would take them with it.
 */
export function allowlistSnippet(origin: string): string {
  const entries = allowlistEntries(origin)
    .map((entry) => `    ${JSON.stringify(entry)}`)
    .join(",\n");

  return `${JSON.stringify(ALLOWLIST_KEY)}: [\n${entries}\n]`;
}
