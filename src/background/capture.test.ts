import { describe, expect, it, vi } from "vitest";

import type { PageCapture } from "@/core/capture";
import type { CardDraft } from "@/core/draft";
import { createDraft } from "@/core/draft";
import type { DraftStore } from "@/core/ports/types";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import { err, ok } from "@/core/result";
import { createMessenger } from "@/messaging/messenger";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";
import type { ScriptingPort } from "@/platform/scripting";
import type { SidebarPort } from "@/platform/sidebar";
import { BASIC } from "@/fixtures/note-types";

import { captureFromGesture, describeCapture } from "./capture";

const CAPTURE: PageCapture = {
  text: "Paris is the capital of France.",
  html: "<b>Paris</b> is the capital of France.",
  context: "France is a country in Europe. Paris is the capital of France.",
  heading: "France",
  title: "France — Example",
  url: "https://example.test/france",
  warnings: [],
};

function fakeSidebar(): SidebarPort & { calls: number } {
  const sidebar = {
    calls: 0,
    open: vi.fn(async () => {
      sidebar.calls += 1;
      return ok(undefined);
    }),
  };
  return sidebar as unknown as SidebarPort & { calls: number };
}

function fakeScripting(
  inject: ScriptingPort["inject"] = vi.fn(async () => ok(undefined)),
): ScriptingPort {
  return { inject };
}

/** A page whose content script answers, as one already injected would. */
function pageThatAnswers(capture: PageCapture = CAPTURE) {
  const transport = createFakeRuntimeMessaging();
  transport.connectTab(7, async () => ok(capture));
  return transport;
}

