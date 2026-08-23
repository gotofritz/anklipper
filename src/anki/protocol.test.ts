import { describe, expect, it } from "vitest";

import { isErr, isOk } from "@/core/result";

import {
  ANKI_CONNECT_API_VERSION,
  buildRequest,
  readBooleanArray,
  readEnvelope,
  readNoteId,
  readNumber,
  readPermission,
  readStringArray,
  readTemplates,
} from "./protocol";

describe("buildRequest", () => {
  it("carries the action and the API version the envelope needs", () => {
    expect(buildRequest("deckNames")).toEqual({
      action: "deckNames",
      version: ANKI_CONNECT_API_VERSION,
    });
  });

  it("includes params when there are any, and omits the key when unset", () => {
    const request = buildRequest("modelFieldNames", { modelName: "Basic" });

    expect(request.params).toEqual({ modelName: "Basic" });
    expect("key" in request).toBe(false);
  });

  it("carries the API key on every action that has one configured (4.8)", () => {
    const request = buildRequest("deckNames", undefined, "s3cret");

    expect(request.key).toBe("s3cret");
  });

  it("never carries the API key on requestPermission (4.8)", () => {
    const request = buildRequest("requestPermission", undefined, "s3cret");

    expect("key" in request).toBe(false);
  });
});

describe("readEnvelope", () => {
  it("unwraps the result of a successful reply", () => {
    const read = readEnvelope({ result: ["Default"], error: null });

    expect(read).toEqual({ ok: true, value: ["Default"] });
  });

  it("surfaces an AnkiConnect error string as api-error carrying it", () => {
    const read = readEnvelope({ result: null, error: "something went wrong" });

    expect(isErr(read) && read.error).toEqual({
      kind: "api-error",
      message: "something went wrong",
    });
  });

  it.each([
    ["a string body", "not json"],
    ["null", null],
    ["an array", []],
    ["an object with neither key", { hello: "world" }],
    ["an object missing result", { error: null }],
    ["an error that is not a string", { result: null, error: 42 }],
  ])("rejects %s as malformed-response rather than casting it", (_, body) => {
    const read = readEnvelope(body);

    expect(isErr(read) && read.error.kind).toBe("malformed-response");
  });

  it("accepts a null result, which is what addNote returns on refusal", () => {
    expect(readEnvelope({ result: null, error: null })).toEqual({
      ok: true,
      value: null,
    });
  });
});

describe("per-operation validators", () => {
  it("reads an array of strings, and refuses one with a hole in it", () => {
    expect(readStringArray(["Default", "Spanish"])).toEqual({
      ok: true,
      value: ["Default", "Spanish"],
    });

    const bad = readStringArray(["Default", 7]);
    expect(isErr(bad) && bad.error.kind).toBe("malformed-response");
    expect(isErr(readStringArray("Default")) ? "err" : "ok").toBe("err");
  });

  it("reads an array of booleans", () => {
    expect(readBooleanArray([true, false])).toEqual({
      ok: true,
      value: [true, false],
    });
    expect(isOk(readBooleanArray([true, "false"]))).toBe(false);
  });

  it("reads a number", () => {
    expect(readNumber(6)).toEqual({ ok: true, value: 6 });
    expect(isOk(readNumber("6"))).toBe(false);
    expect(isOk(readNumber(Number.NaN))).toBe(false);
  });

  it("reads a note id, refusing a non-integer or a null", () => {
    expect(readNoteId(1496198395707)).toEqual({
      ok: true,
      value: 1496198395707,
    });
    expect(isOk(readNoteId(null))).toBe(false);
    expect(isOk(readNoteId(1.5))).toBe(false);
  });

  it("reads the template map of a note type", () => {
    const templates = {
      "Card 1": { Front: "{{Text}}", Back: "{{FrontSide}}" },
    };

    expect(readTemplates(templates)).toEqual({ ok: true, value: templates });
    expect(isOk(readTemplates({ "Card 1": { Front: 3 } }))).toBe(false);
    expect(isOk(readTemplates(["Card 1"]))).toBe(false);
  });

  it("reads the handshake reply, with the version the add-on reports (4.9)", () => {
    expect(readPermission({ permission: "granted", version: 6 })).toEqual({
      ok: true,
      value: { permission: "granted", version: 6 },
    });
    expect(readPermission({ permission: "denied" })).toEqual({
      ok: true,
      value: { permission: "denied" },
    });
    expect(isOk(readPermission({ permission: "maybe" }))).toBe(false);
    expect(isOk(readPermission(null))).toBe(false);
  });
});
