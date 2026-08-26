import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import { resolveDefaults } from "@/background/defaults";
import { startBackground, CAPTURE_MENU_ITEM } from "@/background/start";
import type { PageCapture } from "@/core/capture";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import type { AnkiError } from "@/core/ports/types";
import { startContent } from "@/content/start";
import { BASIC, CLOZE, RECIPE, VOCAB } from "@/fixtures/note-types";
import { createMessenger } from "@/messaging/messenger";
import type { ContextMenuClick } from "@/platform/context-menus";
import {
  PENDING_KEY,
  createStoredDrafts,
  watchDraft,
} from "@/platform/draft-store";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";
import { ok } from "@/core/result";
import { DEFAULT_SETTINGS } from "@/core/settings";
import type { Settings } from "@/core/settings";
import { createStoredRemembered } from "@/platform/remembered-store";
import { SETTINGS_KEY, createStoredSettings } from "@/platform/settings-store";
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

/** A second selection on the same page, for M9's repeat-capture flow. */
const SAME_PAGE_SELECTION: PageCapture = {
  ...SELECTION,
  text: "Lyon is the third largest city in France.",
  html: "Lyon is the third largest city in France.",
  context: "Lyon is the third largest city in France.",
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
  // M8, over the same real `StoragePort` as the drafts: what the user
  // configured, and what the extension noticed.
  const settings = createStoredSettings(storage);
  const remembered = createStoredRemembered(storage);
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
      defaults: () => resolveDefaults({ settings, remembered }),
      now: () => new Date(Date.UTC(2026, 0, 1, 12, 0, captures)),
    });
  }

  return {
    anki,
    drafts,
    pending,
    settings,
    remembered,
    storage,

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
        remembered,
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

async function type(name: string, html: string) {
  const node = fieldOf(name);
  node.innerHTML = html;
  await fireEvent.input(node);
}

/** Select a run of a field's text the way a user's drag would. */
async function select(name: string, text: string) {
  const node = fieldOf(name);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let holder = walker.nextNode();
  while (holder !== null && (holder as Text).data.indexOf(text) === -1) {
    holder = walker.nextNode();
  }
  if (holder === null) throw new Error(`no text node holds ${text}`);

  const at = (holder as Text).data.indexOf(text);
  const range = document.createRange();
  range.setStart(holder, at);
  range.setEnd(holder, at + text.length);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  // The editor caches what a field reports rather than asking for it after a
  // toolbar button has taken the focus, so the selection has to be announced.
  await fireEvent.keyUp(node);
}

async function mark(name: string, text: string) {
  await select(name, text);
  await fireEvent.click(
    screen.getByRole("button", { name: /mark selection/i }),
  );
}

describe("1. selection to a card in Anki", () => {
  it("captures, edits, and adds", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();

    expect(await findField("Front")).toHaveTextContent(
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
    await findField("Text");
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
    expect(fieldOf("Back")).toHaveTextContent("Paris");
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

    expect(await findField("Back")).toHaveTextContent("Paris");
    expect(fieldOf("Front")).toHaveTextContent(
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
    expect(fieldOf("Front")).toHaveTextContent(
      "Paris is the capital of France.",
    );
    expect(fieldOf("Back")).toHaveTextContent("Paris");
  });

  it("opens the newer one when that is what the user meant", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });
    // Typed inside the save debounce, so an edit to the card being replaced
    // is still outstanding when the slot changes hands. Flushing it then —
    // the editor is unmounted, which is when a flush happens — would put the
    // replaced card back over the one the user chose.
    await type("Back", "Paris");

    await app.capture(SECOND_SELECTION);
    await screen.findByText(/newer selection is waiting/i);
    await fireEvent.click(
      screen.getByRole("button", { name: /use the new selection/i }),
    );

    await vi.waitFor(() =>
      expect(fieldOf("Front")).toHaveTextContent(
        "Berlin is the capital of Germany.",
      ),
    );
    const stored = await app.drafts.load();
    expect(stored.ok && stored.value?.source.title).toBe("Germany — Example");
    expect(fieldOf("Back").textContent).toBe("");
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

    expect(await findField("Front")).toHaveTextContent(
      "Paris is the capital of France.",
    );
  });
});

