import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import { startBackground, CAPTURE_MENU_ITEM } from "@/background/start";
import type { PageCapture } from "@/core/capture";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import type { AnkiError } from "@/core/ports/types";
import { startContent } from "@/content/start";
import { BASIC, CLOZE, VOCAB } from "@/fixtures/note-types";
import { createMessenger } from "@/messaging/messenger";
import type { ContextMenuClick } from "@/platform/context-menus";
import {
  PENDING_KEY,
  createStoredDrafts,
  watchDraft,
} from "@/platform/draft-store";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";
import { ok } from "@/core/result";
import { createStorage } from "@/platform/storage";
import Panel from "@/sidebar/Panel.svelte";
import { loadDraft, pingBackground } from "@/sidebar/connect";

/**
 * M7's headline test: the whole extension, end to end, with only AnkiConnect
 * mocked.
 *
 * Everything else is the real thing — the real context-menu path, the real
 * content-script reply, the real generation, the real `DraftStore` over the
 * real `StoragePort` (the fake browser's storage), the real message channel,
 * and the real panel. What is stubbed is the browser API surface that has no
 * fake — menus, commands, injection, the sidebar — and the `AnkiClient`,
 * which is M3's in-memory fake: an automated test may not require a running
 * Anki.
 */

const TAB = 7;

const SELECTION: PageCapture = {
  text: "Paris is the capital of France.",
  html: "<b>Paris</b> is the capital of France.",
  context: "France is a country in Europe. Paris is the capital of France.",
  heading: "France",
  title: "France — Example",
  url: "https://example.test/france",
  warnings: [],
};

const SECOND_SELECTION: PageCapture = {
  ...SELECTION,
  text: "Berlin is the capital of Germany.",
  html: "Berlin is the capital of Germany.",
  context: "Berlin is the capital of Germany.",
  title: "Germany — Example",
  url: "https://example.test/germany",
};

/** The whole extension, wired the way the entrypoints wire it. */
function extension(
  options: { anki?: ReturnType<typeof createFakeAnkiClient> } = {},
) {
  const storage = createStorage();
  const drafts = createStoredDrafts(storage);
  const pending = createStoredDrafts(storage, PENDING_KEY);
  const transport = createFakeRuntimeMessaging();
  const messenger = createMessenger(transport);
  const anki =
    options.anki ??
    createFakeAnkiClient({
      decks: ["Default", "Geography"],
      noteTypes: [BASIC, VOCAB, CLOZE],
    });

  let page = SELECTION;
  // A real clock: two gestures are seconds apart, and `createdAt` is what
  // identifies one capture from the next.
  let captures = 0;
  const clicks: ((click: ContextMenuClick) => void)[] = [];

  // The content script, behind a tab id the way an injected one sits behind
  // one. `startContent` is the real handler; only the extraction is stubbed,
  // because jsdom has no selection to extract.
  startContent({
    messaging: {
      send: transport.send,
      sendToTab: transport.sendToTab,
      onMessage: (listener) => transport.connectTab(TAB, listener),
    },
    extract: () => page,
  });

  let stopBackground = start();

  function start() {
    return startBackground({
      messaging: transport,
      menus: {
        create: async () => {},
        removeAll: async () => {},
        onClicked: (listener) => {
          clicks.push(listener);
          return () => {};
        },
      },
      commands: { onCommand: () => () => {} },
      scripting: { inject: async () => ok(undefined) },
      sidebar: { open: async () => ok(undefined) },
      drafts,
      pending,
      now: () => new Date(Date.UTC(2026, 0, 1, 12, 0, captures)),
    });
  }

  return {
    anki,
    drafts,
    pending,

    /** The user selects text and chooses **Create Anki Card**. */
    async capture(selection: PageCapture = SELECTION): Promise<void> {
      page = selection;
      captures += 1;
      for (const click of clicks) {
        click({ menuItemId: CAPTURE_MENU_ITEM, tabId: TAB });
      }
      await vi.waitFor(async () => {
        const [inFlight, waiting] = await Promise.all([
          drafts.load(),
          pending.load(),
        ]);
        expect(
          (inFlight.ok && inFlight.value !== undefined) ||
            (waiting.ok && waiting.value !== undefined),
        ).toBe(true);
      });
    },

    /** The user opens the sidebar — or it was already open (P2). */
    openSidebar() {
      return render(Panel, {
        anki,
        drafts,
        pending,
        connect: () => pingBackground(messenger),
        loadDraft: () => loadDraft(messenger),
        subscribe: (onChange: () => void) => watchDraft(storage, onChange),
      });
    },

    /** Firefox's event page and Chrome's service worker are unloaded when idle. */
    restartBackground() {
      stopBackground();
      stopBackground = start();
    },
  };
}

async function addCard() {
  await fireEvent.click(screen.getByRole("button", { name: /add card/i }));
}

