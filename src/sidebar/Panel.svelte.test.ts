import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import type { CaptureWarning } from "@/core/capture";
import { createDraft } from "@/core/draft";
import { BASIC } from "@/fixtures/note-types";

import Panel from "./Panel.svelte";
import type { DraftStatus, SidebarStatus } from "./connect";

const never = () => new Promise<SidebarStatus>(() => {});
const noDraft = async (): Promise<DraftStatus> => ({ kind: "empty" });

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
    render(Panel, { connect: never, loadDraft: noDraft });

    expect(
      screen.getByRole("heading", { name: "Anklipper" }),
    ).toBeInTheDocument();
  });

  it("says it is connecting while the background has not answered", () => {
    render(Panel, { connect: never, loadDraft: noDraft });

    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
  });

  it("reports the context that answered once it has", async () => {
    render(Panel, {
      connect: async () => ({ kind: "connected", from: "background" }),
      loadDraft: noDraft,
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/background/i);
  });

  it("reports an unreachable background rather than staying blank", async () => {
    render(Panel, {
      connect: async () => ({ kind: "unavailable", reason: "no-receiver" }),
      loadDraft: noDraft,
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/no-receiver/);
  });
});

describe("the captured draft", () => {
  it("says nothing has been captured yet", async () => {
    render(Panel, { connect: never, loadDraft: noDraft });

    expect(
      await screen.findByText(/select some text.*create anki card/i),
    ).toBeInTheDocument();
  });

  it("shows the captured text and where it came from", async () => {
    render(Panel, {
      connect: never,
      loadDraft: async () => ({ kind: "captured", draft: draftWith() }),
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
    });

    expect(await screen.findByText(/nothing is listening/)).toBeInTheDocument();
  });
});
