import { describe, expect, it } from "vitest";

import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { createFakeSettingsStore } from "@/core/ports/fakes/fake-settings-store";
import { createNoteType } from "@/core/note-type";
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

  // The stored descriptor is a snapshot of what Anki said when it was chosen.
  // A field renamed in Anki since would leave the form offering a field that
  // no longer exists, and a save would write the stale copy back.
  it("reconciles the stored note type against Anki on load", async () => {
    const renamed = createNoteType({
      name: "Basic",
      fields: ["Front", "Reverse"],
    });

    const settingsModel = model({
      settings: createFakeSettingsStore({ defaultNoteType: BASIC }),
      anki: createFakeAnkiClient({ decks: ["Default"], noteTypes: [renamed] }),
    });
    await settingsModel.load();

    expect(settingsModel.settings.defaultNoteType.fields).toEqual([
      "Front",
      "Reverse",
    ]);
    expect(settingsModel.fieldOptions).toEqual(["", "Front", "Reverse"]);
  });

  it("keeps the stored note type when Anki no longer has one by that name", async () => {
    const settingsModel = model({
      settings: createFakeSettingsStore({ defaultNoteType: VOCAB }),
      anki: createFakeAnkiClient({ decks: ["Default"], noteTypes: [BASIC] }),
    });
    await settingsModel.load();

    expect(settingsModel.settings.defaultNoteType).toEqual(VOCAB);
    expect(settingsModel.noteTypeOptions).toContain("Vocab");
  });

  it("drops a mapping the reconciled note type no longer has a field for", async () => {
    const renamed = createNoteType({
      name: "Basic",
      fields: ["Front", "Reverse"],
    });

    const settingsModel = model({
      settings: createFakeSettingsStore({
        defaultNoteType: BASIC,
        fieldMapping: { sourceUrl: "Back", sourceTitle: "Front" },
      }),
      anki: createFakeAnkiClient({ decks: ["Default"], noteTypes: [renamed] }),
    });
    await settingsModel.load();

    expect(settingsModel.settings.fieldMapping).toEqual({
      sourceUrl: "",
      sourceTitle: "Front",
    });
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

/**
 * M8's endpoint setting is only real if the browser will let the extension
 * reach it. The manifest declares the add-on's default port and offers the
 * other loopback ports as optional, so a configured one has to be asked for —
 * and the Save press is the user gesture Firefox requires.
 */
describe("the permission the configured endpoint needs", () => {
  it("asks for it when saving, before anything is awaited", async () => {
    const asked: string[] = [];
    const settingsModel = model({
      requestHostPermission: async (endpoint: string) => {
        asked.push(endpoint);
        return true;
      },
    });
    await settingsModel.load();
    settingsModel.setEndpoint("http://127.0.0.1:9999");

    const saving = settingsModel.save();
    // Synchronously, in the same task as the press: Firefox refuses a request
    // made after an await.
    expect(asked).toEqual(["http://127.0.0.1:9999"]);
    await saving;
  });

  it("saves the settings anyway when the browser refuses, and says so", async () => {
    const settings = createFakeSettingsStore();
    const settingsModel = model({
      settings,
      requestHostPermission: async () => false,
    });
    await settingsModel.load();
    settingsModel.setEndpoint("http://127.0.0.1:9999");

    await settingsModel.save();

    const stored = await settings.load();
    expect(stored.ok && stored.value.endpoint).toBe("http://127.0.0.1:9999");
    expect(settingsModel.hostPermission).toBe("refused");
  });

  it("says nothing about a permission the browser granted", async () => {
    const settingsModel = model({ requestHostPermission: async () => true });
    await settingsModel.load();

    await settingsModel.save();

    expect(settingsModel.hostPermission).toBe("granted");
  });

  it("does not ask when the settings would not be saved anyway", async () => {
    const asked: string[] = [];
    const settingsModel = model({
      requestHostPermission: async (endpoint: string) => {
        asked.push(endpoint);
        return true;
      },
    });
    await settingsModel.load();
    settingsModel.setEndpoint("not a url");

    await settingsModel.save();

    expect(asked).toEqual([]);
    expect(settingsModel.saveState).toBe("refused");
  });
});

/**
 * 9. The key is optional and unset for almost everyone, and a credential
 * field on a form nobody needs is a field people fill in wrongly. It appears
 * when there is a reason for it and not before.
 */
describe("the API key, surfaced on demand", () => {
  it("stays out of the way when no key is set and none is wanted", async () => {
    const settingsModel = model();

    await settingsModel.load();

    expect(settingsModel.apiKeyWanted).toBe(false);
  });

  it("appears when AnkiConnect says a request needs one", async () => {
    const anki = createFakeAnkiClient({});
    anki.failWith({
      kind: "api-key-required",
      message: "valid api key must be provided",
    });

    const settingsModel = model({ anki });
    await settingsModel.load();

    expect(settingsModel.apiKeyWanted).toBe(true);
  });

  it("does not appear for a failure that is not about a key", async () => {
    const anki = createFakeAnkiClient({});
    anki.failWith({ kind: "anki-not-running", message: "closed" });

    const settingsModel = model({ anki });
    await settingsModel.load();

    expect(settingsModel.apiKeyWanted).toBe(false);
  });

  it("appears when a key is already stored, so it can be changed or cleared", async () => {
    const settingsModel = model({
      settings: createFakeSettingsStore({ apiKey: "s3cret" }),
    });

    await settingsModel.load();

    expect(settingsModel.apiKeyWanted).toBe(true);
  });

  it("appears when the user asks for it", async () => {
    const settingsModel = model();
    await settingsModel.load();

    settingsModel.revealApiKey();

    expect(settingsModel.apiKeyWanted).toBe(true);
  });

  it("stays once it has been asked for, even after the key is cleared", async () => {
    const settingsModel = model();
    await settingsModel.load();
    settingsModel.revealApiKey();

    settingsModel.setApiKey("");

    expect(settingsModel.apiKeyWanted).toBe(true);
  });

  it("goes away again with a reset, which cleared the key with it (8.5)", async () => {
    const settingsModel = model({
      settings: createFakeSettingsStore({ apiKey: "s3cret" }),
    });
    await settingsModel.load();
    expect(settingsModel.apiKeyWanted).toBe(true);

    await settingsModel.reset();

    expect(settingsModel.apiKeyWanted).toBe(false);
  });
});
