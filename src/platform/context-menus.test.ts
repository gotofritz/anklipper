import { browser } from "wxt/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContextMenus } from "./context-menus";

type ClickListener = (
  info: { menuItemId: string },
  tab?: { id?: number },
) => void;

let listeners: ClickListener[];

beforeEach(() => {
  listeners = [];
  browser.contextMenus.create = vi.fn();
  browser.contextMenus.removeAll = vi.fn();
  browser.contextMenus.onClicked.addListener = vi.fn((listener) => {
    listeners.push(listener as ClickListener);
  });
  browser.contextMenus.onClicked.removeListener = vi.fn((listener) => {
    listeners = listeners.filter((it) => it !== listener);
  });
});

describe("context menus", () => {
  it("creates an item with the id, title, and contexts it was given", async () => {
    await createContextMenus().create({
      id: "create-anki-card",
      title: "Create Anki Card",
      contexts: ["selection"],
    });

    expect(browser.contextMenus.create).toHaveBeenCalledWith({
      id: "create-anki-card",
      title: "Create Anki Card",
      contexts: ["selection"],
    });
  });

  // The background is unloaded when idle and re-registers its menus on the
  // next start; without this the user collects duplicates.
  it("removes every item", async () => {
    await createContextMenus().removeAll();

    expect(browser.contextMenus.removeAll).toHaveBeenCalled();
  });

  it("delivers a click as the item id and the tab it happened in", () => {
    const onClick = vi.fn();
    createContextMenus().onClicked(onClick);

    listeners.forEach((listener) =>
      listener({ menuItemId: "create-anki-card" }, { id: 7 }),
    );

    expect(onClick).toHaveBeenCalledWith({
      menuItemId: "create-anki-card",
      tabId: 7,
    });
  });

  it("stops delivering clicks once the subscription is disposed", () => {
    const onClick = vi.fn();
    const dispose = createContextMenus().onClicked(onClick);

    dispose();
    listeners.forEach((listener) =>
      listener({ menuItemId: "create-anki-card" }, { id: 7 }),
    );

    expect(onClick).not.toHaveBeenCalled();
  });
});
