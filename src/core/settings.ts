import { ANKI_CONNECT_URL } from "@/manifest/manifest";

import { isWellFormedTag } from "./draft";
import type { NoteType } from "./note-type";
import { createNoteType, hasField } from "./note-type";
import type { FieldMapping, SourceUrlStyle } from "./source-fields";
import { DEFAULT_FIELD_MAPPING } from "./source-fields";

/**
 * What the user has chosen, and the rules for reading it back (M8).
 *
 * Storage is shared mutable state: another version of this extension may have
 * written it, and the user may have edited it by hand. So nothing here trusts
 * what it finds. Every value is **validated on read** (8.3) and a value that
 * does not validate **degrades to its own default** while the rest still
 * load (8.2) — a settings bug must not brick the extension.
 *
 * Pure: no `browser.*`, no storage. `src/platform/settings-store.ts` is the
 * adapter, and `settings-migrations.ts` is what runs before any of this.
 */

/**
 * The schema version, carried from the first release (8.1). Adding versioning
 * after users have stored data means guessing what they have.
 */
export const SETTINGS_VERSION = 1;

export interface Settings {
  readonly defaultDeck: string;
  /**
   * The descriptor, not just the name. Fields are the draft's keys (3.1), so
   * a name alone is not enough to generate a card — and the background cannot
   * ask Anki for the field list inside a capture gesture without putting a
   * network round trip and a new failure mode in front of every capture. The
   * sidebar reconciles it against Anki on open (M7), so drift self-heals.
   */
  readonly defaultNoteType: NoteType;
  readonly defaultTags: readonly string[];
  /** Where the source URL and title go, if anywhere (M8). */
  readonly fieldMapping: FieldMapping;
  readonly sourceUrlStyle: SourceUrlStyle;
  /** Configurable because the add-on's own `webBindAddress`/`webBindPort` are. */
  readonly endpoint: string;
  readonly timeoutMs: number;
  /**
   * AnkiConnect's optional `apiKey` (4.8, 8.5a). Stored like any other
   * setting; never logged, never shown in diagnostics, never in an error
   * payload — it is a credential for a service that can delete a collection.
   */
  readonly apiKey: string;
}

/**
 * Anki's own `Default` deck and its own `Basic`, so a capture is addable
 * without an edit — M7's reasoning, now a value the user can change. The note
 * type here is the name heuristic's guess (3.7); Anki's own descriptor
 * replaces it as soon as the sidebar can reach one (4.6).
 */
export const DEFAULT_SETTINGS: Settings = {
  defaultDeck: "Default",
  defaultNoteType: createNoteType({ name: "Basic", fields: ["Front", "Back"] }),
  defaultTags: [],
  fieldMapping: DEFAULT_FIELD_MAPPING,
  sourceUrlStyle: "plain",
  endpoint: ANKI_CONNECT_URL,
  timeoutMs: 5_000,
  apiKey: "",
};

const SOURCE_URL_STYLES: readonly SourceUrlStyle[] = ["plain", "link"];

/** The keys this version owns. Anything else in the payload belongs to someone. */
const OWN_KEYS: readonly string[] = [
  "version",
  ...(Object.keys(DEFAULT_SETTINGS) as readonly string[]),
];

export type SettingsPayload = Readonly<Record<string, unknown>>;

function asRecord(stored: unknown): SettingsPayload | undefined {
  if (typeof stored !== "object" || stored === null) return undefined;
  if (Array.isArray(stored)) return undefined;

  return stored as SettingsPayload;
}

function readText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function readNoteType(value: unknown): NoteType {
  const stored = asRecord(value);
  if (stored === undefined) return DEFAULT_SETTINGS.defaultNoteType;

  const name = stored.name;
  const fields = stored.fields;
  if (typeof name !== "string" || name.trim() === "") {
    return DEFAULT_SETTINGS.defaultNoteType;
  }
  if (
    !Array.isArray(fields) ||
    fields.length === 0 ||
    !fields.every((field) => typeof field === "string" && field.trim() !== "")
  ) {
    return DEFAULT_SETTINGS.defaultNoteType;
  }

  // Rebuilt through the card model rather than cast: `kind` and
  // `requiredFields` are derived, and a stored copy of either could disagree
  // with the fields it was stored beside.
  const kind = stored.kind;
  return createNoteType({
    name,
    fields: fields as readonly string[],
    ...(kind === "cloze" || kind === "standard" ? { kind } : {}),
  });
}

