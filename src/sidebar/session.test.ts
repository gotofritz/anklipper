import { describe, expect, it } from "vitest";

import type { CardDraft } from "@/core/draft";
import { createDraft } from "@/core/draft";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import type { DraftStore } from "@/core/ports/types";
import { err, ok } from "@/core/result";
import { BASIC } from "@/fixtures/note-types";

import { createFakeRememberedStore } from "@/core/ports/fakes/fake-remembered-store";

import {
  dismissPending,
  rememberDeck,
  rememberSticky,
  setStickyPin,
  takePending,
  updateRemembered,
} from "./session";

function draftOf(title: string, createdAt: string): CardDraft {
  return createDraft({
    deck: "Geography",
    noteType: BASIC,
    fields: { Front: title },
    source: { text: title, context: "", url: "https://example.test", title },
    createdAt,
    generation: { name: "basic", version: 1 },
  });
}

const IN_FLIGHT = draftOf("Earlier", "2026-01-01T11:00:00.000Z");
const WAITING = draftOf("Later", "2026-01-01T12:00:00.000Z");

describe("takePending", () => {
  it("moves the waiting capture into the slot the finished draft held", async () => {
    const drafts = createFakeDraftStore(IN_FLIGHT);
    const pending = createFakeDraftStore(WAITING);

    const taken = await takePending(drafts, pending);

    expect(taken).toEqual({ ok: true, value: WAITING });
    await expect(drafts.load()).resolves.toEqual({ ok: true, value: WAITING });
    await expect(pending.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("clears the draft when nothing is waiting", async () => {
    const drafts = createFakeDraftStore(IN_FLIGHT);

    const taken = await takePending(drafts, createFakeDraftStore());

    expect(taken).toEqual({ ok: true, value: undefined });
    await expect(drafts.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  // The waiting capture is the only copy there is: destroying the draft slot
  // before knowing what goes into it would lose whichever of the two the read
  // was about.
  it("destroys nothing when the waiting slot cannot be read", async () => {
    const drafts = createFakeDraftStore(IN_FLIGHT);
    const pending = createFakeDraftStore(WAITING);
    pending.failWith({
      kind: "malformed-stored-value",
      message: "not a draft",
    });

    const taken = await takePending(drafts, pending);

    expect(taken.ok === false && taken.error.kind).toBe(
      "malformed-stored-value",
    );
    await expect(drafts.load()).resolves.toEqual({
      ok: true,
      value: IN_FLIGHT,
    });
  });

  // Clearing it anyway would leave the same card in both slots, and the panel
  // would go on asking about a capture it had already opened.
  it("keeps the waiting capture when it could not be promoted", async () => {
    const pending = createFakeDraftStore(WAITING);
    const refusing: DraftStore = {
      load: async () => ok(IN_FLIGHT),
      save: async () => err({ kind: "write-failed", message: "quota" }),
      clear: async () => ok(undefined),
    };

    const taken = await takePending(refusing, pending);

    expect(taken.ok === false && taken.error.kind).toBe("write-failed");
    await expect(pending.load()).resolves.toEqual({ ok: true, value: WAITING });
  });
});

describe("dismissPending", () => {
  it("drops the waiting capture and leaves the draft alone", async () => {
    const drafts = createFakeDraftStore(IN_FLIGHT);
    const pending = createFakeDraftStore(WAITING);

    expect(await dismissPending(pending)).toEqual({
      ok: true,
      value: undefined,
    });

    await expect(pending.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(drafts.load()).resolves.toEqual({
      ok: true,
      value: IN_FLIGHT,
    });
  });
});

describe("rememberDeck", () => {
  // Test 8 of the M8 plan: what makes the next capture start where this one
  // ended. Remembered, not configured (8.5).
  it("records the deck the card actually went into", async () => {
    const remembered = createFakeRememberedStore();

    await rememberDeck(remembered, "Spanish::Verbs");

    const stored = await remembered.load();
    expect(stored.ok && stored.value.lastDeck).toBe("Spanish::Verbs");
  });

  it("records nothing for a card with no deck", async () => {
    const remembered = createFakeRememberedStore({ lastDeck: "Geography" });

    await rememberDeck(remembered, "   ");

    const stored = await remembered.load();
    expect(stored.ok && stored.value.lastDeck).toBe("Geography");
  });

  it("reports a write it could not make, rather than throwing", async () => {
    const remembered = createFakeRememberedStore();
    remembered.failWith({ kind: "write-failed", message: "storage full" });

    expect((await rememberDeck(remembered, "Geography")).ok).toBe(false);
  });
});

describe("what one remembered value does to another", () => {
  // Both the deck and the pins live under one key (8.5, 10.6), so a write
  // that replaced the whole value would quietly cost whichever the other
  // caller had just made.
  it("keeps the pins when the deck is remembered", async () => {
    const remembered = createFakeRememberedStore({
      sticky: { Basic: { Back: "Source: Wikipedia" } },
    });

    await rememberDeck(remembered, "Spanish::Verbs");

    const stored = await remembered.load();
    expect(stored.ok && stored.value).toEqual({
      lastDeck: "Spanish::Verbs",
      sticky: { Basic: { Back: "Source: Wikipedia" } },
    });
  });

  it("keeps the deck when a pin is set", async () => {
    const remembered = createFakeRememberedStore({ lastDeck: "Geography" });

    await setStickyPin(remembered, "Basic", "Back", "note", true);

    const stored = await remembered.load();
    expect(stored.ok && stored.value).toEqual({
      lastDeck: "Geography",
      sticky: { Basic: { Back: "note" } },
    });
  });

  it("unpins without disturbing the rest", async () => {
    const remembered = createFakeRememberedStore({
      lastDeck: "Geography",
      sticky: { Basic: { Back: "note", Front: "kept" } },
    });

    await setStickyPin(remembered, "Basic", "Back", "", false);

    const stored = await remembered.load();
    expect(stored.ok && stored.value.sticky).toEqual({
      Basic: { Front: "kept" },
    });
  });

  it("records what the pinned fields held on the card that was added", async () => {
    const remembered = createFakeRememberedStore({
      sticky: { Basic: { Back: "" } },
    });

    await rememberSticky(remembered, draftOf("Paris", "2026-01-01T00:00:00Z"));

    const stored = await remembered.load();
    expect(stored.ok && stored.value.sticky).toEqual({ Basic: { Back: "" } });
  });

  it("reports a read it could not make", async () => {
    const remembered = createFakeRememberedStore();
    remembered.failWith({ kind: "read-failed", message: "storage said no" });

    const result = await updateRemembered(remembered, (current) => current);

    expect(result.ok).toBe(false);
  });
});
