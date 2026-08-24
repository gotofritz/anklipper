import { describe, expect, it } from "vitest";

import { classifyApiError } from "./errors";

describe("classifyApiError", () => {
  it.each([
    ["cannot create note because it is a duplicate", "duplicate-note"],
    ["deck was not found: Spanish", "unknown-deck"],
    ["model was not found: Basic", "unknown-note-type"],
    ["valid api key must be provided", "api-key-required"],
    ["Field name is invalid", "unknown-field"],
    ["collection is not available", "api-error"],
  ])("reads %j as %s", (message, kind) => {
    expect(classifyApiError(message)).toMatchObject({ kind, message });
  });

  it("keeps the add-on's own words, whatever kind it lands on", () => {
    expect(classifyApiError("deck was not found: Spanish").message).toBe(
      "deck was not found: Spanish",
    );
  });
});
