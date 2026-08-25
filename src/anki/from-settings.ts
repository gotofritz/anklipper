import type { CardDraft } from "@/core/draft";
import type { NoteType } from "@/core/note-type";
import type {
  AnkiClient,
  AnkiConnection,
  AnkiError,
  NoteId,
} from "@/core/ports/types";
import type { Result } from "@/core/result";
import type { Settings } from "@/core/settings";

import type { AnkiClientConfig } from "./client";
import { createAnkiClient } from "./client";

/**
 * The AnkiConnect adapter, configured from the user's settings (M8).
 *
 * M4 left the endpoint, the timeout, and the API key as constructor arguments
 * with defaults, and M7's sidebar passed none of them. This is where they come
 * from now — and it stays in `src/anki/` because it is still the adapter
 * layer: it takes a plain `Settings` value and injects nothing browser-shaped.
 */
export interface AnkiFromSettingsDeps {
  /** Read at runtime, never hardcoded (P8). */
  readonly origin: string;
  readonly hasHostPermission?: () => Promise<boolean>;
  readonly fetch?: typeof globalThis.fetch;
}

export function ankiConfigFrom(
  settings: Settings,
  deps: AnkiFromSettingsDeps,
): AnkiClientConfig {
  return {
    endpoint: settings.endpoint,
    timeoutMs: settings.timeoutMs,
    origin: deps.origin,
    // Omitted rather than passed as "": `buildRequest` treats both the same,
    // and an absent field is what `describeAnkiConnection` reports on.
    ...(settings.apiKey === "" ? {} : { apiKey: settings.apiKey }),
    ...(deps.hasHostPermission === undefined
      ? {}
      : { hasHostPermission: deps.hasHostPermission }),
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
  };
}

export interface SettingsAnkiDeps extends AnkiFromSettingsDeps {
  /** Never fails: a settings read that cannot be validated degrades (8.2). */
  readonly loadSettings: () => Promise<Settings>;
}

/**
 * An `AnkiClient` that reads the settings on every call.
 *
 * Built per call rather than once, because the options page can change the
 * endpoint or the key while the sidebar is open, and a client captured at
 * mount would go on talking to the old address until the panel was reopened.
 * Building one is closures and no I/O; the settings read is one
 * `storage.local` get, which is what an AnkiConnect round trip is about to
 * cost anyway.
 */
export function createSettingsAnkiClient(deps: SettingsAnkiDeps): AnkiClient {
  async function configured(): Promise<AnkiClient> {
    return createAnkiClient(ankiConfigFrom(await deps.loadSettings(), deps));
  }

  return {
    async probe(): Promise<AnkiConnection> {
      return (await configured()).probe();
    },

    async deckNames(): Promise<Result<readonly string[], AnkiError>> {
      return (await configured()).deckNames();
    },

    async noteTypes(): Promise<Result<readonly NoteType[], AnkiError>> {
      return (await configured()).noteTypes();
    },

    async canAddNote(draft: CardDraft): Promise<Result<boolean, AnkiError>> {
      return (await configured()).canAddNote(draft);
    },

    async addNote(draft: CardDraft): Promise<Result<NoteId, AnkiError>> {
      return (await configured()).addNote(draft);
    },
  };
}