function deps(
  overrides: Partial<Parameters<typeof captureFromGesture>[1]> = {},
) {
  const transport = overrides.messenger
    ? createFakeRuntimeMessaging()
    : pageThatAnswers();

  return {
    messenger: createMessenger(transport),
    scripting: fakeScripting(),
    sidebar: fakeSidebar(),
    drafts: createFakeDraftStore(),
    pending: createFakeDraftStore(),
    now: () => new Date("2026-01-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("captureFromGesture", () => {
  it("turns a selection into a saved draft", async () => {
    const withDeps = deps();

    const result = await captureFromGesture({ tabId: 7 }, withDeps);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.draft.fields.Front).toBe(
      "Paris is the capital of France.",
    );
    expect(result.ok && result.value.draft.source.url).toBe(
      "https://example.test/france",
    );
    await expect(withDeps.drafts.load()).resolves.toEqual({
      ok: true,
      value: result.ok ? result.value.draft : undefined,
    });
  });

  // The gesture risk: both browsers require `open` inside the gesture's own
  // task, so awaiting extraction first forfeits it.
  it("opens the sidebar before it asks the page for anything", () => {
    const sidebar = fakeSidebar();
    const transport = createFakeRuntimeMessaging();
    transport.connectTab(7, async () => {
      expect(sidebar.calls).toBe(1);
      return ok(CAPTURE);
    });

    const pending = captureFromGesture(
      { tabId: 7 },
      deps({ messenger: createMessenger(transport), sidebar }),
    );

    // Synchronously, before anything is awaited.
    expect(sidebar.calls).toBe(1);
    return pending;
  });

  it("injects the content script and retries when the tab has none", async () => {
    const transport = createFakeRuntimeMessaging();
    const inject = vi.fn(async () => {
      transport.connectTab(7, async () => ok(CAPTURE));
      return ok(undefined);
    });

    const result = await captureFromGesture(
      { tabId: 7 },
      deps({
        messenger: createMessenger(transport),
        scripting: fakeScripting(inject),
      }),
    );

    expect(inject).toHaveBeenCalledWith(7);
    expect(result.ok && result.value.draft.fields.Front).toBe(
      "Paris is the capital of France.",
    );
  });

  // Test 7: no content script is the typed failure, not a crash — and the
  // event's own text still makes a card (5.4).
  it("degrades to the trigger's own text when no content script can run", async () => {
    const inject = vi.fn(async () => ({
      ok: false as const,
      error: {
        kind: "not-injectable" as const,
        message: "cannot access about:reader",
      },
    }));

    const result = await captureFromGesture(
      {
        tabId: 7,
        selectionText: "Paris is the capital of France.",
        pageUrl: "https://example.test/france",
      },
      deps({
        messenger: createMessenger(createFakeRuntimeMessaging()),
        scripting: fakeScripting(inject),
      }),
    );

    expect(result.ok && result.value.draft.fields.Front).toBe(
      "Paris is the capital of France.",
    );
    expect(
      result.ok && result.value.warnings.map((warning) => warning.kind),
    ).toEqual(["no-content-script"]);
  });

  it("fails loudly when nothing at all could be captured", async () => {
    const result = await captureFromGesture(
      { tabId: 7 },
      deps({
        messenger: createMessenger(createFakeRuntimeMessaging()),
        scripting: fakeScripting(
          vi.fn(async () => ({
            ok: false as const,
            error: {
              kind: "not-injectable" as const,
              message: "cannot access about:reader",
            },
          })),
        ),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.kind).toBe("nothing-captured");
    expect(result.ok === false && result.error.message).toContain(
      "no content script",
    );
  });

  it("fails when the gesture carried no tab to read", async () => {
    const result = await captureFromGesture({}, deps());

    expect(result.ok === false && result.error.kind).toBe("no-tab");
  });

  it("carries the capture's blind spots through to the caller", async () => {
    const warnings = [
      { kind: "shadow-dom" as const, message: "inside a shadow root" },
    ];

    const result = await captureFromGesture(
      { tabId: 7, selectionText: "Paris is the capital of France." },
      deps({
        messenger: createMessenger(
          pageThatAnswers({ ...CAPTURE, text: "", warnings }),
        ),
      }),
    );

    expect(
      result.ok && result.value.warnings.map((warning) => warning.kind),
    ).toEqual(["shadow-dom"]);
    expect(result.ok && result.value.draft.fields.Front).toBe(
      "Paris is the capital of France.",
    );
  });

  // Never silently swallow a storage failure: the sidebar reads the draft
  // back out, so an unsaved draft is a lost one.
  it("reports a draft that could not be stored", async () => {
    const drafts = createFakeDraftStore();
    drafts.failWith({ kind: "write-failed", message: "quota exceeded" });

    const result = await captureFromGesture({ tabId: 7 }, deps({ drafts }));

    expect(result.ok === false && result.error.kind).toBe("not-saved");
  });

  it("reports a sidebar that refused to open, with the draft it still made", async () => {
    const sidebar = {
      open: vi.fn(async () => ({
        ok: false as const,
        error: { kind: "open-failed" as const, message: "no user gesture" },
      })),
    };

    const result = await captureFromGesture({ tabId: 7 }, deps({ sidebar }));

    expect(result.ok && result.value.sidebar.ok).toBe(false);
    expect(result.ok && result.value.draft.fields.Front).toBe(
      "Paris is the capital of France.",
    );
  });
});

describe("describeCapture", () => {
  it("reduces a failure to its kind and message", () => {
    expect(
      describeCapture({
        ok: false,
        error: { kind: "nothing-captured", message: "no content script" },
      }),
    ).toEqual({
      outcome: "failed",
      failure: { kind: "nothing-captured", message: "no content script" },
      warnings: [],
    });
  });

  it("reports a success as the blind spots it hit, if any", async () => {
    const result = await captureFromGesture(
      { tabId: 7 },
      deps({
        messenger: createMessenger(
          pageThatAnswers({
            ...CAPTURE,
            warnings: [{ kind: "context-truncated", message: "too long" }],
          }),
        ),
      }),
    );

    expect(describeCapture(result)).toEqual({
      outcome: "captured",
      stored: "draft",
      warnings: ["context-truncated"],
    });
  });

  it("reports a sidebar that would not open", async () => {
    const result = await captureFromGesture(
      { tabId: 7 },
      deps({
        sidebar: {
          open: vi.fn(async () => ({
            ok: false as const,
            error: { kind: "open-failed" as const, message: "no user gesture" },
          })),
        },
      }),
    );

    expect(describeCapture(result).sidebar).toEqual({
      kind: "open-failed",
      message: "no user gesture",
    });
  });

  // Privacy: a report is for a console and an issue, so page content must not
  // be reachable from it at all — not the draft, not the selection.
  it("carries no page content", async () => {
    const result = await captureFromGesture({ tabId: 7 }, deps());

    expect(JSON.stringify(describeCapture(result))).not.toContain("Paris");
  });
});

// Firefox's sidebar is already open for every capture after the first, and
// what `sidebarAction.open()` does then is not this extension's to rely on.
// The capture must not be hostage to that promise.
describe("a sidebar that does not finish opening", () => {
  it("still stores the draft", async () => {
    const withDeps = deps({
      sidebar: { open: () => new Promise(() => {}) },
      sidebarTimeoutMs: 1,
    });

    const result = await captureFromGesture({ tabId: 7 }, withDeps);

    expect(result.ok && result.value.draft.fields.Front).toBe(
      "Paris is the capital of France.",
    );
    const stored = await withDeps.drafts.load();
    expect(stored.ok && stored.value).toBeDefined();
  });

  it("reports it as timed out rather than hanging", async () => {
    const result = await captureFromGesture(
      { tabId: 7 },
      deps({
        sidebar: { open: () => new Promise(() => {}) },
        sidebarTimeoutMs: 1,
      }),
    );

    expect(result.ok && result.value.sidebar.ok).toBe(false);
    expect(
      result.ok && !result.value.sidebar.ok && result.value.sidebar.error.kind,
    ).toBe("open-timed-out");
  });

  it("reads the page without waiting for the sidebar at all", async () => {
    let opened = false;
    const transport = createFakeRuntimeMessaging();
    transport.connectTab(7, async () => {
      // The page is asked while the sidebar is still opening: the two are
      // independent, and only the gesture ordering matters.
      expect(opened).toBe(false);
      return ok(CAPTURE);
    });

    await captureFromGesture(
      { tabId: 7 },
      deps({
        messenger: createMessenger(transport),
        sidebar: {
          open: () =>
            new Promise((resolve) =>
              setTimeout(() => {
                opened = true;
                resolve(ok(undefined));
              }, 5),
            ),
        },
      }),
    );
  });

  it("does not wait for the sidebar before rejecting a gesture with no tab", async () => {
    const result = await captureFromGesture(
      {},
      deps({
        sidebar: { open: () => new Promise(() => {}) },
        sidebarTimeoutMs: 1,
      }),
    );

    expect(result.ok === false && result.error.kind).toBe("no-tab");
  });
});

/**
 * 7.4. One draft is edited at a time, and a second gesture must not throw the
 * first away: silently discarding an edited draft because the user selected
 * something else is the same data loss 7.1 exists to prevent, arriving from a
 * different direction.
 */
describe("a capture while a draft is already in flight", () => {
  const IN_FLIGHT = createDraft({
    deck: "Geography",
    noteType: BASIC,
    fields: { Front: "Half-written." },
    source: {
      text: "Half-written.",
      context: "",
      url: "https://example.test/earlier",
      title: "Earlier",
    },
    createdAt: "2026-01-01T11:00:00.000Z",
    generation: { name: "basic", version: 1 },
  });

  it("parks the new draft behind the one in flight", async () => {
    const withDeps = deps({ drafts: createFakeDraftStore(IN_FLIGHT) });

    const result = await captureFromGesture({ tabId: 7 }, withDeps);

    expect(result.ok && result.value.stored).toBe("pending");
    await expect(withDeps.drafts.load()).resolves.toEqual({
      ok: true,
      value: IN_FLIGHT,
    });
    await expect(withDeps.pending.load()).resolves.toEqual({
      ok: true,
      value: result.ok ? result.value.draft : undefined,
    });
  });

  it("takes the draft slot when nothing is in flight", async () => {
    const withDeps = deps();

    const result = await captureFromGesture({ tabId: 7 }, withDeps);

    expect(result.ok && result.value.stored).toBe("draft");
    await expect(withDeps.pending.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  // Nothing edits what is waiting, so there is nothing in it to lose.
  it("replaces whatever was already waiting", async () => {
    const withDeps = deps({
      drafts: createFakeDraftStore(IN_FLIGHT),
      pending: createFakeDraftStore(IN_FLIGHT),
    });

    const result = await captureFromGesture({ tabId: 7 }, withDeps);

    const waiting = await withDeps.pending.load();
    expect(waiting.ok && waiting.value?.source.url).toBe(
      "https://example.test/france",
    );
    expect(result.ok && result.value.stored).toBe("pending");
  });

  // A value the store cannot read is not a card anyone is editing, so there
  // is nothing to protect and prompting about it would be nonsense.
  it("takes the draft slot when what is stored cannot be read", async () => {
    const saved: CardDraft[] = [];
    const unreadable: DraftStore = {
      load: async () =>
        err({ kind: "malformed-stored-value", message: "not a draft" }),
      save: async (draft: CardDraft) => {
        saved.push(draft);
        return ok(undefined);
      },
      clear: async () => ok(undefined),
    };
    const withDeps = deps({ drafts: unreadable });

    const result = await captureFromGesture({ tabId: 7 }, withDeps);

    expect(result.ok && result.value.stored).toBe("draft");
    expect(saved).toHaveLength(1);
    await expect(withDeps.pending.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("reports a waiting draft that could not be stored", async () => {
    const pending = createFakeDraftStore();
    pending.failWith({ kind: "write-failed", message: "quota exceeded" });

    const result = await captureFromGesture(
      { tabId: 7 },
      deps({ drafts: createFakeDraftStore(IN_FLIGHT), pending }),
    );

    expect(result.ok === false && result.error.kind).toBe("not-saved");
  });

  it("says where the capture was put", async () => {
    const report = describeCapture(
      await captureFromGesture(
        { tabId: 7 },
        deps({ drafts: createFakeDraftStore(IN_FLIGHT) }),
      ),
    );

    expect(report).toMatchObject({ outcome: "captured", stored: "pending" });
  });
});