function readTags(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.defaultTags;

  // Filtered rather than rejected whole: one tag Anki could not store is no
  // reason to lose the others (8.2).
  return value.filter(
    (tag): tag is string => typeof tag === "string" && isWellFormedTag(tag),
  );
}

function readMapping(value: unknown): FieldMapping {
  const stored = asRecord(value);
  if (stored === undefined) return DEFAULT_FIELD_MAPPING;

  const field = (name: unknown) => (typeof name === "string" ? name : "");
  return {
    sourceUrl: field(stored.sourceUrl),
    sourceTitle: field(stored.sourceTitle),
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readEndpoint(value: unknown): string {
  return typeof value === "string" && isHttpUrl(value)
    ? value
    : DEFAULT_SETTINGS.endpoint;
}

function readTimeout(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SETTINGS.timeoutMs;
}

/**
 * The stored payload, as this version reads it. Never throws, and never
 * returns anything but a complete `Settings` — startup does not get to fail
 * on what someone else wrote (8.2).
 */
export function readSettings(stored: unknown): Settings {
  const payload = asRecord(stored);
  if (payload === undefined) return DEFAULT_SETTINGS;

  return {
    defaultDeck: readText(payload.defaultDeck, DEFAULT_SETTINGS.defaultDeck),
    defaultNoteType: readNoteType(payload.defaultNoteType),
    defaultTags: readTags(payload.defaultTags),
    fieldMapping: readMapping(payload.fieldMapping),
    sourceUrlStyle: SOURCE_URL_STYLES.includes(
      payload.sourceUrlStyle as SourceUrlStyle,
    )
      ? (payload.sourceUrlStyle as SourceUrlStyle)
      : DEFAULT_SETTINGS.sourceUrlStyle,
    endpoint: readEndpoint(payload.endpoint),
    timeoutMs: readTimeout(payload.timeoutMs),
    apiKey: typeof payload.apiKey === "string" ? payload.apiKey : "",
  };
}

/** What this version writes: its own keys, and the version it wrote them at. */
export function toSettingsPayload(settings: Settings): SettingsPayload {
  return { ...settings, version: SETTINGS_VERSION };
}

/**
 * The keys in a stored payload that this version does not own (8.2's other
 * half). A newer version of the extension may have written one, and this one
 * replacing the payload wholesale would silently throw away the user's
 * choice — so a write puts these back.
 */
export function unknownSettingKeys(stored: unknown): SettingsPayload {
  const payload = asRecord(stored);
  if (payload === undefined) return {};

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !OWN_KEYS.includes(key)),
  );
}

export type SettingsIssueCode =
  | "deck-missing"
  | "endpoint-invalid"
  | "timeout-invalid"
  | "tag-malformed"
  | "mapping-unknown-field";

/** Why a setting cannot be saved. A list, per 3.4's reasoning, not a boolean. */
export interface SettingsIssue {
  readonly code: SettingsIssueCode;
  readonly message: string;
  readonly field?: string;
  readonly tag?: string;
}

/**
 * What the options page refuses to save.
 *
 * Stricter than `readSettings`, and deliberately so: reading degrades quietly
 * because the alternative is an extension that will not start, while writing
 * is a user in front of a form who can be told what is wrong.
 */
export function validateSettings(settings: Settings): readonly SettingsIssue[] {
  const issues: SettingsIssue[] = [];

  if (settings.defaultDeck.trim() === "") {
    issues.push({ code: "deck-missing", message: "no default deck is set" });
  }

  if (!isHttpUrl(settings.endpoint)) {
    issues.push({
      code: "endpoint-invalid",
      message: `${settings.endpoint} is not an http address`,
    });
  }

  if (!Number.isFinite(settings.timeoutMs) || settings.timeoutMs <= 0) {
    issues.push({
      code: "timeout-invalid",
      message: `${settings.timeoutMs} is not a length of time to wait`,
    });
  }

  for (const tag of settings.defaultTags) {
    if (!isWellFormedTag(tag)) {
      issues.push({
        code: "tag-malformed",
        message: `"${tag}" is not a tag Anki can store`,
        tag,
      });
    }
  }

  // Checked against the default note type, which is the one a capture starts
  // on. A card the user switches to another note type simply goes unmapped —
  // `applySourceFields` skips a field the note type does not have.
  for (const field of [
    settings.fieldMapping.sourceUrl,
    settings.fieldMapping.sourceTitle,
  ]) {
    if (field !== "" && !hasField(settings.defaultNoteType, field)) {
      issues.push({
        code: "mapping-unknown-field",
        message: `${settings.defaultNoteType.name} has no field called ${field}`,
        field,
      });
    }
  }

  return issues;
}
