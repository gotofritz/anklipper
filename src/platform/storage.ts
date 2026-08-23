import { browser } from "wxt/browser";

/**
 * Extension storage (2.3).
 *
 * Firefox's event page and Chrome's service worker are both unloaded when
 * idle, so nothing durable may live in module scope. Anything that has to
 * survive goes through here from the start.
 */
export interface StoragePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createStorage(): StoragePort {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const stored = await browser.storage.local.get(key);
      return stored[key] as T | undefined;
    },

    async set<T>(key: string, value: T): Promise<void> {
      await browser.storage.local.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
      await browser.storage.local.remove(key);
    },
  };
}
