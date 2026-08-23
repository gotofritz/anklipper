import { browser } from "wxt/browser";
import { describe, expect, it } from "vitest";

import { createStorage } from "./storage";

describe("storage", () => {
  it("round-trips a value through the extension store", async () => {
    const storage = createStorage();

    await storage.set("deck", "Default");

    await expect(storage.get<string>("deck")).resolves.toBe("Default");
  });

  it("reports a missing key as undefined rather than throwing", async () => {
    await expect(createStorage().get("never-written")).resolves.toBeUndefined();
  });

  it("removes a key", async () => {
    const storage = createStorage();
    await storage.set("deck", "Default");

    await storage.remove("deck");

    await expect(storage.get("deck")).resolves.toBeUndefined();
  });

  it("writes where the browser can read it back after the background unloads", async () => {
    await createStorage().set("deck", "Default");

    await expect(browser.storage.local.get("deck")).resolves.toEqual({
      deck: "Default",
    });
  });
});
