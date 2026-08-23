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
  /** The loopback host permission has not been granted (2.7, Firefox MV3). */
  | "permission-missing"
  /**
   * The handshake ran and the answer was no — the user declined, or the origin
   * sits in `ignoreOriginList` and no dialog will ever appear again. A dead end
   * a retry cannot clear, which is what `needsManualFix` says.
   */
  | "permission-denied"
  /** The add-on has an `apiKey` set and the request carried none, or a wrong one. */
  | "api-key-required"
  /** A reply that was not the shape AnkiConnect promises. */
  | "malformed-response"
  /** Anki already holds a note with this first field. */
  | "duplicate-note"
  | "unknown-deck"
  | "unknown-note-type"
  | "unknown-field"
  /** A cloze note reached Anki with no deletions — M3's validation disagrees. */
  | "empty-cloze"
  /** Anki accepted the connection and never answered. */
  | "timeout"
  /** An API-level error with no more specific kind. */
  | "api-error";

export interface AnkiError {
  readonly kind: AnkiErrorKind;
  readonly message: string;
  /**
   * On `origin-rejected`, the origin the request carried, read at runtime
   * (P8) — so M9 can show the user the value they have to paste into
   * `webCorsOriginList` rather than a guess at it.
   */
  readonly origin?: string;
  /**
   * True when only the user changing something in Anki clears this. A caller
   * that retries such a cause loops forever.
   */
  readonly needsManualFix?: boolean;
}

/**
 * What the probe answers with (4.3): a cause, never a boolean. "Not available"
 * is several different problems with several different fixes, and the browser
 * cannot always tell them apart — a rejected origin and a dead port both
 * surface as a failed `fetch` — so the probe reports its best guess and says
 * how sure it is, leaving M9 free to offer two fixes instead of one confident
 * wrong one.
 */
export type AnkiConnection =
  | { readonly kind: "connected"; readonly apiVersion: number }
  | {
      readonly kind: "unavailable";
      readonly cause: AnkiError;
      /** False when the evidence fits `alternatives` just as well. */
      readonly confident: boolean;
      /** The other causes the same evidence allows, likeliest first. */
      readonly alternatives: readonly AnkiErrorKind[];
    };

/**
 * The result of the `requestPermission` handshake (4.7, P9).
 *
 * Fire-and-then-re-probe: from a rejected origin the add-on's reply is
 * unreadable, so the honest answer is `asked` — the dialog is up, and only a
 * following probe establishes what the user did with it.
 */
export type AnkiHandshake =
  /** The reply was readable and said yes; the add-on reported this version. */
  | { readonly kind: "granted"; readonly apiVersion: number }
  /** The reply was readable and said no. `cause.needsManualFix` is set. */
  | { readonly kind: "denied"; readonly cause: AnkiError }
  /** Sent, answer unreadable. Probe again to find out. */
  | { readonly kind: "asked" }
  /** The handshake could not even be sent — the host permission is missing. */
  | { readonly kind: "blocked"; readonly cause: AnkiError };

export type NoteId = number;

export interface AnkiClient {
  /** Why AnkiConnect is or is not usable (4.3). Never throws. */
  probe(): Promise<AnkiConnection>;
  /** Ask the add-on to allowlist this extension's origin (4.7, P9). */
  requestPermission(): Promise<AnkiHandshake>;
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
