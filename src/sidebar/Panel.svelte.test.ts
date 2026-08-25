import { fireEvent, render, screen } from "@testing-library/svelte";
import type { ComponentProps } from "svelte";
import { describe, expect, it, vi } from "vitest";

import type { CaptureWarning } from "@/core/capture";
import { createDraft } from "@/core/draft";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import { createFakeRememberedStore } from "@/core/ports/fakes/fake-remembered-store";
import { BASIC } from "@/fixtures/note-types";

import Panel from "./Panel.svelte";
import type { DraftStatus, SidebarStatus } from "./connect";

const never = () => new Promise<SidebarStatus>(() => {});
/** The panel always has a client now; what it answers only matters per case. */
const client = () =>
  createFakeAnkiClient({ decks: ["Geography"], noteTypes: [BASIC] });
const noDraft = async (): Promise<DraftStatus> => ({ kind: "empty" });
/** No capture happens while the panel is mounted, in most of these cases. */
const noChanges = () => () => {};

type PanelProps = ComponentProps<typeof Panel>;
type PanelDefaults = "anki" | "drafts" | "pending" | "remembered";

/** The panel now owns the two draft slots (7.3, 7.4), so every case has both. */
function renderPanel(
  props: Omit<PanelProps, PanelDefaults> &
    Partial<Pick<PanelProps, PanelDefaults>>,
) {
  const drafts = createFakeDraftStore();
  const pending = createFakeDraftStore();
  const remembered = createFakeRememberedStore();

  return {
    drafts,
    pending,
    remembered,
    ...render(Panel, {
      anki: client(),
      drafts,
      pending,
      remembered,
      ...props,
    }),
  };
}

function draftWith(warnings?: readonly CaptureWarning[]) {
  return createDraft({
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
    generation: {
      name: "basic",
      version: 1,
      ...(warnings === undefined ? {} : { warnings }),
    },
  });
}

/**
 * A field is a `contenteditable` from M10 (10.2): reached by its role, and
 * read by what it holds rather than by a form control's value.
 */
function fieldOf(name: string): HTMLElement {
  return screen.getByRole("textbox", { name });
}

function findField(name: string): Promise<HTMLElement> {
  return screen.findByRole("textbox", { name });
}

/** What the user typed, as the browser would leave it in the element. */
async function typeInto(name: string, html: string) {
  const node = fieldOf(name);
  node.innerHTML = html;
  await fireEvent.input(node);
}

