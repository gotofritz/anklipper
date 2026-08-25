import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDraft } from "@/core/draft";
import type { CardDraft } from "@/core/draft";
import type { NoteType } from "@/core/note-type";
import { createNoteType } from "@/core/note-type";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import { BASIC, CLOZE, VOCAB } from "@/fixtures/note-types";

import { createEditorModel } from "./editor-model.svelte";

function draftOf(noteType: NoteType, fields: Record<string, string>) {
  return createDraft({
    deck: "Geography",
    noteType,
    fields,
    tags: ["europe"],
    source: {
      text: "Paris is the capital of France.",
      context: "France is a country in Europe.",
      url: "https://example.test/france",
      title: "France — Example",
    },
    createdAt: "2026-01-01T12:00:00.000Z",
    generation: { name: "basic", version: 1 },
  });
}

const BASIC_DRAFT = draftOf(BASIC, { Front: "Capital of France?" });
const CLOZE_DRAFT = draftOf(CLOZE, { Text: "Paris is the capital of France." });

function modelFor(
  draft: CardDraft = BASIC_DRAFT,
  anki = createFakeAnkiClient({
    decks: ["Geography", "Default"],
    noteTypes: [BASIC, VOCAB, CLOZE],
  }),
  overrides: Partial<Parameters<typeof createEditorModel>[0]> = {},
) {
  const drafts = createFakeDraftStore(draft);

  return {
    model: createEditorModel({ anki, draft, drafts, ...overrides }),
    anki,
    drafts,
  };
}

describe("what the editor knows before it has asked Anki anything", () => {
  it("holds the draft it was given", () => {
    const { model } = modelFor();

    expect(model.draft).toEqual(BASIC_DRAFT);
  });

  // 6.3: idle is not the same as an empty list, and neither is a failure.
  it("has asked for neither decks nor note types yet", () => {
    const { model } = modelFor();

    expect(model.decks.kind).toBe("idle");
    expect(model.noteTypes.kind).toBe("idle");
  });

  it("offers the draft's own deck and note type before any list arrives", () => {
    const { model } = modelFor();

    expect(model.deckOptions).toContain("Geography");
    expect(model.noteTypeOptions).toContain("Basic");
  });
});

describe("loading what Anki holds", () => {
  it("ends up with the decks and note types Anki reported", async () => {
    const { model } = modelFor();
    await model.load();

    expect(model.decks).toEqual({
      kind: "ready",
      value: ["Geography", "Default"],
    });
    expect(model.noteTypeOptions).toEqual(["Basic", "Vocab", "Cloze"]);
  });

  it("reports the cause when the lists cannot be read", async () => {
    const anki = createFakeAnkiClient();
    anki.failWith({ kind: "anki-not-running", message: "connection refused" });
    const { model } = modelFor(BASIC_DRAFT, anki);
    await model.load();

    expect(model.decks).toEqual({
      kind: "failed",
      error: { kind: "anki-not-running", message: "connection refused" },
    });
  });

  // A list that arrives after the user has already picked something must not
  // silently replace their choice.
  it("keeps a deck the loaded list does not contain", async () => {
    const { model } = modelFor();
    model.setDeck("Only Mine");
    await model.load();

    expect(model.draft.deck).toBe("Only Mine");
    expect(model.deckOptions).toContain("Only Mine");
  });
});

