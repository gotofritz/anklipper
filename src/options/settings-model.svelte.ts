import type { NoteType } from "@/core/note-type";
import { hasField, sameNoteType } from "@/core/note-type";
import type {
  AnkiClient,
  SettingsStore,
  SettingsStoreError,
} from "@/core/ports/types";
import type { Settings, SettingsIssue } from "@/core/settings";
import { DEFAULT_SETTINGS, validateSettings } from "@/core/settings";
import type { FieldMapping, SourceUrlStyle } from "@/core/source-fields";
import { isWellFormedTag } from "@/core/draft";
import type { Resource } from "@/sidebar/editor-model.svelte";
import { draftIssueCopy } from "@/sidebar/error-copy";

/**
 * The one layer between the options page's components and the ports (M8,
 * following 6.2).
 *
 * The same shape as the editor's view-model, and for the same reasons: the
 * components render this and hand back intents, the asynchronous state is
 * `Resource` so an empty deck list is distinguishable from a closed Anki
 * (6.3), and nothing here reaches `browser.*` or knows AnkiConnect's wire
 * format. Tests drive it against the in-memory fakes.
 */
export type SaveState = "idle" | "saving" | "saved" | "failed" | "refused";

/**
 * Whether the browser will let the extension reach the configured endpoint
 * (2.7, M8). `unknown` until a save has asked.
 */
export type HostPermissionState = "unknown" | "granted" | "refused";

export interface SettingsModelDeps {
  readonly settings: SettingsStore;
  /** For the deck and note-type lists. The form is a choice, not a text box. */
  readonly anki: AnkiClient;
  /**
   * Ask the browser for access to this endpoint.
   *
   * The manifest declares the add-on's default port and offers the other
   * loopback ports as optional, so a configured one has to be asked for. It is
   * called **from the Save press, before anything is awaited**, because
   * Firefox refuses a permission request made outside a user input handler —
   * which is also why it is unconditional: checking first, then asking, would
   * put an await in front of the ask.
   */
  readonly requestHostPermission?: (endpoint: string) => Promise<boolean>;
}

export interface SettingsModel {
  readonly settings: Settings;
  readonly decks: Resource<readonly string[]>;
  readonly noteTypes: Resource<readonly NoteType[]>;
  /** Deck names Anki reported, plus the stored one if Anki did not report it. */
  readonly deckOptions: readonly string[];
  readonly noteTypeOptions: readonly string[];
  /** The fields the source can be mapped into — `""` first, meaning none. */
  readonly fieldOptions: readonly string[];
  readonly issues: readonly SettingsIssue[];
  readonly saveState: SaveState;
  readonly saveError: SettingsStoreError | undefined;
  /** What the browser said about reaching the configured endpoint (2.7). */
  readonly hostPermission: HostPermissionState;
  /** Storage refusing the *read*: the form still opens, on the defaults (8.2). */
  readonly loadError: SettingsStoreError | undefined;
  /** An intent the model refused, already in the user's words. */
  readonly notice: string | undefined;
  load(): Promise<void>;
  setDeck(deck: string): void;
  setNoteType(name: string): void;
  addTag(tag: string): void;
  removeTag(tag: string): void;
  setSourceUrlField(field: string): void;
  setSourceTitleField(field: string): void;
  setSourceUrlStyle(style: SourceUrlStyle): void;
  setEndpoint(endpoint: string): void;
  setTimeoutMs(timeoutMs: number): void;
  setApiKey(apiKey: string): void;
  save(): Promise<void>;
  reset(): Promise<void>;
}

function withCurrent(
  names: readonly string[],
  current: string,
): readonly string[] {
  return names.includes(current) ? names : [current, ...names];
}

/** Only the fields the note type has; `""` — meaning nowhere — always keeps. */
function mappedInto(mapping: FieldMapping, noteType: NoteType): FieldMapping {
  const keep = (field: string) =>
    field !== "" && hasField(noteType, field) ? field : "";

  return {
    sourceUrl: keep(mapping.sourceUrl),
    sourceTitle: keep(mapping.sourceTitle),
  };
}