describe("sidebar panel", () => {
  it("names the extension", () => {
    renderPanel({
      connect: never,
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(
      screen.getByRole("heading", { name: "Anklipper" }),
    ).toBeInTheDocument();
  });

  it("says it is connecting while the background has not answered", () => {
    renderPanel({
      connect: never,
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
  });

  it("reports the context that answered once it has", async () => {
    renderPanel({
      connect: async () => ({ kind: "connected", from: "background" }),
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/background/i);
  });

  it("reports an unreachable background rather than staying blank", async () => {
    renderPanel({
      connect: async () => ({ kind: "unavailable", reason: "no-receiver" }),
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/no-receiver/);
  });
});

// The skin puts a teletype marker at the right of the status strip. It was a
// fixed `::after` string reading `RT/OK`, which said "connected" whatever the
// panel had actually found — so it is the real state or it is nothing.
describe("the status marker", () => {
  it("reads as unchecked while the background has not answered", () => {
    renderPanel({ connect: never, loadDraft: noDraft, subscribe: noChanges });

    expect(screen.getByRole("status")).toHaveTextContent("RT/--");
  });

  it("reads as connected once a context has answered", async () => {
    renderPanel({
      connect: async () => ({ kind: "connected", from: "background" }),
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(await screen.findByRole("status")).toHaveTextContent("RT/OK");
  });

  it("distinguishes a failed check from an unmade one", async () => {
    renderPanel({
      connect: async () => ({ kind: "unavailable", reason: "no-receiver" }),
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("RT/NO");
    expect(status).not.toHaveTextContent("RT/--");
  });
});

// The colophon was a hardcoded `content:` string carrying a made-up serial
// (`ANKLIPPER／0010`). A version nobody can trust is worse than none, so it
// now renders the running extension's own.
describe("the colophon", () => {
  it("carries the version it was given", () => {
    renderPanel({
      connect: never,
      loadDraft: noDraft,
      subscribe: noChanges,
      version: "1.2.3",
    });

    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "ANKLIPPER／1.2.3",
    );
  });

  it("names the extension without a serial when the version is unknown", () => {
    renderPanel({ connect: never, loadDraft: noDraft, subscribe: noChanges });

    const colophon = screen.getByRole("contentinfo");
    expect(colophon).toHaveTextContent("ANKLIPPER");
    expect(colophon).not.toHaveTextContent("／");
  });
});

describe("the captured draft", () => {
  it("says nothing has been captured yet", async () => {
    renderPanel({
      connect: never,
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(
      await screen.findByText(/select some text.*create anki card/i),
    ).toBeInTheDocument();
  });

  it("opens the captured draft in the editor", async () => {
    renderPanel({
      connect: never,
      loadDraft: async () => ({
        kind: "captured",
        draft: draftWith(),
        pending: undefined,
      }),
      subscribe: noChanges,
    });

    expect(await findField("Front")).toHaveTextContent(
      "Paris is the capital of France.",
    );
    expect(screen.getByText("France — Example")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add card/i }),
    ).toBeInTheDocument();
  });

  // 5.4: a card silently missing its context is worse than one that says so.
  it("names what could not be captured", async () => {
    renderPanel({
      connect: never,
      loadDraft: async () => ({
        kind: "captured",
        draft: draftWith([
          {
            kind: "shadow-dom",
            message: "the selection is inside a shadow root",
          },
        ]),
        pending: undefined,
      }),
      subscribe: noChanges,
    });

    expect(
      await screen.findByText(/inside a shadow root/i),
    ).toBeInTheDocument();
  });

  it("reports a draft it could not read rather than staying blank", async () => {
    renderPanel({
      connect: never,
      loadDraft: async () => ({
        kind: "unavailable",
        reason: "no-receiver: nothing is listening",
      }),
      subscribe: noChanges,
    });

    expect(await screen.findByText(/nothing is listening/)).toBeInTheDocument();
  });
});

// Firefox's sidebar persists per window, so after the first card the panel is
// already open when the next capture happens. Reading once on mount would
// leave it showing the previous card — or nothing at all.
describe("a capture while the panel is open", () => {
  it("re-reads the draft when one is stored", async () => {
    let notify = () => {};
    let status: DraftStatus = { kind: "empty" };

    renderPanel({
      connect: never,
      loadDraft: async () => status,
      subscribe: (onChange: () => void) => {
        notify = onChange;
        return () => {};
      },
    });
    expect(
      await screen.findByText(/select some text.*create anki card/i),
    ).toBeInTheDocument();

    status = { kind: "captured", draft: draftWith(), pending: undefined };
    notify();

    expect(await findField("Front")).toHaveTextContent(
      "Paris is the capital of France.",
    );
  });

  it("stops watching once it is unmounted", () => {
    const dispose = vi.fn();

    const { unmount } = renderPanel({
      connect: never,
      loadDraft: noDraft,
      subscribe: () => dispose,
    });
    unmount();

    expect(dispose).toHaveBeenCalled();
  });
});

function otherDraft() {
  return createDraft({
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
}

/**
 * 7.4. Two cards cannot be edited at once, and the one already open may carry
 * work — so the newer selection waits and the user says which they meant.
 */
describe("a second selection while a card is open", () => {
  function panelWithPending() {
    const captured = draftWith();
    const waiting = otherDraft();
    let status: DraftStatus = {
      kind: "captured",
      draft: captured,
      pending: waiting,
    };
    let notify = () => {};

    const rendered = renderPanel({
      connect: never,
      loadDraft: async () => status,
      subscribe: (onChange: () => void) => {
        notify = onChange;
        return () => {};
      },
    });

    // What the store actually holds, so the panel's own writes are visible.
    void rendered.drafts.save(captured);
    void rendered.pending.save(waiting);

    return {
      ...rendered,
      captured,
      waiting,
      reread: async () => {
        const [inFlight, behind] = await Promise.all([
          rendered.drafts.load(),
          rendered.pending.load(),
        ]);
        status =
          inFlight.ok && inFlight.value !== undefined
            ? {
                kind: "captured",
                draft: inFlight.value,
                pending: behind.ok ? behind.value : undefined,
              }
            : { kind: "empty" };
        notify();
      },
    };
  }

  it("asks rather than replacing what is open", async () => {
    panelWithPending();

    expect(
      await screen.findByText(/newer selection is waiting/i),
    ).toBeInTheDocument();
    expect(fieldOf("Front")).toHaveTextContent(
      "Paris is the capital of France.",
    );
  });

  it("opens the newer selection when the user says so", async () => {
    const { drafts, pending, reread } = panelWithPending();
    await screen.findByText(/newer selection is waiting/i);

    await fireEvent.click(
      screen.getByRole("button", { name: /use the new selection/i }),
    );
    await reread();

    expect(await findField("Front")).toHaveTextContent(
      "Berlin is the capital of Germany.",
    );
    const stored = await drafts.load();
    expect(stored.ok && stored.value?.source.title).toBe("Germany — Example");
    await expect(pending.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("keeps the card that is open when the user declines", async () => {
    const { drafts, pending, reread } = panelWithPending();
    await screen.findByText(/newer selection is waiting/i);

    await fireEvent.click(
      screen.getByRole("button", { name: /keep this card/i }),
    );
    await reread();

    expect(fieldOf("Front")).toHaveTextContent(
      "Paris is the capital of France.",
    );
    const stored = await drafts.load();
    expect(stored.ok && stored.value?.source.title).toBe("France — Example");
    await expect(pending.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(screen.queryByText(/newer selection is waiting/i)).toBeNull();
  });
});

/** 7.3: the card is in Anki, the slot is handed over, and the panel says so. */
describe("after the card has been added", () => {
  it("confirms in the panel rather than falling back to the first-run text", async () => {
    let status: DraftStatus = {
      kind: "captured",
      draft: draftWith(),
      pending: undefined,
    };
    let notify = () => {};
    const { drafts } = renderPanel({
      connect: never,
      loadDraft: async () => status,
      subscribe: (onChange: () => void) => {
        notify = onChange;
        return () => {};
      },
    });
    await drafts.save(draftWith());
    await findField("Front");

    await fireEvent.click(screen.getByRole("button", { name: /add card/i }));
    await vi.waitFor(async () => {
      const stored = await drafts.load();
      expect(stored.ok && stored.value).toBeUndefined();
    });
    status = { kind: "empty" };
    notify();

    await vi.waitFor(() =>
      expect(screen.getByText(/added to anki/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("textbox", { name: "Front" })).toBeNull();
  });

  it("opens the selection that was waiting behind it", async () => {
    const waiting = otherDraft();
    let status: DraftStatus = {
      kind: "captured",
      draft: draftWith(),
      pending: waiting,
    };
    let notify = () => {};
    const { drafts, pending } = renderPanel({
      connect: never,
      loadDraft: async () => status,
      subscribe: (onChange: () => void) => {
        notify = onChange;
        return () => {};
      },
    });
    await drafts.save(draftWith());
    await pending.save(waiting);
    await findField("Front");

    await fireEvent.click(screen.getByRole("button", { name: /add card/i }));
    await vi.waitFor(async () => {
      const behind = await pending.load();
      expect(behind.ok && behind.value).toBeUndefined();
    });
    const stored = await drafts.load();
    status =
      stored.ok && stored.value !== undefined
        ? { kind: "captured", draft: stored.value, pending: undefined }
        : { kind: "empty" };
    notify();

    await vi.waitFor(() =>
      expect(fieldOf("Front")).toHaveTextContent(
        "Berlin is the capital of Germany.",
      ),
    );
  });
});

/**
 * The panel re-reads on every storage change, including the ones the editor
 * itself causes by saving an edit (7.1). Remounting the editor on those would
 * throw away the caret, the cloze selection, and anything typed since.
 */
describe("re-reading while the user is editing", () => {
  it("does not remount the editor for the same capture", async () => {
    let status: DraftStatus = {
      kind: "captured",
      draft: draftWith(),
      pending: undefined,
    };
    let notify = () => {};
    renderPanel({
      connect: never,
      loadDraft: async () => status,
      subscribe: (onChange: () => void) => {
        notify = onChange;
        return () => {};
      },
    });
    await findField("Front");

    await typeInto("Back", "Paris");
    // The same capture, read back from the store as the editor last wrote it.
    status = { kind: "captured", draft: draftWith(), pending: undefined };
    notify();

    expect(await findField("Back")).toHaveTextContent("Paris");
  });

  it("remounts for a capture that is a different one", async () => {
    let status: DraftStatus = {
      kind: "captured",
      draft: draftWith(),
      pending: undefined,
    };
    let notify = () => {};
    renderPanel({
      connect: never,
      loadDraft: async () => status,
      subscribe: (onChange: () => void) => {
        notify = onChange;
        return () => {};
      },
    });
    await findField("Front");

    status = { kind: "captured", draft: otherDraft(), pending: undefined };
    notify();

    await vi.waitFor(() =>
      expect(fieldOf("Front")).toHaveTextContent(
        "Berlin is the capital of Germany.",
      ),
    );
  });
});

/** M8. Settings are reachable from the panel, and the deck used is noted. */
// The ask has to be made from a click, and the click is on a button inside
// the editor — so the panel's job is to carry the capability down to it.
describe("granting the Anki host permission", () => {
  it("hands the editor a way to ask for it", async () => {
    const failing = createFakeAnkiClient({
      decks: ["Geography"],
      noteTypes: [BASIC],
    });
    failing.failWith({
      kind: "permission-missing",
      message: "no host permission for http://127.0.0.1:8765",
    });

    renderPanel({
      connect: async () => ({ kind: "connected", from: "background" }),
      loadDraft: async () => ({
        kind: "captured",
        draft: draftWith(),
        pending: undefined,
      }),
      subscribe: noChanges,
      anki: failing,
      grantAccess: async () => true,
    });

    expect(
      await screen.findByRole("button", { name: /allow access to anki/i }),
    ).toBeInTheDocument();
  });
});

describe("settings, from the panel", () => {
  it("offers a way into the settings", async () => {
    const openSettings = vi.fn();
    renderPanel({
      connect: never,
      loadDraft: noDraft,
      subscribe: noChanges,
      openSettings,
    });

    await fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(openSettings).toHaveBeenCalled();
  });

  it("offers no settings button when there is no page to open", () => {
    renderPanel({ connect: never, loadDraft: noDraft, subscribe: noChanges });

    expect(screen.queryByRole("button", { name: /settings/i })).toBeNull();
  });

  // Test 8 of the M8 plan: the deck the card went into is what the next
  // capture starts from (8.5).
  it("remembers the deck a card was added to", async () => {
    const { drafts, remembered } = renderPanel({
      connect: never,
      loadDraft: async () => ({
        kind: "captured",
        draft: draftWith(),
        pending: undefined,
      }),
      subscribe: noChanges,
    });
    await drafts.save(draftWith());
    await findField("Front");

    await fireEvent.click(screen.getByRole("button", { name: /add card/i }));

    await vi.waitFor(async () => {
      const stored = await remembered.load();
      expect(stored.ok && stored.value.lastDeck).toBe("Geography");
    });
  });

  it("remembers nothing when the card was only discarded", async () => {
    const { drafts, remembered } = renderPanel({
      connect: never,
      loadDraft: async () => ({
        kind: "captured",
        draft: draftWith(),
        pending: undefined,
      }),
      subscribe: noChanges,
    });
    await drafts.save(draftWith());
    await findField("Front");

    await fireEvent.click(
      screen.getByRole("button", { name: /discard card/i }),
    );

    const stored = await remembered.load();
    expect(stored.ok && stored.value.lastDeck).toBeUndefined();
  });
});
