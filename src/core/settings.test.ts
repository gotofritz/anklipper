import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  readSettings,
  toSettingsPayload,
  unknownSettingKeys,
  validateSettings,
} from "./settings";

describe("reading settings", () => {
  // Test 1 of the M8 plan.
  it("returns the defaults when nothing is stored", () => {
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("starts on Anki's own deck and note type, so a capture is addable", () => {
    expect(DEFAULT_SETTINGS.defaultDeck).toBe("Default");
    expect(DEFAULT_SETTINGS.defaultNoteType.name).toBe("Basic");
    expect(DEFAULT_SETTINGS.defaultNoteType.fields).toEqual(["Front", "Back"]);
  });

  it("ships no API key", () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe("");
  });

  // Test 2, over the pure half: the store's round trip is its own test.
  it("round-trips a saved setting", () => {
    const settings = { ...DEFAULT_SETTINGS, defaultDeck: "Spanish::Verbs" };

    expect(readSettings(toSettingsPayload(settings))).toEqual(settings);
  });

  it("stamps the schema version onto what it writes (8.1)", () => {
    expect(toSettingsPayload(DEFAULT_SETTINGS).version).toBe(SETTINGS_VERSION);
  });

  // Test 3: 8.2 and 8.3 together — validated on read, degraded per key.
  it("falls back to the default for a malformed value and loads the rest", () => {
    const settings = readSettings({
      version: SETTINGS_VERSION,
      defaultDeck: 42,
      defaultTags: ["kept"],
    });

    expect(settings.defaultDeck).toBe(DEFAULT_SETTINGS.defaultDeck);
    expect(settings.defaultTags).toEqual(["kept"]);
  });

  it("degrades a stored value that is not an object at all", () => {
    expect(readSettings("wiped")).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps the tags it can read and drops only the ones Anki could not store", () => {
    const settings = readSettings({
      defaultTags: ["good", "two words", 7, "also-good"],
    });

    expect(settings.defaultTags).toEqual(["good", "also-good"]);
  });

  it("rebuilds a stored note type through the card model", () => {
    const settings = readSettings({
      defaultNoteType: { name: "My Cloze", fields: ["Text", "Extra"] },
    });

    expect(settings.defaultNoteType.fields).toEqual(["Text", "Extra"]);
    // Read off the name here; Anki's own reading replaces it (4.6).
    expect(settings.defaultNoteType.kind).toBe("cloze");
    expect(settings.defaultNoteType.requiredFields).toEqual(["Text"]);
  });

  it("degrades a note type with no fields", () => {
    const settings = readSettings({
      defaultNoteType: { name: "Broken", fields: [] },
    });

    expect(settings.defaultNoteType).toEqual(DEFAULT_SETTINGS.defaultNoteType);
  });

  it("degrades an endpoint that is not a URL, and keeps one that is", () => {
    expect(readSettings({ endpoint: "not a url" }).endpoint).toBe(
      DEFAULT_SETTINGS.endpoint,
    );
    expect(readSettings({ endpoint: "http://127.0.0.1:9999" }).endpoint).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("degrades a timeout that is not a positive number", () => {
    for (const timeoutMs of [
      0,
      -1,
      "5000",
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(readSettings({ timeoutMs }).timeoutMs).toBe(
        DEFAULT_SETTINGS.timeoutMs,
      );
    }
    expect(readSettings({ timeoutMs: 250 }).timeoutMs).toBe(250);
  });

  it("degrades a source-URL style it does not recognise", () => {
    expect(readSettings({ sourceUrlStyle: "footnote" }).sourceUrlStyle).toBe(
      DEFAULT_SETTINGS.sourceUrlStyle,
    );
    expect(readSettings({ sourceUrlStyle: "link" }).sourceUrlStyle).toBe(
      "link",
    );
    expect(readSettings({ sourceUrlStyle: "plain" }).sourceUrlStyle).toBe(
      "plain",
    );
  });

  it("reads a field mapping, and degrades half of one", () => {
    expect(
      readSettings({ fieldMapping: { sourceUrl: "Back", sourceTitle: 9 } })
        .fieldMapping,
    ).toEqual({ sourceUrl: "Back", sourceTitle: "" });
  });

  it("keeps a stored API key so the adapter can carry it", () => {
    expect(readSettings({ apiKey: "s3cret" }).apiKey).toBe("s3cret");
    expect(readSettings({ apiKey: 5 }).apiKey).toBe("");
  });
});

describe("keys this version does not own", () => {
  // Test 4: a newer version of the extension may own the key, and this one
  // overwriting the whole payload would silently drop the user's choice.
  it("names an unknown key so a write can preserve it", () => {
    expect(
      unknownSettingKeys({ version: 1, defaultDeck: "x", futureThing: true }),
    ).toEqual({ futureThing: true });
  });

  it("names none of the keys this version does own", () => {
    expect(unknownSettingKeys(toSettingsPayload(DEFAULT_SETTINGS))).toEqual({});
  });

  it("names nothing at all for a payload it cannot read", () => {
    expect(unknownSettingKeys("wiped")).toEqual({});
  });
});

describe("validating what the user is about to save", () => {
  it("finds nothing wrong with the defaults", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([]);
  });

  it("refuses an empty deck", () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, defaultDeck: "  " }).map(
        (issue) => issue.code,
      ),
    ).toEqual(["deck-missing"]);
  });

  it("refuses an endpoint that is not an http address", () => {
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        endpoint: "ftp://127.0.0.1:8765",
      }).map((issue) => issue.code),
    ).toEqual(["endpoint-invalid"]);
  });

  it("refuses a timeout that is not a positive whole number of milliseconds", () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, timeoutMs: 0 }).map(
        (issue) => issue.code,
      ),
    ).toEqual(["timeout-invalid"]);
  });

  it("refuses a tag Anki could not store, and names it", () => {
    const issues = validateSettings({
      ...DEFAULT_SETTINGS,
      defaultTags: ["two words"],
    });

    expect(issues.map((issue) => issue.code)).toEqual(["tag-malformed"]);
    expect(issues[0]?.tag).toBe("two words");
  });

  it("refuses a mapping onto a field the default note type does not have", () => {
    const issues = validateSettings({
      ...DEFAULT_SETTINGS,
      fieldMapping: { sourceUrl: "Nowhere", sourceTitle: "" },
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "mapping-unknown-field",
    ]);
    expect(issues[0]?.field).toBe("Nowhere");
  });

  it("reports every problem rather than stopping at the first", () => {
    const issues = validateSettings({
      ...DEFAULT_SETTINGS,
      defaultDeck: "",
      timeoutMs: -1,
    });

    expect(issues.map((issue) => issue.code).sort()).toEqual([
      "deck-missing",
      "timeout-invalid",
    ]);
  });
});