/**
 * M8, end to end: what the user configured reaches a card, what the extension
 * remembers reaches the next one, and neither can stop a capture.
 */
describe("8. settings, remembered state, and a capture", () => {
  async function configure(
    app: ReturnType<typeof extension>,
    settings: Partial<Settings>,
  ) {
    const saved = await app.settings.save({ ...DEFAULT_SETTINGS, ...settings });
    expect(saved.ok).toBe(true);
  }

  // Test 7 of the M8 plan.
  it("starts a new card on the configured deck, note type, and tags", async () => {
    const app = extension();
    await configure(app, {
      defaultDeck: "Geography",
      defaultNoteType: VOCAB,
      defaultTags: ["reading"],
    });

    await app.capture();
    app.openSidebar();

    expect(await screen.findByLabelText("Example")).toBeInTheDocument();
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    expect(app.anki.added[0]?.deck).toBe("Geography");
    expect(app.anki.added[0]?.noteType.name).toBe("Vocab");
    expect(app.anki.added[0]?.tags).toEqual(["reading"]);
  });

  // Test 9.
  it("puts the source URL in the field the settings map it to", async () => {
    const app = extension();
    await configure(app, {
      fieldMapping: { sourceUrl: "Back", sourceTitle: "" },
    });

    await app.capture();
    app.openSidebar();

    expect(await findField("Back")).toHaveTextContent(
      "https://example.test/france",
    );
  });

  // Test 8. Remembered, not configured: a reset leaves it alone (8.5).
  it("starts the next card on the deck the last one went into, even after a reset", async () => {
    const app = extension();
    await configure(app, { defaultDeck: "Default" });

    await app.capture();
    const first = app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });
    await fireEvent.change(screen.getByLabelText("Deck"), {
      target: { value: "Geography" },
    });
    await type("Back", "Paris");
    await addCard();
    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    first.unmount();

    const reset = await app.settings.reset();
    expect(reset.ok).toBe(true);

    await app.capture(SECOND_SELECTION);
    app.openSidebar();

    expect(await findField("Front")).toHaveTextContent(
      "Berlin is the capital of Germany.",
    );
    expect(screen.getByLabelText("Deck")).toHaveValue("Geography");
  });

  // 8.2, asserted rather than assumed: this is the case that would otherwise
  // brick the extension for the one user it happened to.
  it("still captures and adds when the stored settings are unreadable", async () => {
    const app = extension();
    await app.storage.set(SETTINGS_KEY, "wiped by something else");

    await app.capture();
    app.openSidebar();

    expect(await findField("Front")).toHaveTextContent(
      "Paris is the capital of France.",
    );
    await type("Back", "Paris");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    expect(app.anki.added[0]?.deck).toBe("Default");
  });

  // Settings survive a browser restart — which for the background is being
  // unloaded when idle and started again, and holds nothing in module scope.
  it("keeps settings across a background restart", async () => {
    const app = extension();
    await configure(app, { defaultDeck: "Geography" });

    app.restartBackground();
    await app.capture();
    app.openSidebar();

    expect(await findField("Front")).toBeInTheDocument();
    expect(screen.getByLabelText("Deck")).toHaveValue("Geography");
  });
});

/**
 * M10, end to end: the milestone's done-when is a real note type — not the
 * built-in Basic — rendering and submitting correctly, and a card that is
 * indistinguishable in Anki from one typed into Anki's own editor.
 */