describe("editing the draft", () => {
  it("puts a typed value into the field it names", () => {
    const { model } = modelFor();
    model.setField("Back", "Paris");

    expect(model.draft.fields).toEqual({
      Front: "Capital of France?",
      Back: "Paris",
    });
  });

  it("ignores a field the note type does not have", () => {
    const { model } = modelFor();
    model.setField("Nonsense", "x");

    expect(model.draft.fields).toEqual({
      Front: "Capital of France?",
      Back: "",
    });
  });

  // 6.1: the dropdown hands over a name; 3.2 decides what happens to content.
  it("remaps the fields on a note-type change and restores them on the way back", async () => {
    const { model } = modelFor();
    await model.load();
    model.setField("Back", "Paris");

    model.setNoteType("Vocab");
    expect(Object.keys(model.draft.fields)).toEqual(["Front", "Example"]);
    expect(model.draft.fields["Front"]).toBe("Capital of France?");

    model.setNoteType("Basic");
    expect(model.draft.fields["Back"]).toBe("Paris");
  });

  it("ignores a note type Anki has not reported", async () => {
    const { model } = modelFor();
    await model.load();
    model.setNoteType("Invented");

    expect(model.draft.noteType.name).toBe("Basic");
  });

  it("adds and removes tags", () => {
    const { model } = modelFor();
    model.addTag("capitals");
    expect(model.draft.tags).toEqual(["europe", "capitals"]);

    model.removeTag("europe");
    expect(model.draft.tags).toEqual(["capitals"]);
  });

  it("refuses a tag Anki would store as two, and says why", () => {
    const { model } = modelFor();
    model.addTag("two words");

    expect(model.draft.tags).toEqual(["europe"]);
    expect(model.notice).toMatch(/space/i);
  });
});

describe("validation", () => {
  it("reports the empty required field the card model names", () => {
    const { model } = modelFor(draftOf(BASIC, { Front: "" }));

    expect(model.issues.map((issue) => issue.code)).toContain("field-required");
  });

  it("has nothing to report about a complete draft", () => {
    const { model } = modelFor();

    expect(model.issues).toEqual([]);
  });
});

describe("cloze deletions", () => {
  it("is not a cloze editor for a standard note type", () => {
    const { model } = modelFor();

    expect(model.isCloze).toBe(false);
    expect(model.deletions).toEqual([]);
  });

  it("marks a selection as the next deletion", () => {
    const { model } = modelFor(CLOZE_DRAFT);
    model.markCloze(0, 5);

    expect(model.draft.fields["Text"]).toBe(
      "{{c1::Paris}} is the capital of France.",
    );
    expect(model.deletions.map((one) => one.ordinal)).toEqual([1]);
    expect(model.nextOrdinal).toBe(2);
  });

  it("leaves the caret just past the markup it wrote", () => {
    const { model } = modelFor(CLOZE_DRAFT);

    expect(model.markCloze(0, 5)).toBe("{{c1::Paris}}".length);
  });

  // 3.9: a second span under the same ordinal is how two blanks are grouped.
  it("groups a second span under an ordinal it is given", () => {
    const { model } = modelFor(CLOZE_DRAFT);
    model.markCloze(0, 5);
    const text = model.draft.fields["Text"] ?? "";
    const at = text.indexOf("France");
    model.markCloze(at, at + "France".length, 1);

    expect(model.draft.fields["Text"]).toBe(
      "{{c1::Paris}} is the capital of {{c1::France}}.",
    );
    expect(model.deletions).toHaveLength(2);
    expect(model.nextOrdinal).toBe(2);
  });

  it("refuses a selection that overlaps a deletion and leaves the field alone", () => {
    const { model } = modelFor(CLOZE_DRAFT);
    model.markCloze(0, 5);
    const before = model.draft.fields["Text"];

    expect(model.markCloze(2, 8)).toBeUndefined();
    expect(model.draft.fields["Text"]).toBe(before);
    expect(model.notice).toContain("c1");
  });

  it("asks for a selection when nothing is selected", () => {
    const { model } = modelFor(CLOZE_DRAFT);

    expect(model.markCloze(4, 4)).toBeUndefined();
    expect(model.notice).toMatch(/select/i);
  });

  it("clears the refusal once a mark succeeds", () => {
    const { model } = modelFor(CLOZE_DRAFT);
    model.markCloze(4, 4);
    model.markCloze(0, 5);

    expect(model.notice).toBeUndefined();
  });

  it("unwraps a deletion by its ordinal", () => {
    const { model } = modelFor(CLOZE_DRAFT);
    model.markCloze(0, 5);
    model.removeCloze(1);

    expect(model.draft.fields["Text"]).toBe("Paris is the capital of France.");
    expect(model.deletions).toEqual([]);
  });

  // Anki rejects a cloze note with no deletion; so does the card model.
  it("reports a cloze field with no deletion as an issue", () => {
    const { model } = modelFor(CLOZE_DRAFT);

    expect(model.issues.map((issue) => issue.code)).toContain(
      "cloze-no-deletions",
    );
  });
});

