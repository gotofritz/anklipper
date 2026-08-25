import { browser, type Browser } from "wxt/browser";

import { ANKI_CONNECT_HOST_PERMISSION as HOST_PERMISSION } from "@/manifest/manifest";

export interface PermissionRequest {
  readonly permissions?: readonly Browser.runtime.ManifestPermission[];
  readonly origins?: readonly string[];
}

/**
 * Optional-permission checks (2.7).
 *
 * Firefox MV3 does not grant a declared host permission at install, so the
 * extension has to ask at runtime; Chrome grants it, and the same call simply
 * answers `true` there. One code path, correct on both.
 */
export interface PermissionsPort {
  has(request: PermissionRequest): Promise<boolean>;
  /** Must be called synchronously from a user gesture, or Firefox refuses. */
  request(request: PermissionRequest): Promise<boolean>;
}

/** The one host this extension ever talks to. */
export const ANKI_CONNECT_HOST_PERMISSION: PermissionRequest = {
  origins: [HOST_PERMISSION],
};

function toBrowserRequest(
  request: PermissionRequest,
): Browser.permissions.Permissions {
  return {
    ...(request.permissions ? { permissions: [...request.permissions] } : {}),
    ...(request.origins ? { origins: [...request.origins] } : {}),
  };
}

export function createPermissions(): PermissionsPort {
  return {
    async has(request: PermissionRequest): Promise<boolean> {
      return browser.permissions.contains(toBrowserRequest(request));
    },

    async request(request: PermissionRequest): Promise<boolean> {
      try {
        return await browser.permissions.request(toBrowserRequest(request));
      } catch {
        // Firefox rejects a request made outside a user input handler. That
        // is a refusal the caller retries from a button, not a crash.
        return false;
      }
    },
  };
}

/**
 * The permission a given endpoint needs (M8).
 *
 * The endpoint is a setting, so the permission is no longer a constant: a
 * request to a loopback port the extension holds no permission for fails in a
 * way indistinguishable from Anki being closed, and the user would be sent to
 * start something that is already running. The declared permission covers the
 * add-on's default; the rest are optional and asked for when configured.
 */
export function hostPermissionFor(endpoint: string): PermissionRequest {
  try {
    return { origins: [`${new URL(endpoint).origin}/*`] };
  } catch {
    return ANKI_CONNECT_HOST_PERMISSION;
  }
}
