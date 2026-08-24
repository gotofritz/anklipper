/**
 * Types local to the AnkiConnect adapter (M4). The port's own vocabulary —
 * `AnkiError`, `AnkiConnection`, `AnkiHandshake` — lives in
 * `src/core/ports/types.ts`; what is here is the wire format and the extra the
 * probe needs, neither of which anything above this layer should see.
 */

/** The actions this adapter uses. Nothing else in the codebase names one. */
export type AnkiAction =
  | "version"
  | "requestPermission"
  | "deckNames"
  | "modelNames"
  | "modelFieldNames"
  | "modelTemplates"
  | "canAddNotes"
  | "addNote";

/** The request envelope, built in exactly one place (`buildRequest`). */
export interface AnkiRequest {
  readonly action: AnkiAction;
  readonly version: number;
  readonly params?: Readonly<Record<string, unknown>>;
  /** Present only when an API key is configured, and never on the handshake (4.8). */
  readonly key?: string;
}

/** The note as `addNote` and `canAddNotes` want it. */
export interface AnkiNote {
  readonly deckName: string;
  readonly modelName: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly tags: readonly string[];
  readonly options: {
    readonly allowDuplicate: boolean;
    readonly duplicateScope: "deck";
  };
}

/** `modelTemplates` answers with card name → template side → template text. */
export type TemplateMap = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

/** The add-on's answer to `requestPermission`. */
export interface PermissionReply {
  readonly permission: "granted" | "denied";
  /** Reported on approval, which is where the API version is read from (4.9). */
  readonly version?: number;
}
