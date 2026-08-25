import { describe, expect, it } from "vitest";

import { createDraft } from "@/core/draft";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import { backgroundDeps } from "@/fixtures/background";
import { BASIC } from "@/fixtures/note-types";
import { createMessenger } from "@/messaging/messenger";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";
import { startBackground } from "@/background/start";

import { loadDraft, pingBackground } from "./connect";

const DRAFT = createDraft({
  deck: "Geography",
  noteType: BASIC,
  fields: { Front: "Paris is the capital of France." },
  source: {
    text: "Paris is the capital of France.",
    context: "France is a country in Europe.",
    url: "https://example.test/france",
    title: "France — Example",
  },
  createdAt: "2026-01-01T12:00:00.000Z",
  generation: { name: "basic", version: 1 },
});

const WAITING = createDraft({
  deck: "Geography",
  noteType: BASIC,
  fields: { Front: "Berlin is the capital of Germany." },
  source: {
    text: "Berlin is the capital of Germany.",
    context: "",
    url: "https://example.test/germany",
    title: "Germany — Example",
  },
  createdAt: "2026-01-01T12:05:00.000Z",
  generation: { name: "basic", version: 1 },
});

describe("sidebar connection", () => {
  it("reports the context that answered", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground(backgroundDeps(transport));

    await expect(pingBackground(createMessenger(transport))).resolves.toEqual({
      kind: "connected",
      from: "background",
    });
  });

  // The background is an event page on Firefox and a service worker on
  // Chrome; both are unloaded when idle. A sidebar that crashed on the first
  // unanswered ping would be unusable.
  it("reports a background that did not answer as unavailable", async () => {
    const status = await pingBackground(
      createMessenger(createFakeRuntimeMessaging()),
    );

    expect(status).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("no-receiver"),
    });
  });
});

describe("loading the captured draft", () => {
  it("reports the draft the background is holding", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground(
      backgroundDeps(transport, { drafts: createFakeDraftStore(DRAFT) }),
    );

    await expect(loadDraft(createMessenger(transport))).resolves.toEqual({
      kind: "captured",
      draft: DRAFT,
      pending: undefined,
    });
  });

  // 7.4: a second gesture parks its draft rather than replacing this one, and
  // the panel cannot ask which the user meant unless it is told.
  it("carries the capture waiting behind the draft", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground(
      backgroundDeps(transport, {
        drafts: createFakeDraftStore(DRAFT),
        pending: createFakeDraftStore(WAITING),
      }),
    );

    await expect(loadDraft(createMessenger(transport))).resolves.toEqual({
      kind: "captured",
      draft: DRAFT,
      pending: WAITING,
    });
  });

  // Nothing can be waiting behind a draft that is not there: the capture that
  // found the slot empty took it.
  it("reports nothing captured even if something is waiting", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground(
      backgroundDeps(transport, { pending: createFakeDraftStore(WAITING) }),
    );

    await expect(loadDraft(createMessenger(transport))).resolves.toEqual({
      kind: "empty",
    });
  });

  // The first-run state: the sidebar can be opened before anything is captured.
  it("reports an empty store as nothing captured yet", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground(backgroundDeps(transport));

    await expect(loadDraft(createMessenger(transport))).resolves.toEqual({
      kind: "empty",
    });
  });

  it("reports a background that did not answer", async () => {
    const status = await loadDraft(
      createMessenger(createFakeRuntimeMessaging()),
    );

    expect(status).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("no-receiver"),
    });
  });
});
