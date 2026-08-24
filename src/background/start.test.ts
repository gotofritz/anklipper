import { describe, expect, it, vi } from "vitest";

import type { PageCapture } from "@/core/capture";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import { ok } from "@/core/result";
import { createMessenger } from "@/messaging/messenger";
import type { ContextMenuClick } from "@/platform/context-menus";
import type { CommandInvocation } from "@/platform/commands";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";

import type { CaptureReport } from "./capture";
import { CAPTURE_COMMAND, CAPTURE_MENU_ITEM, startBackground } from "./start";

const CAPTURE: PageCapture = {
  text: "Paris is the capital of France.",
  html: "",
  context: "France is a country in Europe.",
  heading: "France",
  title: "France — Example",
  url: "https://example.test/france",
  warnings: [],
};

function harness(overrides: Record<string, unknown> = {}) {
  const transport = createFakeRuntimeMessaging();
  transport.connectTab(7, async () => ok(CAPTURE));

  const clicks: ((click: ContextMenuClick) => void)[] = [];
  const commands: ((invocation: CommandInvocation) => void)[] = [];
  const menus = {
    created: [] as unknown[],
    create: vi.fn(async (item: unknown) => {
      menus.created.push(item);
    }),
    removeAll: vi.fn(async () => {}),
    onClicked: vi.fn((listener: (click: ContextMenuClick) => void) => {
      clicks.push(listener);
      return () => {};
    }),
  };

  const deps = {
    messaging: transport,
    menus,
    commands: {
      onCommand: vi.fn((listener: (invocation: CommandInvocation) => void) => {
        commands.push(listener);
        return () => {};
      }),
    },
    scripting: { inject: vi.fn(async () => ok(undefined)) },
    sidebar: { open: vi.fn(async () => ok(undefined)) },
    drafts: createFakeDraftStore(),
    now: () => new Date("2026-01-01T12:00:00.000Z"),
    ...overrides,
  };

  return { transport, deps, menus, clicks, commands };
}

