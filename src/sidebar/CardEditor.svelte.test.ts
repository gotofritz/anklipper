import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import type { CaptureWarning } from "@/core/capture";
import { createDraft } from "@/core/draft";
import type { CardDraft } from "@/core/draft";
import type { NoteType } from "@/core/note-type";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import type { AnkiClient, AnkiError } from "@/core/ports/types";
import type { Result } from "@/core/result";
import { BASIC, CLOZE, VOCAB } from "@/fixtures/note-types";

import CardEditor from "./CardEditor.svelte";

function draftOf(
  noteType: NoteType,
  fields: Record<string, string>,
  warnings?: readonly CaptureWarning[],
) {
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
      heading: "Cities",
    },
    createdAt: "2026-01-01T12:00:00.000Z",
    generation: {
      name: "basic",
      version: 1,
      ...(warnings === undefined ? {} : { warnings }),
    },
  });
}

const BASIC_DRAFT = draftOf(BASIC, { Front: "Capital of France?" });
const CLOZE_DRAFT = draftOf(CLOZE, { Text: "Paris is the capital of France." });

function anki(options: Parameters<typeof createFakeAnkiClient>[0] = {}) {
  return createFakeAnkiClient({
    decks: ["Geography", "Default"],
    noteTypes: [BASIC, VOCAB, CLOZE],
    ...options,
  });
}

/** A client that has not answered yet — the loading state, held open. */
function pendingClient(): AnkiClient {
  const pending = <T>() => new Promise<T>(() => {});

  return {
    probe: () => pending(),
    deckNames: () => pending<Result<readonly string[], AnkiError>>(),
    noteTypes: () => pending<Result<readonly NoteType[], AnkiError>>(),
    canAddNote: () => pending<Result<boolean, AnkiError>>(),
    addNote: () => pending<Result<number, AnkiError>>(),
  };
}

function renderEditor(
  draft: CardDraft = BASIC_DRAFT,
  client: AnkiClient = anki(),
  overrides: Record<string, unknown> = {},
) {
  const onCancel = vi.fn();
  const drafts = createFakeDraftStore(draft);
  const rendered = render(CardEditor, {
    anki: client,
    draft,
    drafts,
    onCancel,
    ...overrides,
  });

  return { ...rendered, onCancel, drafts };
}

/** Everything the editor sent to Anki, for the fake only. */
function added(client: ReturnType<typeof anki>) {
  return client.added;
}

async function addCard() {
  await fireEvent.click(screen.getByRole("button", { name: /add card/i }));
}

/** Put a range in the textarea the way a user's selection would. */
function select(field: HTMLTextAreaElement, text: string) {
  const at = field.value.indexOf(text);
  field.setSelectionRange(at, at + text.length);
}

describe("1. what the editor shows", () => {
  it("renders the draft's fields, deck, note type, and tags", async () => {
    renderEditor();

    expect(screen.getByLabelText("Front")).toHaveValue("Capital of France?");
    expect(screen.getByLabelText("Back")).toHaveValue("");
    expect(screen.getByLabelText(/^deck$/i)).toHaveValue("Geography");
    expect(screen.getByLabelText(/^note type$/i)).toHaveValue("Basic");
    expect(await screen.findByText("europe")).toBeInTheDocument();
  });

  // 5.4: a card silently missing its context is worse than one that says so.
  it("names what the capture could not read", () => {
    renderEditor(
      draftOf(BASIC, { Front: "x" }, [
        {
          kind: "shadow-dom",
          message: "the selection is inside a shadow root",
        },
      ]),
    );

    expect(screen.getByText(/inside a shadow root/i)).toBeInTheDocument();
  });

  it("shows where the selection came from", () => {
    renderEditor();

    expect(screen.getByText("France — Example")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://example.test/france" }),
    ).toBeInTheDocument();
  });
});

describe("2. editing a field", () => {
  it("puts what was typed into the draft", async () => {
    const client = anki();
    renderEditor(BASIC_DRAFT, client);

    await fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "Paris" },
    });
    await addCard();

    expect(added(client)[0]?.fields["Back"]).toBe("Paris");
  });
});

