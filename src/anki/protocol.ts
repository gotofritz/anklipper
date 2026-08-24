import type { AnkiError } from "@/core/ports/types";
import type { Result } from "@/core/result";
import { err, ok } from "@/core/result";

import type { AnkiAction, AnkiRequest, TemplateMap } from "./types";

/**
 * The wire format, and the only place it is built or read (4.5).
 *
 * Everything here validates rather than casts: AnkiConnect is an external
 * service on a port anything could be listening on, and `as` on its output is
 * how a malformed reply becomes a crash three layers away.
 */

/**
 * The version the request envelope carries. AnkiConnect has answered `6` since
 * 2018 and rejects an envelope that names a newer one, so it is pinned here
 * rather than negotiated. What the *add-on* reports, from the `version`
 * action, is read at runtime and surfaced instead (4.9).
 */
export const ANKI_CONNECT_API_VERSION = 6;

export function buildRequest(
  action: AnkiAction,
  params?: Readonly<Record<string, unknown>>,
  apiKey?: string,
): AnkiRequest {
  const keyed = apiKey !== undefined && apiKey !== "";

  return {
    action,
    version: ANKI_CONNECT_API_VERSION,
    ...(params === undefined ? {} : { params }),
    ...(keyed ? { key: apiKey } : {}),
  };
}

function malformed(what: string): AnkiError {
  return {
    kind: "malformed-response",
    message: `AnkiConnect answered with ${what}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Unwrap `{"result": …, "error": null}`.
 *
 * A `null` result is legitimate — it is what the add-on returns alongside an
 * error — so the envelope is read for shape here and the result validated by
 * the caller, which is the only one that knows what shape to expect.
 */
export function readEnvelope(body: unknown): Result<unknown, AnkiError> {
  if (!isRecord(body)) return err(malformed("something that is not an object"));
  if (!("result" in body) || !("error" in body)) {
    return err(malformed("an object that is not its reply envelope"));
  }

  const { error, result } = body;
  if (error === null || error === undefined) return ok(result);
  if (typeof error !== "string") {
    return err(malformed("an error that is not a string"));
  }

  // Classified by the caller, which may know more than the string does.
  return err({ kind: "api-error", message: error });
}

export function readStringArray(
  result: unknown,
): Result<readonly string[], AnkiError> {
  if (
    !Array.isArray(result) ||
    !result.every((one) => typeof one === "string")
  ) {
    return err(malformed("something that is not a list of strings"));
  }

  return ok(result);
}

export function readBooleanArray(
  result: unknown,
): Result<readonly boolean[], AnkiError> {
  if (
    !Array.isArray(result) ||
    !result.every((one) => typeof one === "boolean")
  ) {
    return err(malformed("something that is not a list of booleans"));
  }

  return ok(result);
}

export function readNumber(result: unknown): Result<number, AnkiError> {
  if (typeof result !== "number" || !Number.isFinite(result)) {
    return err(malformed("something that is not a number"));
  }

  return ok(result);
}

export function readNoteId(result: unknown): Result<number, AnkiError> {
  const read = readNumber(result);
  if (!read.ok) return read;
  if (!Number.isInteger(read.value)) {
    return err(malformed("a note id that is not a whole number"));
  }

  return read;
}

export function readTemplates(result: unknown): Result<TemplateMap, AnkiError> {
  if (!isRecord(result)) {
    return err(malformed("templates that are not an object"));
  }

  for (const card of Object.values(result)) {
    if (!isRecord(card))
      return err(malformed("a card template that is not an object"));
    if (!Object.values(card).every((side) => typeof side === "string")) {
      return err(malformed("a template side that is not a string"));
    }
  }

  return ok(result as TemplateMap);
}
