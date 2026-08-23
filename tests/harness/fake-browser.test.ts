import { describe, expect, it } from "vitest";

// The fake browser is shared process-wide, so a value written by one test is
// visible to the next unless the harness resets it. These two cases run in
// order: the first writes, the second proves the reset happened.
describe("fake browser", () => {
  it("stores and reads back a value through browser.storage.local", async () => {
    await browser.storage.local.set({ deck: "Default" });

    await expect(browser.storage.local.get("deck")).resolves.toEqual({
      deck: "Default",
    });
  });

  it("starts each test with an empty store", async () => {
    await expect(browser.storage.local.get(null)).resolves.toEqual({});
  });
});