describe("9. the editor at Anki's own shape", () => {
  function withRecipe() {
    return extension({
      anki: createFakeAnkiClient({
        decks: ["Default", "Geography"],
        noteTypes: [BASIC, RECIPE, CLOZE],
        tags: ["cooking", "geo::capitals"],
      }),
    });
  }

  async function chooseRecipe() {
    await screen.findByRole("option", { name: "Recipe" });
    await fireEvent.change(screen.getByLabelText(/^note type$/i), {
      target: { value: "Recipe" },
    });
    await findField("Ingredients");
  }

  // 10.1: the collection's order, which is not the alphabetical one.
  it("renders a real note type's fields in the collection's own order", async () => {
    const app = withRecipe();
    await app.capture();
    app.openSidebar();
    await chooseRecipe();

    // The fields themselves, not the landing area above them, which is a
    // textbox too and belongs to no note type.
    expect(
      [...document.querySelectorAll("[data-field]")].map((one) =>
        one.getAttribute("data-field"),
      ),
    ).toEqual(["Title", "Ingredients", "Method", "Applies to"]);
  });

  it("submits every field of it", async () => {
    const app = withRecipe();
    await app.capture();
    app.openSidebar();
    await chooseRecipe();

    await type("Title", "Bouillabaisse");
    await type("Ingredients", "Fish<br>Saffron");
    await type("Method", "Simmer.");
    await type("Applies to", "Marseille");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    expect(app.anki.added[0]?.fields).toEqual({
      Title: "Bouillabaisse",
      Ingredients: "Fish<br>Saffron",
      Method: "Simmer.",
      "Applies to": "Marseille",
    });
  });

  // 10.2: what reaches Anki is the markup Anki's own editor would have
  // written, which is the whole point of the rich field.
  it("sends the formatting the user applied", async () => {
    const app = withRecipe();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });

    await select("Front", "Paris");
    await fireEvent.click(screen.getByRole("button", { name: /^bold/i }));
    await type("Back", "Paris");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    expect(app.anki.added[0]?.fields["Front"]).toBe(
      "<b>Paris</b> is the capital of France.",
    );
  });

  // 10.9: the collection's own tags, offered for completion.
  it("offers the tags the collection already holds", async () => {
    const app = withRecipe();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });

    expect(
      await screen.findByRole("option", {
        name: "geo::capitals",
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  // 10.6, the milestone's test 6, across two captures and the store between
  // them: this is what makes several cards off one page fast.
  it("carries a pinned field to the next card, and an unpinned one not at all", async () => {
    const app = withRecipe();
    await app.capture();
    const first = app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });

    await type("Back", "Source: example.test");
    await fireEvent.click(screen.getByRole("button", { name: /pin back/i }));
    await addCard();
    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    first.unmount();

    await app.capture(SECOND_SELECTION);
    app.openSidebar();

    expect(await findField("Front")).toHaveTextContent(
      "Berlin is the capital of Germany.",
    );
    await vi.waitFor(() =>
      expect(fieldOf("Back")).toHaveTextContent("Source: example.test"),
    );
  });

  it("carries nothing when the field was never pinned", async () => {
    const app = withRecipe();
    await app.capture();
    const first = app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });

    await type("Back", "Source: example.test");
    await addCard();
    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    first.unmount();

    await app.capture(SECOND_SELECTION);
    app.openSidebar();

    await findField("Front");
    expect(fieldOf("Back").textContent).toBe("");
  });
});

/**
 * 10a: the landing area, end to end. The reported failure was that changing
 * note type made the selected text disappear — 3.2 stashing every field of a
 * note type the next one shares no name with, silently.
 */
