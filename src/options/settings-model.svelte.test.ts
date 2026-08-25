import { describe, expect, it } from "vitest";

import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { createFakeSettingsStore } from "@/core/ports/fakes/fake-settings-store";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { BASIC, CLOZE, VOCAB } from "@/fixtures/note-types";

import { createSettingsModel } from "./settings-model.svelte";

function model(
  overrides: Partial<Parameters<typeof createSettingsModel>[0]> = {},
) {
  return createSettingsModel({
    settings: createFakeSettingsStore(),
    anki: createFakeAnkiClient({
      decks: ["Default", "Geography"],
      noteTypes: [BASIC, VOCAB, CLOZE],
    }),
    ...overrides,
  });
}

describe("the settings view-model", () => {
  it("starts from what is stored", async () => {
    const settings = createFakeSettingsStore({ defaultDeck: "Geography" });

    const settingsModel = model({ settings });
    await settingsModel.load();

    expect(settingsModel.settings.defaultDeck).toBe("Geography");
  });

  it("reads Anki's decks and note types so the form is a choice, not a text box", async () => {
    const settingsModel = model();
    await settingsModel.load();

    expect(settingsModel.deckOptions).toContain("Geography");
    expect(settingsModel.noteTypeOptions).toContain("Vocab");
  });

  it("still offers the stored deck when Anki cannot be reached", async () => {
    const anki = createFakeAnkiClient({});
    anki.failWith({ kind: "anki-not-running", message: "closed" });

    const settingsModel = model({
      settings: createFakeSettingsStore({ defaultDeck: "Geography" }),
      anki,
    });
    await settingsModel.load();

    expect(settingsModel.deckOptions).toEqual(["Geography"]);
    expect(settingsModel.decks.kind).toBe("failed");
  });

  it("takes the whole note type descriptor when one is chosen, not just its name", async () => {
    const settingsModel = model();
    await settingsModel.load();

    settingsModel.setNoteType("Cloze");

    expect(settingsModel.settings.defaultNoteType.fields).toEqual([
      "Text",
      "Back Extra",
    ]);
    expect(settingsModel.settings.defaultNoteType.kind).toBe("cloze");
  });

  it("offers the fields of the chosen note type to map the source into", async () => {
    const settingsModel = model();
    await settingsModel.load();
    settingsModel.setNoteType("Vocab");

    expect(settingsModel.fieldOptions).toEqual(["", "Front", "Example"]);
  });

  it("clears a mapping the new note type has no field for", async () => {
    const settingsModel = model();
    await settingsModel.load();
    settingsModel.setSourceUrlField("Back");

    settingsModel.setNoteType("Cloze");

    expect(settingsModel.settings.fieldMapping.sourceUrl).toBe("");
  });

  it("keeps a mapping the new note type does have", async () => {
    const settingsModel = model();
    await settingsModel.load();
    settingsModel.setSourceUrlField("Front");

    settingsModel.setNoteType("Vocab");

    expect(settingsModel.settings.fieldMapping.sourceUrl).toBe("Front");
  });

  // Test 2 of the M8 plan, through the layer the options page actually uses.
  it("saves what was edited and reads it back", async () => {
    const settings = createFakeSettingsStore();
    const settingsModel = model({ settings });
    await settingsModel.load();

    settingsModel.setDeck("Geography");
    settingsModel.addTag("imported");
    await settingsModel.save();

    const stored = await settings.load();
    expect(stored.ok && stored.value.defaultDeck).toBe("Geography");
    expect(stored.ok && stored.value.defaultTags).toEqual(["imported"]);
    expect(settingsModel.saveState).toBe("saved");
  });

  it("refuses to save a setting that does not validate, and says which", async () => {
    const settings = createFakeSettingsStore();
    const settingsModel = model({ settings });
    await settingsModel.load();

    settingsModel.setEndpoint("not a url");
    await settingsModel.save();

    expect(settingsModel.saveState).toBe("refused");
    expect(settingsModel.issues.map((issue) => issue.code)).toEqual([
      "endpoint-invalid",
    ]);
    const stored = await settings.load();
    expect(stored.ok && stored.value.endpoint).toBe(DEFAULT_SETTINGS.endpoint);
  });

  it("reports a write the browser refused", async () => {
    const settings = createFakeSettingsStore();
    const settingsModel = model({ settings });
    await settingsModel.load();
    settings.failWith({ kind: "write-failed", message: "quota" });

    await settingsModel.save();

    expect(settingsModel.saveState).toBe("failed");
    expect(settingsModel.saveError?.kind).toBe("write-failed");
  });

  it("goes back to the defaults on reset", async () => {
    const settings = createFakeSettingsStore({ defaultDeck: "Geography" });
    const settingsModel = model({ settings });
    await settingsModel.load();

    await settingsModel.reset();

    expect(settingsModel.settings).toEqual(DEFAULT_SETTINGS);
    const stored = await settings.load();
    expect(stored.ok && stored.value).toEqual(DEFAULT_SETTINGS);
  });

  it("refuses a tag Anki could not store, without dropping it silently", async () => {
    const settingsModel = model();
    await settingsModel.load();

    settingsModel.addTag("two words");

    expect(settingsModel.settings.defaultTags).toEqual([]);
    expect(settingsModel.notice).toMatch(/space/i);
  });

  it("edits the endpoint, the timeout, and the API key", async () => {
    const settingsModel = model();
    await settingsModel.load();

    settingsModel.setEndpoint("http://127.0.0.1:9999");
    settingsModel.setTimeoutMs(250);
    settingsModel.setApiKey("s3cret");

    expect(settingsModel.settings.endpoint).toBe("http://127.0.0.1:9999");
    expect(settingsModel.settings.timeoutMs).toBe(250);
    expect(settingsModel.settings.apiKey).toBe("s3cret");
  });

  it("stops saying it saved once something else is edited", async () => {
    const settingsModel = model();
    await settingsModel.load();
    await settingsModel.save();
    expect(settingsModel.saveState).toBe("saved");

    settingsModel.setDeck("Geography");

    expect(settingsModel.saveState).toBe("idle");
  });

  it("degrades to the defaults when the stored settings cannot be read", async () => {
    const settings = createFakeSettingsStore();
    settings.failWith({ kind: "read-failed", message: "storage unavailable" });

    const settingsModel = model({ settings });
    await settingsModel.load();

    expect(settingsModel.settings).toEqual(DEFAULT_SETTINGS);
    expect(settingsModel.loadError?.kind).toBe("read-failed");
  });
});
