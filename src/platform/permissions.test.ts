import { browser, type Browser } from "wxt/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANKI_CONNECT_HOST_PERMISSION, createPermissions } from "./permissions";

// The fake browser leaves `permissions` unimplemented, so the two calls this
// wrapper makes are stubbed. They are declared with the promise-returning
// half of the browser's callback-or-promise overload, which is the half the
// wrapper uses.
type Check = (request: Browser.permissions.Permissions) => Promise<boolean>;

const contains = vi.fn<Check>();
const requestPermission = vi.fn<Check>();

beforeEach(() => {
  contains.mockReset();
  requestPermission.mockReset();
  browser.permissions.contains =
    contains as unknown as typeof browser.permissions.contains;
  browser.permissions.request =
    requestPermission as unknown as typeof browser.permissions.request;
});

describe("permissions", () => {
  // 2.7: Firefox MV3 does not grant a declared host permission at install, so
  // the extension has to find out at runtime rather than discovering it in a
  // failed AnkiConnect request later. Chrome grants it, and the same call
  // simply answers true there.
  it("reports the AnkiConnect host permission as missing when it is not granted", async () => {
    contains.mockResolvedValue(false);

    await expect(
      createPermissions().has(ANKI_CONNECT_HOST_PERMISSION),
    ).resolves.toBe(false);
    expect(contains).toHaveBeenCalledWith({
      origins: ["http://127.0.0.1:8765/*"],
    });
  });

  it("reports it as present once it is granted", async () => {
    contains.mockResolvedValue(true);

    await expect(
      createPermissions().has(ANKI_CONNECT_HOST_PERMISSION),
    ).resolves.toBe(true);
  });

  it("asks for exactly the permission it was given, and reports the answer", async () => {
    requestPermission.mockResolvedValue(true);

    await expect(
      createPermissions().request(ANKI_CONNECT_HOST_PERMISSION),
    ).resolves.toBe(true);
    expect(requestPermission).toHaveBeenCalledWith({
      origins: ["http://127.0.0.1:8765/*"],
    });
  });

  it("reports a refused request as false rather than throwing", async () => {
    requestPermission.mockResolvedValue(false);

    await expect(
      createPermissions().request(ANKI_CONNECT_HOST_PERMISSION),
    ).resolves.toBe(false);
  });

  // Firefox rejects `permissions.request` outside a user gesture. That is a
  // refusal, not a crash: the caller retries from a button.
  it("reports a request made outside a user gesture as false", async () => {
    requestPermission.mockRejectedValue(
      new Error(
        "permissions.request may only be called from a user input handler",
      ),
    );

    await expect(
      createPermissions().request(ANKI_CONNECT_HOST_PERMISSION),
    ).resolves.toBe(false);
  });
});