describe("10. the landing area survives the note type", () => {
  function landing() {
    return screen.getByLabelText(/selected text/i) as HTMLTextAreaElement;
  }

  async function chooseNoteType(name: string) {
    await screen.findByRole("option", { name });
    await fireEvent.change(screen.getByLabelText(/^note type$/i), {
      target: { value: name },
    });
  }

  async function sendTo(field: string, text?: string) {
    if (text !== undefined) {
      const at = landing().value.indexOf(text);
      landing().setSelectionRange(at, at + text.length);
    }
    await fireEvent.change(screen.getByLabelText(/send to/i), {
      target: { value: field },
    });
    // The fields these tests send into are empty, so replacing is the only
    // one of the two offered — adding to an empty field is replacing it.
    await fireEvent.click(
      screen.getByRole("button", { name: "Replace field" }),
    );
  }

  it("holds the capture from the moment the sidebar opens", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await findField("Front");

    expect(landing()).toHaveValue("Paris is the capital of France.");
  });

  it("keeps the text through a note-type change, and fills the new fields from it", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await findField("Front");

    await chooseNoteType("Vocab");

    // 3.2 carried `Front` because both note types have one, and stashed
    // `Back`. What matters is that the box below is untouched either way.
    expect(landing()).toHaveValue("Paris is the capital of France.");

    await sendTo("Example", "Paris");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    expect(app.anki.added[0]?.noteType.name).toBe("Vocab");
    expect(app.anki.added[0]?.fields["Example"]).toBe("Paris");
  });

  it("still has it after a switch to a note type sharing no field name", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await findField("Front");

    await chooseNoteType("Cloze");

    expect(fieldOf("Text").textContent).toBe("");
    expect(landing()).toHaveValue("Paris is the capital of France.");

    await sendTo("Text");
    await mark("Text", "Paris");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));
    expect(app.anki.added[0]?.fields["Text"]).toBe(
      "{{c1::Paris}} is the capital of France.",
    );
  });

  it("survives the sidebar being closed and opened again (7.1)", async () => {
    const app = extension();
    await app.capture();
    const first = app.openSidebar();
    await findField("Front");

    await fireEvent.input(landing(), {
      target: { value: "Paris is in France." },
    });
    await vi.waitFor(async () => {
      const stored = await app.drafts.load();
      expect(stored.ok && stored.value?.scratch).toBe("Paris is in France.");
    });
    first.unmount();

    app.openSidebar();
    await findField("Front");

    expect(landing()).toHaveValue("Paris is in France.");
  });
});

/**
 * M9's tests 5 and 6. The point is the sidebar staying where it is: Firefox
 * keeps it per window (P2), so a user making a set of cards from one article
 * never closes it, and anything that needed reopening would be felt on every
 * card after the first.
 */
describe("11. the panel after a card has landed", () => {
  it("returns to ready, with the deck the card went into retained", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });
    await fireEvent.change(screen.getByLabelText("Deck"), {
      target: { value: "Geography" },
    });

    await addCard();

    await vi.waitFor(() =>
      expect(screen.getByText(/added to anki/i)).toBeInTheDocument(),
    );
    // Ready for the next one: nothing half-added is left in the way.
    expect(screen.queryByRole("textbox", { name: "Front" })).toBeNull();
    const remembered = await app.remembered.load();
    expect(remembered.ok && remembered.value.lastDeck).toBe("Geography");
  });
});

describe("12. several cards from one page", () => {
  it("takes the next selection into the sidebar that is already open", async () => {
    const app = extension();
    await app.capture();
    app.openSidebar();
    await screen.findByRole("option", { name: "Geography" });
    await fireEvent.change(screen.getByLabelText("Deck"), {
      target: { value: "Geography" },
    });
    await type("Back", "Paris");
    await addCard();
    await vi.waitFor(() => expect(app.anki.added).toHaveLength(1));

    // No unmount, no re-navigation: the same panel, a second gesture.
    await app.capture(SAME_PAGE_SELECTION);

    expect(await findField("Front")).toHaveTextContent(
      "Lyon is the third largest city in France.",
    );
    // 8.5 carried into the second card: the deck the first one went into.
    expect(screen.getByLabelText("Deck")).toHaveValue("Geography");

    await type("Back", "Lyon");
    await addCard();

    await vi.waitFor(() => expect(app.anki.added).toHaveLength(2));
    expect(app.anki.added.map((card) => card.source.url)).toEqual([
      SELECTION.url,
      SELECTION.url,
    ]);
  });
});
