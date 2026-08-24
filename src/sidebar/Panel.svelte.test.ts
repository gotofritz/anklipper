import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import type { CaptureWarning } from "@/core/capture";
import { createDraft } from "@/core/draft";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { BASIC } from "@/fixtures/note-types";

import Panel from "./Panel.svelte";
import type { DraftStatus, SidebarStatus } from "./connect";

const never = () => new Promise<SidebarStatus>(() => {});
const noDraft = async (): Promise<DraftStatus> => ({ kind: "empty" });
/** No capture happens while the panel is mounted, in most of these cases. */
const noChanges = () => () => {};

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

describe("sidebar panel", () => {
  it("names the extension", () => {
    render(Panel, { connect: never, loadDraft: noDraft, subscribe: noChanges });

    expect(
      screen.getByRole("heading", { name: "Anklipper" }),
    ).toBeInTheDocument();
  });

  it("says it is connecting while the background has not answered", () => {
    render(Panel, { connect: never, loadDraft: noDraft, subscribe: noChanges });

    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
  });

  it("reports the context that answered once it has", async () => {
    render(Panel, {
      connect: async () => ({ kind: "connected", from: "background" }),
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/background/i);
  });

  it("reports an unreachable background rather than staying blank", async () => {
    render(Panel, {
      connect: async () => ({ kind: "unavailable", reason: "no-receiver" }),
      loadDraft: noDraft,
      subscribe: noChanges,
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/no-receiver/);
  });
});

describe("the captured draft", () => {
  it("says nothing has been captured yet", async () => {
    render(Panel, { connect: never, loadDraft: noDraft, subscribe: noChanges });

    expect(
      await screen.findByText(/select some text.*create anki card/i),
    ).toBeInTheDocument();
  });

  it("shows the captured text and where it came from", async () => {
    render(Panel, {
      connect: never,
      loadDraft: async () => ({ kind: "captured", draft: draftWith() }),
      subscribe: noChanges,
    });

    expect(
      await screen.findByText("Paris is the capital of France."),
    ).toBeInTheDocument();
    expect(screen.getByText("France — Example")).toBeInTheDocument();
  });

  // 5.4: a card silently missing its context is worse than one that says so.
  it("names what could not be captured", async () => {
    render(Panel, {
      connect: never,
      loadDraft: async () => ({
        kind: "captured",
        draft: draftWith([
          {
            kind: "shadow-dom",
            message: "the selection is inside a shadow root",
          },
        ]),
      }),
      subscribe: noChanges,
    });

    expect(
      await screen.findByText(/inside a shadow root/i),
    ).toBeInTheDocument();
  });

  it("reports a draft it could not read rather than staying blank", async () => {
    render(Panel, {
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

    render(Panel, {
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

    status = { kind: "captured", draft: draftWith() };
    notify();

    expect(
      await screen.findByText("Paris is the capital of France."),
    ).toBeInTheDocument();
  });

  it("stops watching once it is unmounted", () => {
    const dispose = vi.fn();

    const { unmount } = render(Panel, {
      connect: never,
      loadDraft: noDraft,
      subscribe: () => dispose,
    });
    unmount();

    expect(dispose).toHaveBeenCalled();
  });
});

// M6's editor is the panel's job once there is an `AnkiClient` to build it
// against. Until M7 wires the adapter in, a panel without one keeps showing
// what M5 captured rather than pretending to be able to add anything.
describe("the card editor", () => {
  it("edits the captured draft when a client is available", async () => {
    render(Panel, {
      connect: never,
      loadDraft: async () => ({ kind: "captured", draft: draftWith() }),
      subscribe: noChanges,
      anki: createFakeAnkiClient({ decks: ["Geography"], noteTypes: [BASIC] }),
    });

    expect(await screen.findByLabelText("Front")).toHaveValue(
      "Paris is the capital of France.",
    );
    expect(
      screen.getByRole("button", { name: /add card/i }),
    ).toBeInTheDocument();
  });

  it("shows the capture on its own when there is no client yet", async () => {
    render(Panel, {
      connect: never,
      loadDraft: async () => ({ kind: "captured", draft: draftWith() }),
      subscribe: noChanges,
    });

    expect(
      await screen.findByText("Paris is the capital of France."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add card/i }),
    ).not.toBeInTheDocument();
  });
});