describe("background", () => {
  it("answers a ping once it has started", async () => {
    const { transport, deps } = harness();
    startBackground(deps);

    await expect(
      createMessenger(transport).send({ type: "ping" }),
    ).resolves.toEqual({ ok: true, value: { from: "background" } });
  });

  it("does not answer before it has started", async () => {
    const transport = createFakeRuntimeMessaging();

    const reply = await createMessenger(transport).send({ type: "ping" });

    expect(reply.ok === false && reply.error.kind).toBe("no-receiver");
  });

  it("rejects a message it has no handler for, rather than dropping it", async () => {
    const { transport, deps } = harness();
    startBackground(deps);

    const reply = await transport.send({ type: "not-a-message" });

    expect(reply).toEqual({
      ok: true,
      value: {
        ok: false,
        error: {
          kind: "unknown-message",
          message: expect.stringContaining("not-a-message"),
        },
      },
    });
  });

  it("stops answering once it is stopped", async () => {
    const { transport, deps } = harness();

    startBackground(deps)();

    const reply = await createMessenger(transport).send({ type: "ping" });
    expect(reply.ok === false && reply.error.kind).toBe("no-receiver");
  });

  // The menu entry is shown only on a selection: the extension has nothing to
  // offer on a page the user has not selected anything on.
  it("registers one menu entry, on selections only", async () => {
    const { deps, menus } = harness();

    startBackground(deps);
    await vi.waitFor(() => expect(menus.created).toHaveLength(1));

    expect(menus.removeAll).toHaveBeenCalled();
    expect(menus.created[0]).toEqual({
      id: CAPTURE_MENU_ITEM,
      title: "Create Anki Card",
      contexts: ["selection"],
    });
  });

  it("captures when its own menu entry is clicked", async () => {
    const { deps, clicks } = harness();
    startBackground(deps);

    clicks.forEach((click) =>
      click({ menuItemId: CAPTURE_MENU_ITEM, tabId: 7 }),
    );

    await vi.waitFor(async () => {
      const stored = await deps.drafts.load();
      expect(stored.ok && stored.value?.fields.Front).toBe(
        "Paris is the capital of France.",
      );
    });
  });

  // Both browsers require `sidebar.open` inside the gesture's own task. The
  // capture module holds that line; this holds the wiring in front of it,
  // where an `await` would be easy to add and impossible to typecheck.
  it("opens the sidebar synchronously, inside the click", () => {
    const { deps, clicks } = harness();
    startBackground(deps);

    clicks.forEach((click) =>
      click({ menuItemId: CAPTURE_MENU_ITEM, tabId: 7 }),
    );

    expect(deps.sidebar.open).toHaveBeenCalledTimes(1);
  });

  it("ignores a click on somebody else's menu entry", async () => {
    const { deps, clicks } = harness();
    startBackground(deps);

    clicks.forEach((click) => click({ menuItemId: "someone-else", tabId: 7 }));

    await expect(deps.drafts.load()).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(deps.sidebar.open).not.toHaveBeenCalled();
  });

  it("captures on the keyboard shortcut too", async () => {
    const { deps, commands } = harness();
    startBackground(deps);

    commands.forEach((command) =>
      command({ command: CAPTURE_COMMAND, tabId: 7 }),
    );

    await vi.waitFor(async () => {
      const stored = await deps.drafts.load();
      expect(stored.ok && stored.value?.fields.Front).toBe(
        "Paris is the capital of France.",
      );
    });
  });

  it("hands the stored draft to the sidebar when it asks", async () => {
    const { transport, deps, clicks } = harness();
    startBackground(deps);
    clicks.forEach((click) =>
      click({ menuItemId: CAPTURE_MENU_ITEM, tabId: 7 }),
    );
    await vi.waitFor(async () => {
      const stored = await deps.drafts.load();
      expect(stored.ok && stored.value).toBeDefined();
    });

    const reply = await createMessenger(transport).send({ type: "get-draft" });

    expect(reply.ok && reply.value.draft?.source.title).toBe(
      "France — Example",
    );
  });

  it("tells the sidebar there is no draft yet rather than failing", async () => {
    const { transport, deps } = harness();
    startBackground(deps);

    const reply = await createMessenger(transport).send({ type: "get-draft" });

    expect(reply).toEqual({ ok: true, value: { draft: undefined } });
  });
});

// A capture that fails has nowhere else to surface: nothing is stored, so the
// panel shows the first-run message and the user is told nothing. Discarding
// the Result here is the silent-swallow the failure policy forbids.
describe("reporting what a capture did", () => {
  it("reports a capture that failed, and why", async () => {
    const reports: CaptureReport[] = [];
    const { deps, clicks } = harness({
      scripting: {
        inject: vi.fn(async () => ({
          ok: false as const,
          error: {
            kind: "not-injectable" as const,
            message: "cannot access about:reader",
          },
        })),
      },
      report: (report: CaptureReport) => reports.push(report),
    });
    // A tab with no content script, and a menu event carrying no text either.
    const transport = deps.messaging as ReturnType<
      typeof createFakeRuntimeMessaging
    >;
    transport.connectTab(7, async () => undefined);

    startBackground(deps);
    clicks.forEach((click) =>
      click({ menuItemId: CAPTURE_MENU_ITEM, tabId: 99 }),
    );

    await vi.waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0]?.outcome).toBe("failed");
    expect(reports[0]?.failure?.kind).toBe("nothing-captured");
  });

  it("reports a capture that worked", async () => {
    const reports: CaptureReport[] = [];
    const { deps, clicks } = harness({
      report: (report: CaptureReport) => reports.push(report),
    });
    startBackground(deps);

    clicks.forEach((click) =>
      click({ menuItemId: CAPTURE_MENU_ITEM, tabId: 7 }),
    );

    await vi.waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0]).toEqual({ outcome: "captured", warnings: [] });
  });

  it("captures fine with nobody listening for reports", async () => {
    const { deps, clicks } = harness();
    startBackground(deps);

    clicks.forEach((click) =>
      click({ menuItemId: CAPTURE_MENU_ITEM, tabId: 7 }),
    );

    await vi.waitFor(async () => {
      const stored = await deps.drafts.load();
      expect(stored.ok && stored.value).toBeDefined();
    });
  });
});