describe("duplicates", () => {
  it("says so when Anki already holds the first field", async () => {
    const { model } = modelFor(
      BASIC_DRAFT,
      createFakeAnkiClient({ duplicates: ["Capital of France?"] }),
    );
    await model.load();

    expect(model.duplicate).toEqual({ kind: "ready", value: true });
  });

  it("says so when it does not", async () => {
    const { model } = modelFor();
    await model.load();

    expect(model.duplicate).toEqual({ kind: "ready", value: false });
  });

  it("re-checks against the edited draft", async () => {
    const { model } = modelFor(
      BASIC_DRAFT,
      createFakeAnkiClient({ duplicates: ["Capital of France?"] }),
    );
    await model.load();
    model.setField("Front", "Capital of Spain?");
    await model.checkDuplicate();

    expect(model.duplicate).toEqual({ kind: "ready", value: false });
  });

  // A warning about text the user has already replaced is worse than none.
  it("stops claiming a duplicate once the first field changes", async () => {
    const { model } = modelFor(
      BASIC_DRAFT,
      createFakeAnkiClient({ duplicates: ["Capital of France?"] }),
    );
    await model.load();
    expect(model.duplicate).toEqual({ kind: "ready", value: true });

    model.setField("Front", "Capital of Spain?");
    expect(model.duplicate.kind).toBe("idle");
  });

  it("reports a check it could not make rather than claiming no duplicate", async () => {
    const anki = createFakeAnkiClient();
    anki.failWith({ kind: "timeout", message: "no answer" });
    const { model } = modelFor(BASIC_DRAFT, anki);
    await model.checkDuplicate();

    expect(model.duplicate.kind).toBe("failed");
  });
});

describe("adding the card", () => {
  it("refuses an invalid draft without going near the port", async () => {
    const { model, anki } = modelFor(draftOf(BASIC, { Front: "" }));
    await model.submit();

    expect(anki.added).toEqual([]);
    expect(model.submission.kind).toBe("refused");
  });

  it("sends the draft exactly once", async () => {
    const { model, anki } = modelFor();
    await model.submit();

    expect(anki.added).toHaveLength(1);
    expect(anki.added[0]).toEqual(model.draft);
    expect(model.submission).toEqual({ kind: "added", noteId: 1 });
  });

  it("adds a duplicate the user went ahead with", async () => {
    const { model, anki } = modelFor(
      BASIC_DRAFT,
      createFakeAnkiClient({ duplicates: ["Capital of France?"] }),
    );
    await model.load();
    await model.submit();

    expect(anki.added).toHaveLength(1);
  });

  // 7.2 is M7's, but the draft has to survive the failure for it to be
  // possible at all.
  it("keeps the draft when the add fails", async () => {
    const anki = createFakeAnkiClient();
    anki.failWith({ kind: "unknown-deck", message: "deck was not found" });
    const { model } = modelFor(BASIC_DRAFT, anki);
    await model.submit();

    expect(model.submission).toEqual({
      kind: "failed",
      error: { kind: "unknown-deck", message: "deck was not found" },
    });
    expect(model.draft).toEqual(BASIC_DRAFT);

    model.setField("Back", "Paris");
    expect(model.draft.fields["Back"]).toBe("Paris");
  });

  // Nothing here clears the draft on success — that is 7.3's — so without a
  // guard a second press would put a second copy of the card into Anki.
  it("does not send the same card twice without an edit", async () => {
    const { model, anki } = modelFor();
    await model.submit();
    await model.submit();

    expect(anki.added).toHaveLength(1);
  });

  it("is ready to send again once the draft changes", async () => {
    const { model, anki } = modelFor();
    await model.submit();
    model.setField("Back", "Paris");
    await model.submit();

    expect(anki.added).toHaveLength(2);
  });

  it("clears a refusal once the draft is fixed and sent", async () => {
    const { model, anki } = modelFor(draftOf(BASIC, { Front: "" }));
    await model.submit();
    expect(model.submission.kind).toBe("refused");

    model.setField("Front", "Capital of France?");
    await model.submit();

    expect(model.submission.kind).toBe("added");
    expect(anki.added).toHaveLength(1);
    expect(anki.added[0]?.fields["Front"]).toBe("Capital of France?");
  });
});

