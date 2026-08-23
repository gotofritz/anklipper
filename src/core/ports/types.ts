import type { CardDraft } from "../draft";
import type { NoteType } from "../note-type";
import type { Result } from "../result";

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
  /** The extension's origin is absent from `webCorsOriginList`. */
  | "origin-rejected"
  /** A reply that was not the shape AnkiConnect promises. */
  | "malformed-response"
  /** Anki already holds a note with this first field. */
  | "duplicate-note"
  | "unknown-deck"
  | "unknown-note-type"
  | "unknown-field"
  /** An API-level error with no more specific kind. */
  | "api-error";

export interface AnkiError {
  readonly kind: AnkiErrorKind;
  readonly message: string;
}

export type NoteId = number;

export interface AnkiClient {
  deckNames(): Promise<Result<readonly string[], AnkiError>>;
  noteTypes(): Promise<Result<readonly NoteType[], AnkiError>>;
  /** Whether the note could be added — duplicate detection, non-blocking (4.4). */
  canAddNote(draft: CardDraft): Promise<Result<boolean, AnkiError>>;
  addNote(draft: CardDraft): Promise<Result<NoteId, AnkiError>>;
}

export type StoreErrorKind =
  | "read-failed"
  | "write-failed"
  /** Something is stored under the key, but not in a shape this version reads. */
  | "malformed-stored-value";

export interface DraftStoreError {
  readonly kind: StoreErrorKind;
  readonly message: string;
}

/**
 * The draft in progress. Both browsers unload the background when idle, so the
 * draft is durable from the moment it exists rather than held in memory.
 */
export interface DraftStore {
  load(): Promise<Result<CardDraft | undefined, DraftStoreError>>;
  save(draft: CardDraft): Promise<Result<void, DraftStoreError>>;
  clear(): Promise<Result<void, DraftStoreError>>;
}

export interface SettingsStoreError {
  readonly kind: StoreErrorKind;
  readonly message: string;
}

/** What the user has chosen. M8 owns the schema and its migrations. */
export interface Settings {
  readonly defaultDeck: string;
  readonly defaultNoteType: string;
  readonly defaultTags: readonly string[];
}

export const DEFAULT_SETTINGS: Settings = {
  defaultDeck: "",
  defaultNoteType: "",
  defaultTags: [],
};

export interface SettingsStore {
  load(): Promise<Result<Settings, SettingsStoreError>>;
  save(settings: Settings): Promise<Result<void, SettingsStoreError>>;
}