describe("3 and 4. changing the note type", () => {
  it("re-renders the field set and keeps content the names share", async () => {
    renderEditor();
    await screen.findByRole("option", { name: "Vocab" });

    await fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "Paris" },
    });
    await fireEvent.change(screen.getByLabelText(/^note type$/i), {
      target: { value: "Vocab" },
    });

    expect(screen.getByLabelText("Front")).toHaveValue("Capital of France?");
    expect(screen.getByLabelText("Example")).toBeInTheDocument();
    expect(screen.queryByLabelText("Back")).not.toBeInTheDocument();
  });

  // 3.2: content the switch could not carry is stashed, never dropped.
  it("restores stashed content when the user switches back", async () => {
    renderEditor();
    await screen.findByRole("option", { name: "Vocab" });

    await fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "Paris" },
    });
    await fireEvent.change(screen.getByLabelText(/^note type$/i), {
      target: { value: "Vocab" },
    });
    await fireEvent.change(screen.getByLabelText(/^note type$/i), {
      target: { value: "Basic" },
    });

    expect(screen.getByLabelText("Back")).toHaveValue("Paris");
  });
});

describe("5 and 6. adding the card", () => {
  it("names the field that is wrong and sends nothing", async () => {
    const client = anki();
    renderEditor(draftOf(BASIC, { Front: "" }), client);

    await addCard();

    expect(screen.getByText(/front cannot be empty/i)).toBeInTheDocument();
    expect(added(client)).toEqual([]);
  });

  it("sends a valid draft once, and says it landed", async () => {
    const client = anki();
    renderEditor(BASIC_DRAFT, client);

    await addCard();

    expect(added(client)).toHaveLength(1);
    expect(added(client)[0]?.fields["Front"]).toBe("Capital of France?");
    expect(await screen.findByText(/added to anki/i)).toBeInTheDocument();
  });

  it("will not add the same card twice on a second press", async () => {
    const client = anki();
    renderEditor(BASIC_DRAFT, client);

    await addCard();
    await screen.findByText(/added to anki/i);

    expect(screen.getByRole("button", { name: /add card/i })).toBeDisabled();
    await addCard();
    expect(added(client)).toHaveLength(1);
  });

  it("discards without sending anything", async () => {
    const client = anki();
    const { onCancel } = renderEditor(BASIC_DRAFT, client);

    await fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(added(client)).toEqual([]);
  });

  // Discarding throws the card away, and the panel has no undo. A stray key
  // is not the way to ask for that, in the milestone whose whole subject is
  // not losing the user's work.
  it("does not discard on a stray Escape", async () => {
    const { onCancel } = renderEditor();

    await fireEvent.keyDown(screen.getByLabelText("Front"), {
      key: "Escape",
    });

    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("7. a port that refuses", () => {
  it("renders the cause and the next action, and leaves the draft editable", async () => {
    const client = anki();
    renderEditor(BASIC_DRAFT, client);
    await screen.findByRole("option", { name: "Default" });
    client.failWith({ kind: "unknown-deck", message: "deck was not found" });

    await addCard();

    expect(
      await screen.findByText(/anki has no deck by that name/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/pick a deck from the list/i)).toBeInTheDocument();

    const front = screen.getByLabelText("Front");
    expect(front).toHaveValue("Capital of France?");
    await fireEvent.input(front, { target: { value: "Capital of Spain?" } });
    expect(front).toHaveValue("Capital of Spain?");
  });

  // "Every M4 error cause has a rendered state" — no default "went wrong".
  it("says which of the three unavailable causes it is", async () => {
    const client = anki();
    renderEditor(BASIC_DRAFT, client);
    await screen.findByRole("option", { name: "Default" });
    client.failWith({ kind: "addon-missing", message: "not AnkiConnect" });

    await addCard();

    expect(await screen.findByText(/not AnkiConnect/i)).not.toBe(null);
    expect(
      screen.getByText(/install the ankiconnect add-on/i),
    ).toBeInTheDocument();
  });
});

describe("8. the deck and note-type lists", () => {
  it("says it is still asking Anki", () => {
    renderEditor(BASIC_DRAFT, pendingClient());

    expect(screen.getByText(/loading decks/i)).toBeInTheDocument();
    expect(screen.getByText(/loading note types/i)).toBeInTheDocument();
  });

  it("offers what Anki reported once it has answered", async () => {
    renderEditor();

    expect(
      await screen.findByRole("option", { name: "Default" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/loading decks/i)).not.toBeInTheDocument();
  });

  it("says why the lists are missing, and offers to try again", async () => {
    const client = anki();
    client.failWith({
      kind: "anki-not-running",
      message: "connection refused",
    });
    renderEditor(BASIC_DRAFT, client);

    expect(await screen.findByText(/anki is not running/i)).toBeInTheDocument();
    expect(screen.getByText(/start anki/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });
});

describe("9. duplicates", () => {
  // 4.4: a warning, never a block. The user may want the near-duplicate.
  it("warns without stopping the add", async () => {
    const client = anki({ duplicates: ["Capital of France?"] });
    renderEditor(BASIC_DRAFT, client);

    expect(
      await screen.findByText(
        /already has a note whose first field is this one/i,
      ),
    ).toBeInTheDocument();

    await addCard();
    expect(added(client)).toHaveLength(1);
  });
});

describe("10. reachable and labelled", () => {
  it("gives every control an accessible name and leaves it in the tab order", async () => {
    const { container } = renderEditor(CLOZE_DRAFT);
    await screen.findByRole("option", { name: "Default" });

    const controls = container.querySelectorAll(
      "input, select, textarea, button, a[href], summary",
    );
    expect(controls.length).toBeGreaterThan(0);

    for (const control of controls) {
      expect(control, control.outerHTML).toHaveAccessibleName();
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});

describe("11 to 15. cloze deletions", () => {
  function clozeField() {
    return screen.getByLabelText("Text") as HTMLTextAreaElement;
  }

  async function mark() {
    await fireEvent.click(
      screen.getByRole("button", { name: /mark selection/i }),
    );
  }

  it("wraps the selection, and gives the next range the next ordinal", async () => {
    renderEditor(CLOZE_DRAFT);

    select(clozeField(), "Paris");
    await mark();
    expect(clozeField()).toHaveValue("{{c1::Paris}} is the capital of France.");

    select(clozeField(), "France");
    await mark();
    expect(clozeField()).toHaveValue(
      "{{c1::Paris}} is the capital of {{c2::France}}.",
    );
  });

  it("leaves the caret just past the markup it wrote", async () => {
    renderEditor(CLOZE_DRAFT);

    select(clozeField(), "Paris");
    await mark();

    expect(clozeField().selectionStart).toBe("{{c1::Paris}}".length);
  });

  // 3.9: one deletion, two blanks.
  it("groups a second span under an ordinal the user picked", async () => {
    renderEditor(CLOZE_DRAFT);

    select(clozeField(), "Paris");
    await mark();

    select(clozeField(), "France");
    await fireEvent.change(screen.getByLabelText(/mark the selection as/i), {
      target: { value: "1" },
    });
    await mark();

    expect(clozeField()).toHaveValue(
      "{{c1::Paris}} is the capital of {{c1::France}}.",
    );
    expect(
      within(screen.getByRole("list", { name: /deletions/i })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
  });

  it("unwraps a deletion and drops it from the list", async () => {
    renderEditor(CLOZE_DRAFT);

    select(clozeField(), "Paris");
    await mark();
    await fireEvent.click(screen.getByRole("button", { name: /remove c1/i }));

    expect(clozeField()).toHaveValue("Paris is the capital of France.");
    expect(
      screen.queryByRole("list", { name: /deletions/i }),
    ).not.toBeInTheDocument();
  });

  it("will not add a cloze card with nothing hidden, and says so", async () => {
    const client = anki();
    renderEditor(CLOZE_DRAFT, client);

    expect(
      screen.getByText(/mark at least one cloze deletion in text/i),
    ).toBeInTheDocument();
    await addCard();
    expect(added(client)).toEqual([]);

    select(clozeField(), "Paris");
    await mark();

    expect(
      screen.queryByText(/mark at least one cloze deletion/i),
    ).not.toBeInTheDocument();
    await addCard();
    expect(added(client)).toHaveLength(1);
  });

  // 3.10: an overlap is refused rather than reinterpreted.
  it("refuses an overlapping selection and leaves the field alone", async () => {
    renderEditor(CLOZE_DRAFT);

    select(clozeField(), "Paris");
    await mark();
    const before = clozeField().value;

    clozeField().setSelectionRange(2, 8);
    await mark();

    expect(clozeField()).toHaveValue(before);
    expect(screen.getByText(/overlaps c1/i)).toBeInTheDocument();
  });

  it("asks for a selection when there is none", async () => {
    renderEditor(CLOZE_DRAFT);

    clozeField().setSelectionRange(3, 3);
    await mark();

    expect(
      screen.getByText(/select the text you want to hide/i),
    ).toBeInTheDocument();
  });
});

describe("16. cloze controls belong to cloze note types", () => {
  // 6.7: read off the descriptor's kind, never matched on the name.
  it("are absent for a standard note type", () => {
    renderEditor(BASIC_DRAFT);

    expect(
      screen.queryByRole("button", { name: /mark selection/i }),
    ).not.toBeInTheDocument();
  });

  it("are present for a cloze-flavoured one", () => {
    renderEditor(CLOZE_DRAFT);

    expect(
      screen.getByRole("button", { name: /mark selection/i }),
    ).toBeInTheDocument();
  });

  it("appear when the note type is switched to a cloze one", async () => {
    renderEditor();
    await screen.findByRole("option", { name: "Cloze" });

    await fireEvent.change(screen.getByLabelText(/^note type$/i), {
      target: { value: "Cloze" },
    });

    expect(
      screen.getByRole("button", { name: /mark selection/i }),
    ).toBeInTheDocument();
  });
});

describe("17. marking without a mouse", () => {
  it("marks the selection from the keyboard shortcut", async () => {
    renderEditor(CLOZE_DRAFT);
    const field = screen.getByLabelText("Text") as HTMLTextAreaElement;

    select(field, "Paris");
    await fireEvent.keyDown(field, {
      key: "C",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(field).toHaveValue("{{c1::Paris}} is the capital of France.");
  });

  it("says what the shortcut is", () => {
    renderEditor(CLOZE_DRAFT);

    expect(screen.getByText(/ctrl.*shift.*c/i)).toBeInTheDocument();
  });
});

/**
 * 7.1 to 7.5, at the surface the user actually touches. The view-model's own
 * tests cover the rules; these cover that they are reachable.
 */
describe("18. the draft survives the sidebar", () => {
  it("stores what was typed", async () => {
    const { drafts } = renderEditor();

    await fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "Paris" },
    });
    await addCard();

    const stored = await drafts.load();
    // Cleared on success by the panel, not here, so it is still readable.
    expect(stored.ok && stored.value?.fields["Back"]).toBe("Paris");
  });

  it("says so when it could not be stored", async () => {
    const drafts = createFakeDraftStore(BASIC_DRAFT);
    drafts.failWith({ kind: "write-failed", message: "quota exceeded" });
    renderEditor(BASIC_DRAFT, anki(), { drafts });

    await fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "Paris" },
    });
    await addCard();

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
  });
});

describe("19. retrying a failed add", () => {
  it("offers a retry that sends the same card, with nothing re-entered", async () => {
    const client = anki();
    renderEditor(BASIC_DRAFT, client);
    await screen.findByRole("option", { name: "Default" });
    await fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "Paris" },
    });
    client.failWith({ kind: "anki-not-running", message: "nothing answered" });
    await addCard();
    await screen.findByText(/anki is not running/i);

    client.failWith(undefined);
    await fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText(/added to anki/i)).toBeInTheDocument();
    expect(added(client)).toHaveLength(1);
    expect(added(client)[0]?.fields["Back"]).toBe("Paris");
  });

  it("keeps the fields as they were while the add is failing", async () => {
    const client = anki();
    renderEditor(BASIC_DRAFT, client);
    await screen.findByRole("option", { name: "Default" });
    await fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "Paris" },
    });
    client.failWith({ kind: "timeout", message: "Anki never answered" });

    await addCard();

    expect(await screen.findByText(/never answered/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Back")).toHaveValue("Paris");
  });
});

describe("20. converting a captured card to cloze", () => {
  it("turns the selection into the cloze field", async () => {
    renderEditor();
    await screen.findByRole("option", { name: "Default" });

    await fireEvent.click(
      screen.getByRole("button", { name: /convert to cloze/i }),
    );

    expect(await screen.findByLabelText("Text")).toHaveValue(
      "Capital of France?",
    );
    expect(
      screen.getByRole("button", { name: /mark selection/i }),
    ).toBeInTheDocument();
  });

  it("is not offered for a card that is already cloze", async () => {
    renderEditor(CLOZE_DRAFT);
    await screen.findByRole("option", { name: "Default" });

    expect(
      screen.queryByRole("button", { name: /convert to cloze/i }),
    ).toBeNull();
  });

  it("is not offered when Anki has named no cloze note type", async () => {
    renderEditor(
      BASIC_DRAFT,
      createFakeAnkiClient({ decks: ["Default"], noteTypes: [BASIC, VOCAB] }),
    );
    await screen.findByRole("option", { name: "Default" });

    expect(
      screen.queryByRole("button", { name: /convert to cloze/i }),
    ).toBeNull();
  });
});

describe("21. what the panel is told", () => {
  it("reports the note id once the card is in Anki", async () => {
    const onAdded = vi.fn();
    renderEditor(BASIC_DRAFT, anki(), { onAdded });

    await addCard();
    await screen.findByText(/added to anki/i);

    expect(onAdded).toHaveBeenCalledWith(1);
  });
});