/**
 * 7.1. The draft is durable from the moment it exists, and an edit is part of
 * it: both browsers unload the background when idle and Firefox's sidebar
 * goes with the window, so work held only in memory is lost without the user
 * doing anything wrong.
 */
describe("persisting what the user types", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the edit once the typing stops", async () => {
    const { model, drafts } = modelFor(BASIC_DRAFT, undefined, {
      debounceMs: 50,
    });

    model.setField("Back", "Paris");
    await vi.advanceTimersByTimeAsync(50);

    const stored = await drafts.load();
    expect(stored.ok && stored.value?.fields["Back"]).toBe("Paris");
  });

  // Writing on every keystroke is the wasteful half of M7's risk; writing
  // only on blur is the half that loses the last field.
  it("writes once for a run of keystrokes, and writes the last of them", async () => {
    const writes: string[] = [];
    const drafts = createFakeDraftStore(BASIC_DRAFT);
    const recording = {
      ...drafts,
      save: async (draft: CardDraft) => {
        writes.push(draft.fields["Back"] ?? "");
        return drafts.save(draft);
      },
    };
    const { model } = modelFor(BASIC_DRAFT, undefined, {
      drafts: recording,
      debounceMs: 50,
    });

    model.setField("Back", "P");
    model.setField("Back", "Pa");
    model.setField("Back", "Paris");
    await vi.advanceTimersByTimeAsync(50);

    expect(writes).toEqual(["Paris"]);
  });

  it("has not written yet while the user is still typing", async () => {
    const { model, drafts } = modelFor(BASIC_DRAFT, undefined, {
      debounceMs: 50,
    });

    model.setField("Back", "Paris");
    await vi.advanceTimersByTimeAsync(20);

    const stored = await drafts.load();
    expect(stored.ok && stored.value?.fields["Back"]).toBe("");
  });

  // The draft has to be safe before the card goes anywhere: a failed add is
  // the case 7.2 exists for, and it must leave the edits behind.
  it("flushes the outstanding edit before it submits", async () => {
    const anki = createFakeAnkiClient({ noteTypes: [BASIC] });
    anki.failWith({ kind: "anki-not-running", message: "nothing answered" });
    const { model, drafts } = modelFor(BASIC_DRAFT, anki, {
      debounceMs: 5_000,
    });

    model.setField("Back", "Paris");
    await model.submit();

    const stored = await drafts.load();
    expect(stored.ok && stored.value?.fields["Back"]).toBe("Paris");
  });

  it("flushes on demand, for a sidebar that is about to close", async () => {
    const { model, drafts } = modelFor(BASIC_DRAFT, undefined, {
      debounceMs: 5_000,
    });

    model.setField("Back", "Paris");
    await model.flush();

    const stored = await drafts.load();
    expect(stored.ok && stored.value?.fields["Back"]).toBe("Paris");
  });

  // Silently failing to save is the one failure the user cannot see coming.
  it("says so when the edit could not be stored", async () => {
    const drafts = createFakeDraftStore(BASIC_DRAFT);
    drafts.failWith({ kind: "write-failed", message: "quota exceeded" });
    const { model } = modelFor(BASIC_DRAFT, undefined, { drafts });

    model.setField("Back", "Paris");
    await model.flush();

    expect(model.saveError).toEqual({
      kind: "write-failed",
      message: "quota exceeded",
    });
  });

  it("stops saying so once a write gets through", async () => {
    const drafts = createFakeDraftStore(BASIC_DRAFT);
    drafts.failWith({ kind: "write-failed", message: "quota exceeded" });
    const { model } = modelFor(BASIC_DRAFT, undefined, { drafts });
    model.setField("Back", "Paris");
    await model.flush();

    drafts.failWith(undefined);
    model.setField("Back", "Paris, France");
    await model.flush();

    expect(model.saveError).toBeUndefined();
  });

  // 7.3 hands the slot over the moment the card is in Anki. A late write
  // would put the card that was just added back into it.
  it("writes nothing more once the card has been added", async () => {
    const { model, drafts } = modelFor(BASIC_DRAFT, undefined, {
      debounceMs: 50,
    });
    await model.submit();
    await drafts.clear();

    model.setField("Back", "Paris");
    await vi.advanceTimersByTimeAsync(50);
    await model.flush();

    await expect(drafts.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  /**
   * The slot can be handed over while an edit is still waiting: the card was
   * added, discarded, or replaced by the newer selection (7.3, 7.4). A write
   * landing afterwards would resurrect a card the user is finished with, or
   * overwrite the one they chose instead.
   */
  it("does not write into a slot that has been emptied", async () => {
    const { model, drafts } = modelFor(BASIC_DRAFT, undefined, {
      debounceMs: 50,
    });

    model.setField("Back", "Paris");
    await drafts.clear();
    await model.flush();

    await expect(drafts.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("does not overwrite the card that took the slot", async () => {
    const later = draftOf(BASIC, { Front: "Capital of Germany?" });
    const newer = { ...later, createdAt: "2026-01-01T12:05:00.000Z" };
    const { model, drafts } = modelFor(BASIC_DRAFT, undefined, {
      debounceMs: 50,
    });

    model.setField("Back", "Paris");
    await drafts.save(newer);
    await model.flush();

    const stored = await drafts.load();
    expect(stored.ok && stored.value?.fields["Front"]).toBe(
      "Capital of Germany?",
    );
  });

  it("drops an outstanding edit when it is stopped", async () => {
    const { model, drafts } = modelFor(BASIC_DRAFT, undefined, {
      debounceMs: 50,
    });

    model.setField("Back", "Paris");
    model.stop();
    await vi.advanceTimersByTimeAsync(50);

    const stored = await drafts.load();
    expect(stored.ok && stored.value?.fields["Back"]).toBe("");
  });
});

/** 7.2 and 7.5: the same draft, sent again, with nothing to re-enter. */
describe("retrying a failed add", () => {
  it("sends the same draft again and succeeds", async () => {
    const anki = createFakeAnkiClient({ noteTypes: [BASIC] });
    anki.failWith({ kind: "anki-not-running", message: "nothing answered" });
    const { model } = modelFor(BASIC_DRAFT, anki);
    model.setField("Back", "Paris");
    await model.submit();
    expect(model.submission.kind).toBe("failed");

    anki.failWith(undefined);
    await model.submit();

    expect(model.submission.kind).toBe("added");
    expect(anki.added).toHaveLength(1);
    expect(anki.added[0]?.fields["Back"]).toBe("Paris");
  });

  it("keeps the draft and its edits across the failure", async () => {
    const anki = createFakeAnkiClient({ noteTypes: [BASIC] });
    anki.failWith({ kind: "timeout", message: "Anki never answered" });
    const { model } = modelFor(BASIC_DRAFT, anki);

    model.setField("Back", "Paris");
    await model.submit();

    expect(model.draft.fields["Back"]).toBe("Paris");
    expect(model.submission).toEqual({
      kind: "failed",
      error: { kind: "timeout", message: "Anki never answered" },
    });
  });
});

/** 7.3: the card is in Anki, so the slot it was held in is handed over. */
describe("what happens after a successful add", () => {
  it("tells its caller the note id", async () => {
    const added: number[] = [];
    const { model } = modelFor(BASIC_DRAFT, undefined, {
      onAdded: (noteId: number) => {
        added.push(noteId);
      },
    });

    await model.submit();

    expect(added).toEqual([1]);
  });

  it("says nothing when the add failed", async () => {
    const anki = createFakeAnkiClient({ noteTypes: [BASIC] });
    anki.failWith({ kind: "unknown-deck", message: "no such deck" });
    const added: number[] = [];
    const { model } = modelFor(BASIC_DRAFT, anki, {
      onAdded: (noteId: number) => {
        added.push(noteId);
      },
    });

    await model.submit();

    expect(added).toEqual([]);
  });
});

/**
 * M6 left 3.12's conversion without an affordance; M7's flow is where it gets
 * one. The switch alone would stash everything — Basic and Cloze share no
 * field name — so the selection has to be carried across deliberately.
 */
describe("converting a captured card to cloze", () => {
  it("offers the cloze note type Anki reported", async () => {
    const { model } = modelFor();
    expect(model.clozeTarget).toBeUndefined();

    await model.load();

    expect(model.clozeTarget?.name).toBe("Cloze");
  });

  it("has nothing to offer a card that is already cloze", async () => {
    const { model } = modelFor(CLOZE_DRAFT);
    await model.load();

    expect(model.clozeTarget).toBeUndefined();
  });

  it("carries the selection into the cloze field", async () => {
    const { model } = modelFor();
    await model.load();

    model.convertToCloze();

    expect(model.draft.noteType.name).toBe("Cloze");
    expect(model.draft.fields["Text"]).toBe("Capital of France?");
    expect(model.isCloze).toBe(true);
  });

  it("does nothing when Anki has reported no cloze note type", async () => {
    const { model } = modelFor(
      BASIC_DRAFT,
      createFakeAnkiClient({ noteTypes: [BASIC, VOCAB] }),
    );
    await model.load();

    model.convertToCloze();

    expect(model.draft.noteType.name).toBe("Basic");
  });

  it("persists the conversion like any other edit", async () => {
    const { model, drafts } = modelFor();
    await model.load();

    model.convertToCloze();
    await model.flush();

    const stored = await drafts.load();
    expect(stored.ok && stored.value?.noteType.name).toBe("Cloze");
  });
});

/**
 * M7's risk: a note type edited in Anki while the draft is open. Submitting
 * field names it no longer has would be refused by AnkiConnect, three layers
 * from anywhere it could be explained.
 */
describe("reconciling the note type against Anki", () => {
  const RENAMED = createNoteType({
    name: "Basic",
    fields: ["Front", "Reverse"],
  });

  it("remaps the draft onto the fields Anki reports now", async () => {
    const { model } = modelFor(
      draftOf(BASIC, { Front: "Capital of France?", Back: "Paris" }),
      createFakeAnkiClient({ noteTypes: [RENAMED] }),
    );

    await model.load();

    expect(model.draft.noteType.fields).toEqual(["Front", "Reverse"]);
    expect(model.draft.fields["Front"]).toBe("Capital of France?");
    expect(model.draft.stash).toEqual({ Basic: { Back: "Paris" } });
  });

  // The capture's note type is the name heuristic's guess (3.7); Anki reads
  // the flavour off the templates (4.6), and a custom cloze note type with no
  // "cloze" in its name is exactly what the heuristic gets wrong.
  it("takes the flavour Anki reports over the one the name suggested", async () => {
    const fromAnki = createNoteType({
      name: "Basic",
      fields: ["Front", "Back"],
      kind: "cloze",
    });
    const { model } = modelFor(
      BASIC_DRAFT,
      createFakeAnkiClient({ noteTypes: [fromAnki] }),
    );

    await model.load();

    expect(model.isCloze).toBe(true);
  });

  it("leaves an unchanged draft alone", async () => {
    const { model } = modelFor();
    const before = model.draft;

    await model.load();

    expect(model.draft).toBe(before);
  });

  it("leaves the draft alone when Anki does not report its note type", async () => {
    const { model } = modelFor(
      BASIC_DRAFT,
      createFakeAnkiClient({ noteTypes: [VOCAB] }),
    );

    await model.load();

    expect(model.draft.noteType.fields).toEqual(["Front", "Back"]);
  });
});
