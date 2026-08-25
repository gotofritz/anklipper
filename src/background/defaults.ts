import type { GenerationDefaults } from "@/core/generate";
import type { RememberedStore, SettingsStore } from "@/core/ports/types";
import { DEFAULT_SETTINGS } from "@/core/settings";

/**
 * What a new draft starts from (M8), in place of M7's constants.
 *
 * Two sources, deliberately kept apart. **Settings** are what the user chose;
 * **remembered** is what the extension noticed — and the deck they last added
 * to wins, because it is the more recent evidence of what they are doing
 * (8.5). Resetting settings does not touch it, and it changing does not feel
 * like their configuration was edited.
 *
 * Neither read can fail this: it runs inside a capture gesture, and a settings
 * bug that stopped a capture would be exactly the brick 8.2 forbids. A failed
 * read degrades to the shipped defaults and the card still gets made.
 */
export interface DefaultsDeps {
  readonly settings: SettingsStore;
  readonly remembered: RememberedStore;
}

export async function resolveDefaults(
  deps: DefaultsDeps,
): Promise<GenerationDefaults> {
  const [stored, remembered] = await Promise.all([
    deps.settings.load(),
    deps.remembered.load(),
  ]);

  const settings = stored.ok ? stored.value : DEFAULT_SETTINGS;
  const lastDeck = remembered.ok ? remembered.value.lastDeck : undefined;

  return {
    deck:
      lastDeck !== undefined && lastDeck.trim() !== ""
        ? lastDeck
        : settings.defaultDeck,
    noteType: settings.defaultNoteType,
    tags: settings.defaultTags,
    fieldMapping: settings.fieldMapping,
    sourceUrlStyle: settings.sourceUrlStyle,
  };
}
