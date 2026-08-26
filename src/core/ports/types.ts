import type { CardDraft } from "../draft";
import type { NoteType } from "../note-type";
import type { Result } from "../result";
import type { Settings } from "../settings";
import type { StickyFields } from "../sticky";

export type { Settings } from "../settings";
export { DEFAULT_SETTINGS } from "../settings";
export type { StickyFields } from "../sticky";

/**
 * The ports the domain layer talks to (3.5, P3). Interfaces only: the real
 * implementations are adapters and live elsewhere — AnkiConnect in `src/anki/`
 * from M4, storage-backed stores from M8 — and every one of them ships an
 * in-memory fake under `fakes/`, which is what tests run against.
 *
 * Nothing here mentions HTTP, `browser.*`, or Svelte. That is the point.
 */

/**
 * Why AnkiConnect did not answer, or answered with a refusal.
 *
 * "Unavailable" is three separate causes, and each has a different fix, so the
 * adapter must tell them apart rather than collapsing them into one boolean.
 * M4 owns the detection; this is the shape it reports in.
 */
export type AnkiErrorKind =
  /** Nothing is listening on the AnkiConnect port — Anki is not running. */
  | "anki-not-running"
  /** Something answered, but not AnkiConnect — the add-on is not installed. */
  | "addon-missing"
  /** The loopback host permission has not been granted (2.7, Firefox MV3). */
  | "permission-missing"
  /** The add-on has an `apiKey` set and the request carried none, or a wrong one. */
  | "api-key-required"
  /** A reply that was not the shape AnkiConnect promises. */
  | "malformed-response"
  /** Anki already holds a note with this first field. */
  | "duplicate-note"
  | "unknown-deck"
  | "unknown-note-type"
  | "unknown-field"
  /** Anki accepted the connection and never answered. */
  | "timeout"
  /** An API-level error with no more specific kind. */
  | "api-error";

export interface AnkiError {
  readonly kind: AnkiErrorKind;
  readonly message: string;
}

/**
 * What the probe answers with (4.3): a cause, never a boolean. "Not available"
 * is several different problems with several different fixes.
 *
 * The plan also asked for a confidence flag, because a rejected origin and a
 * dead port would both surface as a failed `fetch` and the adapter would have
 * to guess between them. M4's manual pass removed the ambiguity rather than
 * resolving it — see the archived plan — so every cause the probe can report
 * is now determinate, and a flag that is always `true` says nothing.
 */
export type AnkiConnection =
  | { readonly kind: "connected"; readonly apiVersion: number }
  | { readonly kind: "unavailable"; readonly cause: AnkiError };

/**
 * How the adapter is configured, as the user may be shown it or paste it into
 * a bug report (4.8, 9.3).
 *
 * The API key is reported as a yes-or-no and never as a value: it is a
 * credential for a service that can delete a collection, and a diagnostics
 * report is the one thing users paste in public.
 */
export interface AnkiDiagnostics {
  readonly endpoint: string;
  readonly origin: string;
  readonly apiKeyConfigured: boolean;
  readonly timeoutMs: number;
}

export type NoteId = number;

export interface AnkiClient {
  /** Why AnkiConnect is or is not usable (4.3). Never throws. */
  probe(): Promise<AnkiConnection>;
  deckNames(): Promise<Result<readonly string[], AnkiError>>;
  noteTypes(): Promise<Result<readonly NoteType[], AnkiError>>;
  /**
   * Every tag the collection already holds, for the tag editor's completion
   * (10.9). A convenience, so a failure here is reported and never fatal: a
   * card can be made with a tag Anki has not seen before.
   */
  tags(): Promise<Result<readonly string[], AnkiError>>;
  /** Whether the note could be added — duplicate detection, non-blocking (4.4). */
  canAddNote(draft: CardDraft): Promise<Result<boolean, AnkiError>>;
  addNote(draft: CardDraft): Promise<Result<NoteId, AnkiError>>;
}

export type StoreErrorKind =
  | "read-failed"
  | "write-failed"
  /** Something is stored under the key, but not in a shape this version reads. */
  | "malformed-stored-value";

/**
 * Why a store could not answer. One shape for all three stores: they fail for
 * the same three reasons, and a separate interface per store would be three
 * copies of it to keep in step.
 */
export interface StoreError {
  readonly kind: StoreErrorKind;
  readonly message: string;
}

export type DraftStoreError = StoreError;

/**
 * The draft in progress. Both browsers unload the background when idle, so the
 * draft is durable from the moment it exists rather than held in memory.
 */
export interface DraftStore {
  load(): Promise<Result<CardDraft | undefined, DraftStoreError>>;
  save(draft: CardDraft): Promise<Result<void, DraftStoreError>>;
  clear(): Promise<Result<void, DraftStoreError>>;
}

export type SettingsStoreError = StoreError;

/**
 * What the user has chosen. The schema, its defaults, and the rules for
 * reading it back are `src/core/settings.ts`; the migrations that run first
 * are `src/core/settings-migrations.ts` (M8).
 *
 * `load` answers with `Settings` and not with a partial one: a value that
 * does not validate degrades to its own default rather than failing the read
 * (8.2), so the only thing left to report is storage itself refusing.
 */
export interface SettingsStore {
  load(): Promise<Result<Settings, SettingsStoreError>>;
  save(settings: Settings): Promise<Result<void, SettingsStoreError>>;
  /** Back to the defaults, without touching what is merely remembered (8.5). */
  reset(): Promise<Result<void, SettingsStoreError>>;
}

/**
 * What the extension remembers, as opposed to what the user configured (8.5).
 *
 * Kept apart from `Settings` on purpose: "reset settings" must not erase it,
 * and a deck changing under the user because they last used a different one
 * should not feel like their configuration was edited.
 */
export interface Remembered {
  /** The deck the last card actually went into. */
  readonly lastDeck?: string;
  /** Which fields are pinned, and what they last held (10.6). */
  readonly sticky?: StickyFields;
}

export type RememberedStoreError = StoreError;

export interface RememberedStore {
  load(): Promise<Result<Remembered, RememberedStoreError>>;
  save(remembered: Remembered): Promise<Result<void, RememberedStoreError>>;
}
