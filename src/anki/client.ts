import type { CardDraft } from "@/core/draft";
import type { NoteType } from "@/core/note-type";
import type {
  AnkiClient,
  AnkiConnection,
  AnkiError,
  NoteId,
} from "@/core/ports/types";
import type { Result } from "@/core/result";
import { err, ok } from "@/core/result";
import { ANKI_CONNECT_URL } from "@/manifest/manifest";

import { classifyApiError } from "./errors";
import { toAnkiNote, toNoteType } from "./mapping";
import {
  buildRequest,
  readBooleanArray,
  readEnvelope,
  readNoteId,
  readNumber,
  readStringArray,
  readTemplates,
} from "./protocol";
import type { Transport } from "./transport";
import { createTransport } from "./transport";
import type { AnkiAction, TemplateMap } from "./types";

/**
 * The `AnkiClient` port (P3), implemented against AnkiConnect.
 *
 * The only module in the codebase that knows the wire format, and the layer
 * where "unavailable" stops being one word: every failure leaves here as a
 * typed cause the UI can act on (4.2, 4.3). Nothing here imports `browser.*`
 * or Svelte — the two things it needs from the browser, the extension's own
 * origin and whether the host permission has been granted, are injected.
 */
export interface AnkiClientConfig {
  /**
   * Defaults to the add-on's own default (4.1). It is a setting from M8, and
   * `from-settings.ts` is what turns one into this config.
   */
  readonly endpoint?: string;
  /** From `OriginPort.extensionOrigin()`. Read at runtime, never hardcoded (P8). */
  readonly origin: string;
  /** The add-on's optional `apiKey`. Unset for almost everyone (4.8). */
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  /**
   * From `PermissionsPort.has(ANKI_CONNECT_HOST_PERMISSION)`. Firefox MV3 does
   * not grant a declared host permission at install (2.7), and a request made
   * without it fails in a way that looks exactly like the add-on being absent.
   */
  readonly hasHostPermission?: () => Promise<boolean>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * What may be shown to the user, or written into a bug report.
 *
 * The API key is reported as a yes-or-no and never as a value: it is a
 * credential, and diagnostics are the one thing users paste into public
 * issues (4.8).
 */
export interface AnkiDiagnostics {
  readonly endpoint: string;
  readonly origin: string;
  readonly apiKeyConfigured: boolean;
  readonly timeoutMs: number;
}

export function describeAnkiConnection(
  config: AnkiClientConfig,
): AnkiDiagnostics {
  return {
    endpoint: config.endpoint ?? ANKI_CONNECT_URL,
    origin: config.origin,
    apiKeyConfigured: config.apiKey !== undefined && config.apiKey !== "",
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

const PERMISSION_MISSING: AnkiError = {
  kind: "permission-missing",
  message:
    "the extension has not been granted access to the local Anki. Grant it from the extension, then try again.",
};

export function createAnkiClient(config: AnkiClientConfig): AnkiClient {
  const transport: Transport = createTransport({
    endpoint: config.endpoint ?? ANKI_CONNECT_URL,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
  });

  const hasHostPermission = config.hasHostPermission ?? (async () => true);

  /**
   * One call, from the permission check to a validated result.
   *
   * The permission is checked before anything is sent (3a): without it the
   * request fails in a way indistinguishable from the add-on being missing,
   * and the user would be sent to reinstall something that is already there.
   */
  async function call<T>(
    action: AnkiAction,
    params: Readonly<Record<string, unknown>> | undefined,
    read: (result: unknown) => Result<T, AnkiError>,
  ): Promise<Result<T, AnkiError>> {
    if (!(await hasHostPermission())) return err(PERMISSION_MISSING);

    const posted = await transport.post(
      buildRequest(action, params, config.apiKey),
    );
    if (!posted.ok) return posted;

    const envelope = readEnvelope(posted.value);
    // `readEnvelope` reports every add-on error string as `api-error`; this
    // is where it is narrowed to the kind the string actually names.
    if (!envelope.ok) {
      return err(
        envelope.error.kind === "api-error"
          ? classifyApiError(envelope.error.message)
          : envelope.error,
      );
    }

    return read(envelope.value);
  }

  /** Fields and templates for one note type, so the flavour is read, not guessed (4.6). */
  async function describeNoteType(
    name: string,
  ): Promise<Result<NoteType, AnkiError>> {
    const fields = await call(
      "modelFieldNames",
      { modelName: name },
      readStringArray,
    );
    if (!fields.ok) return fields;

    const templates = await call<TemplateMap>(
      "modelTemplates",
      { modelName: name },
      readTemplates,
    );

    // An unreadable template list costs the flavour of one note type, not the
    // whole list: fall back to M3's name heuristic rather than failing.
    return ok(
      templates.ok
        ? toNoteType(name, fields.value, templates.value)
        : toNoteType(name, fields.value),
    );
  }

  return {
    async probe(): Promise<AnkiConnection> {
      const version = await call("version", undefined, readNumber);

      return version.ok
        ? { kind: "connected", apiVersion: version.value }
        : { kind: "unavailable", cause: version.error };
    },

    async deckNames(): Promise<Result<readonly string[], AnkiError>> {
      return call("deckNames", undefined, readStringArray);
    },

    async noteTypes(): Promise<Result<readonly NoteType[], AnkiError>> {
      const names = await call("modelNames", undefined, readStringArray);
      if (!names.ok) return names;

      const noteTypes: NoteType[] = [];
      for (const name of names.value) {
        const described = await describeNoteType(name);
        if (!described.ok) return described;
        noteTypes.push(described.value);
      }

      return ok(noteTypes);
    },

    async canAddNote(draft: CardDraft): Promise<Result<boolean, AnkiError>> {
      return call(
        "canAddNotes",
        { notes: [toAnkiNote(draft)] },
        (result): Result<boolean, AnkiError> => {
          const read = readBooleanArray(result);
          if (!read.ok) return read;

          const [answer] = read.value;
          if (answer === undefined) {
            return err({
              kind: "malformed-response",
              message: "AnkiConnect answered about no note at all",
            });
          }

          return ok(answer);
        },
      );
    },

    async addNote(draft: CardDraft): Promise<Result<NoteId, AnkiError>> {
      return call("addNote", { note: toAnkiNote(draft) }, readNoteId);
    },
  };
}