async function type(label: string, value: string) {
  await fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

/** Mark a range in a textarea the way a user's selection would. */
async function mark(label: string, text: string) {
  const field = screen.getByLabelText(label) as HTMLTextAreaElement;
  const at = field.value.indexOf(text);
  field.setSelectionRange(at, at + text.length);
  await fireEvent.click(
    screen.getByRole("button", { name: /mark selection/i }),
  );
}

describe("1. selection to a card in Anki", () => {
  it("captures, edits, and adds", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();

    expect(await screen.findByLabelText("Front")).toHaveValue(
      "Paris is the capital of France.",
    );
    await screen.findByRole("option", { name: "Geography" });
    await type("Back", "Paris");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    const note = app.anki.added[0];
    expect(note?.deck).toBe("Default");
    expect(note?.noteType.name).toBe("Basic");
    expect(note?.fields["Front"]).toBe("Paris is the capital of France.");
    expect(note?.fields["Back"]).toBe("Paris");
    // 3.6: provenance survives whatever the fields were edited into.
    expect(note?.source.url).toBe("https://example.test/france");
    expect(note?.source.heading).toBe("France");
  });
});

describe("1a. the same flow for a cloze card", () => {
  it("converts, marks two deletions, and adds the markup intact", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });

    await fireEvent.click(
      screen.getByRole("button", { name: /convert to cloze/i }),
    );
    await screen.findByLabelText("Text");
    await mark("Text", "Paris");
    await mark("Text", "France");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    const note = app.anki.added[0];
    expect(note?.noteType.name).toBe("Cloze");
    expect(note?.fields["Text"]).toBe(
      "{{c1::Paris}} is the capital of {{c2::France}}.",
    );
  });
});

describe("2. the draft is durable before anything renders it", () => {
  it("is in storage as soon as the capture finishes", async () => {
    const app = extension();

    await app.capture();

    const stored = await app.drafts.load();
    expect(stored.ok && stored.value?.fields["Front"]).toBe(
      "Paris is the capital of France.",
    );
  });
});

describe("3 to 4. an add that fails, and the retry that follows", () => {
  const unavailable: AnkiError = {
    kind: "anki-not-running",
    message: "nothing is listening on 127.0.0.1:8765",
  };

  it("keeps the draft, retries it unchanged, and clears it once it lands", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });
    await type("Back", "Paris");

    app.anki.failWith(unavailable);
    await addCard();
    expect(await screen.findByText(/anki is not running/i)).toBeInTheDocument();

    // 7.2: nothing to re-enter, and the draft is still where it was.
    expect(screen.getByLabelText("Back")).toHaveValue("Paris");
    await vi.waitFor(async () => {
      const stored = await app.drafts.load();
      expect(stored.ok && stored.value?.fields["Back"]).toBe("Paris");
    });

    // 7.5: the retry is the user's, not a queue's.
    app.anki.failWith(undefined);
    await fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    expect(app.anki.added[0]?.fields["Back"]).toBe("Paris");
    // 7.3: and the slot is empty again, so the next gesture takes it.
    await vi.waitFor(async () => {
      const stored = await app.drafts.load();
      expect(stored.ok && stored.value).toBeUndefined();
    });
  });
});

describe("5. reopening the sidebar", () => {
  it("restores the draft, including what was typed into it", async () => {
    const app = extension();
    await app.capture();
    const open = app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });
    await type("Back", "Paris");
    await vi.waitFor(async () => {
      const stored = await app.drafts.load();
      expect(stored.ok && stored.value?.fields["Back"]).toBe("Paris");
    });

    open.unmount();
    app.openSidebar();

    expect(await screen.findByLabelText("Back")).toHaveValue("Paris");
    expect(screen.getByLabelText("Front")).toHaveValue(
      "Paris is the capital of France.",
    );
  });
});

describe("6. a card that landed", () => {
  it("leaves nothing behind and says so", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });

    await addCard();

    await vi.waitFor(async () => {
      const stored = await app.drafts.load();
      expect(stored.ok && stored.value).toBeUndefined();
    });
    await vi.waitFor(() =>
      expect(screen.getByText(/added to anki/i)).toBeInTheDocument(),
    );
  });
});

describe("7. a second selection while the first is being edited", () => {
  it("asks, and declining keeps the card that is open", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });
    await type("Back", "Paris");

    await app.capture(SECOND_SELECTION);

    expect(
      await screen.findByText(/newer selection is waiting/i),
    ).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole("button", { name: /keep this card/i }),
    );

    await vi.waitFor(async () => {
      const waiting = await app.pending.load();
      expect(waiting.ok && waiting.value).toBeUndefined();
    });
    expect(screen.getByLabelText("Front")).toHaveValue(
      "Paris is the capital of France.",
    );
    expect(screen.getByLabelText("Back")).toHaveValue("Paris");
  });

  it("opens the newer one when that is what the user meant", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });

    await app.capture(SECOND_SELECTION);
    await screen.findByText(/newer selection is waiting/i);
    await fireEvent.click(
      screen.getByRole("button", { name: /use the new selection/i }),
    );

    await vi.waitFor(() =>
      expect(screen.getByLabelText("Front")).toHaveValue(
        "Berlin is the capital of Germany.",
      ),
    );
    const stored = await app.drafts.load();
    expect(stored.ok && stored.value?.source.title).toBe("Germany — Example");
  });
});

/**
 * 7.1's reason. Both browsers unload the background when idle, and it wakes up
 * again on the next message — with nothing in memory. A draft held anywhere
 * but storage would be gone without the user having done anything at all.
 */
describe("8. a background that was unloaded and started again", () => {
  it("still has the draft, and hands it to a sidebar opened afterwards", async () => {
    const app = extension();
    await app.capture();

    app.restartBackground();
    app.openSidebar();

    expect(await screen.findByLabelText("Front")).toHaveValue(
      "Paris is the capital of France.",
    );
  });
});