/** The stored note type, as Anki describes it now. */
function reconciled(
  settings: Settings,
  fromAnki: readonly NoteType[],
): Settings {
  const fresh = fromAnki.find(
    (one) => one.name === settings.defaultNoteType.name,
  );
  if (fresh === undefined) return settings;
  if (sameNoteType(fresh, settings.defaultNoteType)) return settings;

  return {
    ...settings,
    defaultNoteType: fresh,
    fieldMapping: mappedInto(settings.fieldMapping, fresh),
  };
}

export function createSettingsModel(deps: SettingsModelDeps): SettingsModel {
  // `$state.raw`: `Settings` is an immutable value replaced whole on every
  // edit, exactly like the draft in the editor's model.
  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let decks = $state.raw<Resource<readonly string[]>>({ kind: "idle" });
  let noteTypes = $state.raw<Resource<readonly NoteType[]>>({ kind: "idle" });
  let saveState = $state.raw<SaveState>("idle");
  let saveError = $state.raw<SettingsStoreError | undefined>(undefined);
  let hostPermission = $state.raw<HostPermissionState>("unknown");
  let loadError = $state.raw<SettingsStoreError | undefined>(undefined);
  let notice = $state.raw<string | undefined>(undefined);
  let issues = $state.raw<readonly SettingsIssue[]>([]);

  /**
   * The single place the settings value is replaced. An edit makes the last
   * verdict stale, so the confirmation and the refusal both go with it —
   * otherwise the form goes on saying "Saved." about something else.
   */
  function apply(next: Settings): void {
    settings = next;
    saveState = "idle";
    saveError = undefined;
    notice = undefined;
    issues = [];
    // The last answer was about the endpoint as it was; an edit makes it
    // stale, and an edit to anything else is about to re-ask anyway.
    hostPermission = "unknown";
  }

  return {
    get settings() {
      return settings;
    },
    get decks() {
      return decks;
    },
    get noteTypes() {
      return noteTypes;
    },
    get deckOptions() {
      return withCurrent(
        decks.kind === "ready" ? decks.value : [],
        settings.defaultDeck,
      );
    },
    get noteTypeOptions() {
      return withCurrent(
        noteTypes.kind === "ready"
          ? noteTypes.value.map((one) => one.name)
          : [],
        settings.defaultNoteType.name,
      );
    },
    get fieldOptions() {
      return ["", ...settings.defaultNoteType.fields];
    },
    get issues() {
      return issues;
    },
    get saveState() {
      return saveState;
    },
    get saveError() {
      return saveError;
    },
    get hostPermission() {
      return hostPermission;
    },
    get loadError() {
      return loadError;
    },
    get notice() {
      return notice;
    },

    async load(): Promise<void> {
      decks = { kind: "loading" };
      noteTypes = { kind: "loading" };

      const [stored, deckNames, models] = await Promise.all([
        deps.settings.load(),
        deps.anki.deckNames(),
        deps.anki.noteTypes(),
      ]);

      // 8.2: a settings read that failed opens the form on the defaults
      // rather than on nothing. The failure is still reported — saving over
      // settings that could not be read is worth a warning.
      settings = stored.ok ? stored.value : DEFAULT_SETTINGS;
      loadError = stored.ok ? undefined : stored.error;

      decks = deckNames.ok
        ? { kind: "ready", value: deckNames.value }
        : { kind: "failed", error: deckNames.error };
      noteTypes = models.ok
        ? { kind: "ready", value: models.value }
        : { kind: "failed", error: models.error };

      // The stored descriptor is a snapshot of what Anki said when the user
      // chose it, and a field renamed in Anki since would leave this form
      // offering a field that no longer exists — and save the stale copy back.
      // The sidebar reconciles the draft the same way on open (M7's risk);
      // this is the same rule for the setting the draft starts from. A note
      // type Anki no longer reports is left alone: it may be a collection that
      // is not open rather than a note type that is gone.
      if (models.ok) settings = reconciled(settings, models.value);
    },

    setDeck(deck: string): void {
      apply({ ...settings, defaultDeck: deck });
    },

    setNoteType(name: string): void {
      if (name === settings.defaultNoteType.name) return;
      // Anki's own descriptor, never a name typed here: the field list is what
      // a capture needs, and the flavour comes off the templates (4.6).
      const chosen =
        noteTypes.kind === "ready"
          ? noteTypes.value.find((one) => one.name === name)
          : undefined;
      if (chosen === undefined) return;

      // A mapping into a field the new note type does not have would be saved
      // as an issue the user cannot see the cause of, so it is cleared here.
      apply({
        ...settings,
        defaultNoteType: chosen,
        fieldMapping: mappedInto(settings.fieldMapping, chosen),
      });
    },

    addTag(tag: string): void {
      const trimmed = tag.trim();
      if (!isWellFormedTag(trimmed)) {
        notice = draftIssueCopy({
          code: "tag-malformed",
          message: `"${tag}" is not a tag Anki can store`,
          tag,
        });
        return;
      }
      if (settings.defaultTags.includes(trimmed)) return;

      apply({
        ...settings,
        defaultTags: [...settings.defaultTags, trimmed],
      });
    },

    removeTag(tag: string): void {
      apply({
        ...settings,
        defaultTags: settings.defaultTags.filter((one) => one !== tag),
      });
    },

    setSourceUrlField(field: string): void {
      apply({
        ...settings,
        fieldMapping: { ...settings.fieldMapping, sourceUrl: field },
      });
    },

    setSourceTitleField(field: string): void {
      apply({
        ...settings,
        fieldMapping: { ...settings.fieldMapping, sourceTitle: field },
      });
    },

    setSourceUrlStyle(style: SourceUrlStyle): void {
      apply({ ...settings, sourceUrlStyle: style });
    },

    setEndpoint(endpoint: string): void {
      apply({ ...settings, endpoint });
    },

    setTimeoutMs(timeoutMs: number): void {
      apply({ ...settings, timeoutMs });
    },

    setApiKey(apiKey: string): void {
      apply({ ...settings, apiKey });
    },

    async save(): Promise<void> {
      // Stricter than the read path on purpose: reading degrades quietly
      // because the alternative is an extension that will not start, while
      // this is a user in front of a form who can be told what is wrong.
      const found = validateSettings(settings);
      issues = found;
      if (found.length > 0) {
        saveState = "refused";
        return;
      }

      // First, and synchronously: Firefox refuses a permission request made
      // after an await, and this whole call runs inside the Save press.
      // Unconditional for the same reason — checking first would be the await.
      // Already-granted resolves true with no prompt.
      // `.catch` rather than a bare call: it is awaited several statements
      // later, and a rejection in between would be an unhandled one.
      const granted = deps
        .requestHostPermission?.(settings.endpoint)
        .catch(() => false);

      saveState = "saving";
      const saved = await deps.settings.save(settings);
      saveError = saved.ok ? undefined : saved.error;
      saveState = saved.ok ? "saved" : "failed";

      // Saved either way: the endpoint is the user's choice, and a browser
      // that would not grant access to it is a thing to say rather than a
      // reason to throw the setting away.
      if (granted !== undefined) {
        hostPermission = (await granted) ? "granted" : "refused";
      }
    },

    async reset(): Promise<void> {
      // The settings key only. The deck last used is remembered elsewhere and
      // is not the user's configuration to reset (8.5).
      saveState = "saving";
      const done = await deps.settings.reset();
      if (done.ok) settings = DEFAULT_SETTINGS;

      issues = [];
      notice = undefined;
      hostPermission = "unknown";
      saveError = done.ok ? undefined : done.error;
      saveState = done.ok ? "saved" : "failed";
    },
  };
}
