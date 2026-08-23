import { browser } from "wxt/browser";

export type ContextMenuContext = "selection" | "page";

export interface ContextMenuItem {
  readonly id: string;
  readonly title: string;
  /** Non-empty: the browsers reject an item that matches no context. */
  readonly contexts: readonly [ContextMenuContext, ...ContextMenuContext[]];
}

export interface ContextMenuClick {
  readonly menuItemId: string;
  readonly tabId?: number;
}

/**
 * Context menu entries (2.3). The menu itself arrives in M5, with the code
 * that handles a click; this is the wrapper it will be built on.
 */
export interface ContextMenusPort {
  create(item: ContextMenuItem): Promise<void>;
  /** The background re-registers its menus on every start; this avoids duplicates. */
  removeAll(): Promise<void>;
  onClicked(listener: (click: ContextMenuClick) => void): () => void;
}

export function createContextMenus(): ContextMenusPort {
  return {
    async create(item: ContextMenuItem): Promise<void> {
      browser.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: [...item.contexts] as [
          ContextMenuContext,
          ...ContextMenuContext[],
        ],
      });
    },

    async removeAll(): Promise<void> {
      await browser.contextMenus.removeAll();
    },

    onClicked(listener: (click: ContextMenuClick) => void): () => void {
      const wrapped = (
        info: { menuItemId: string | number },
        tab?: { id?: number },
      ) => {
        listener({ menuItemId: String(info.menuItemId), tabId: tab?.id });
      };
      browser.contextMenus.onClicked.addListener(wrapped);
      return () => browser.contextMenus.onClicked.removeListener(wrapped);
    },
  };
}
