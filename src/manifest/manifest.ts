/**
 * The parts of the generated manifest that are ours (2.4, 2.5).
 *
 * `wxt.config.ts` imports this, and `manifest.test.ts` pins it, so widening
 * the extension's permissions breaks a test rather than slipping through a
 * diff. Pure constants — nothing here may import `wxt/browser`, because WXT
 * loads this module at build time, outside any browser.
 */

/** The local AnkiConnect service. The only host this extension ever contacts. */
export const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
export const ANKI_CONNECT_HOST_PERMISSION = `${ANKI_CONNECT_URL}/*`;

/**
 * The hosts an endpoint setting may name (M8).
 *
 * AnkiConnect's own `webBindAddress` and `webBindPort` are configurable, so
 * the endpoint has to be too — and a port the manifest does not name is a port
 * the browser will not let the extension reach. These are **optional** host
 * permissions: nothing is granted at install on either browser, and the
 * options page asks for exactly the one the user typed, from the Save gesture.
 *
 * Loopback only, and no wider than that. P6 says nothing leaves this machine,
 * and this is where that stops being a promise and starts being a manifest.
 * `readSettings` refuses any other host for the same reason, so the setting
 * and the permission cannot disagree.
 *
 * IPv6 is absent because match patterns have no syntax for a literal address;
 * a setting the permission could not be expressed for would be worse than one
 * that is refused.
 */
export const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"] as const;

export const OPTIONAL_HOST_PERMISSIONS = LOOPBACK_HOSTS.map(
  (host) => `http://${host}/*`,
);

/**
 * The MVP permission ceiling, from the plan index. Never `<all_urls>`:
 * `activeTab` plus `scripting` on a user gesture covers the extraction this
 * extension needs. Anything added here needs a justification in the subplan
 * that adds it.
 *
 * Chrome's `sidePanel` permission is absent on purpose — WXT derives it from
 * the sidepanel entrypoint, and `tests/manifest/generated-manifest.test.ts`
 * holds the emitted manifest to the ceiling.
 */
export const MVP_PERMISSIONS = [
  "activeTab",
  "contextMenus",
  "scripting",
  "storage",
] as const;

/**
 * Pinned so the `moz-extension://` origin survives a reload: AnkiConnect
 * allowlists this extension by origin, and a new id would break the user's
 * own allowlist entry (P8).
 */
export const GECKO_ID = "anklipper@gotofritz.net";
export const GECKO_MIN_VERSION = "128.0";

/**
 * The same pinning for Chrome, where the id is derived from this key. It
 * fixes the id an unpacked build loads under — which is what a developer's
 * AnkiConnect allowlist entry is written against. The Chrome Web Store issues
 * its own key at publish, so a store build drops this field.
 */
export const CHROME_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuwxNZw0j3Ymq0KvmVkVmkKRwZltwFtrDhCvaTlVS5TRxTcSRY4cnIc5XhcVT88Sc7Ro7rvK8LXymu3l7z0y7bVocgiHUCKKr7GIw6sCRZmZOUBSRvREscfWIbjQOTTFVUHwNWhsxuy1reuDGPRqZi/CfnvpbbcbHTbVi9oRzFl34/p9g98hcrZjneIhhyDh9/OlGfkJddiPQLk8JMtezTsRotNs8sFmdJm/2LKv+hbO/rcRqeWaH0J9SLW55Q79aAfaQ0N6ykxzLfddpsxBleLbESU9vk5rAt6nDaL9TP5NrTWtMouhfeWcOPxVJeesZHb2XJL/ycwksckzcRRMWYwIDAQAB";

/**
 * The shortcut's name. The background listens for exactly this, so the two
 * live in one place; `Alt+Shift+A` is free on both browsers, where the
 * `Ctrl+Shift+` range is largely taken by their own developer tools.
 */
export const CAPTURE_COMMAND = "create-anki-card";

export interface ManifestCommand {
  readonly suggested_key?: { readonly default: string };
  readonly description: string;
}

export interface GeckoSettings {
  readonly gecko: {
    readonly id: string;
    readonly strict_min_version: string;
    readonly data_collection_permissions: { readonly required: string[] };
  };
}

export interface ManifestExtras {
  readonly permissions: string[];
  readonly host_permissions: string[];
  /** Loopback ports other than the default, asked for when one is configured. */
  readonly optional_host_permissions: string[];
  /** A manifest key rather than a permission, so it widens nothing. */
  readonly commands: Readonly<Record<string, ManifestCommand>>;
  readonly browser_specific_settings?: GeckoSettings;
  readonly key?: string;
}

export function manifestExtras(target: string): ManifestExtras {
  return {
    permissions: [...MVP_PERMISSIONS],
    host_permissions: [ANKI_CONNECT_HOST_PERMISSION],
    optional_host_permissions: [...OPTIONAL_HOST_PERMISSIONS],
    commands: {
      [CAPTURE_COMMAND]: {
        suggested_key: { default: "Alt+Shift+A" },
        description: "Create an Anki card from the selected text",
      },
    },
    ...(target === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              strict_min_version: GECKO_MIN_VERSION,
              // Required by AMO for new extensions. Nothing leaves the
              // browser except to AnkiConnect on loopback.
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : { key: CHROME_EXTENSION_KEY }),
  };
}
