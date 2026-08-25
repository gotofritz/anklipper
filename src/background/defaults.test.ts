import { describe, expect, it } from "vitest";

import { createFakeRememberedStore } from "@/core/ports/fakes/fake-remembered-store";
import { createFakeSettingsStore } from "@/core/ports/fakes/fake-settings-store";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { CLOZE } from "@/fixtures/note-types";

import { resolveDefaults } from "./defaults";

describe("resolveDefaults", () => {
  // Test 7 of the M8 plan.
  it("takes the deck, note type, and tags the user configured", async () => {
    const settings = createFakeSettingsStore({
      defaultDeck: "Spanish::Verbs",
      defaultNoteType: CLOZE,
      defaultTags: ["vocab", "spanish"],
    });

    const defaults = await resolveDefaults({
      settings,
      remembered: createFakeRememberedStore(),
    });

    expect(defaults.deck).toBe("Spanish::Verbs");
    expect(defaults.noteType).toEqual(CLOZE);
    expect(defaults.tags).toEqual(["vocab", "spanish"]);
  });

  it("carries the field mapping and the source-URL style through", async () => {
    const settings = createFakeSettingsStore({
      fieldMapping: { sourceUrl: "Back", sourceTitle: "" },
      sourceUrlStyle: "link",
    });

    const defaults = await resolveDefaults({
      settings,
      remembered: createFakeRememberedStore(),
    });

    expect(defaults.fieldMapping).toEqual({
      sourceUrl: "Back",
      sourceTitle: "",
    });
    expect(defaults.sourceUrlStyle).toBe("link");
  });

  // Test 8's first half.
  it("prefers the deck last used over the configured default (8.5)", async () => {
    const defaults = await resolveDefaults({
      settings: createFakeSettingsStore({ defaultDeck: "Spanish::Verbs" }),
      remembered: createFakeRememberedStore({ lastDeck: "Geography" }),
    });

    expect(defaults.deck).toBe("Geography");
  });

  it("falls back to the configured default when nothing is remembered", async () => {
    const defaults = await resolveDefaults({
      settings: createFakeSettingsStore({ defaultDeck: "Spanish::Verbs" }),
      remembered: createFakeRememberedStore(),
    });

    expect(defaults.deck).toBe("Spanish::Verbs");
  });

  // 8.2, at the point where it matters most: this runs inside a capture.
  it("falls back to the shipped defaults when the settings cannot be read", async () => {
    const settings = createFakeSettingsStore();
    settings.failWith({ kind: "read-failed", message: "storage unavailable" });

    const defaults = await resolveDefaults({
      settings,
      remembered: createFakeRememberedStore(),
    });

    expect(defaults.deck).toBe(DEFAULT_SETTINGS.defaultDeck);
    expect(defaults.noteType).toEqual(DEFAULT_SETTINGS.defaultNoteType);
  });

  it("still captures when what is remembered cannot be read", async () => {
    const remembered = createFakeRememberedStore();
    remembered.failWith({
      kind: "read-failed",
      message: "storage unavailable",
    });

    const defaults = await resolveDefaults({
      settings: createFakeSettingsStore({ defaultDeck: "Spanish::Verbs" }),
      remembered,
    });

    expect(defaults.deck).toBe("Spanish::Verbs");
  });
});
