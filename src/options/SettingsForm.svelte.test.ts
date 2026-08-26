import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { createFakeSettingsStore } from "@/core/ports/fakes/fake-settings-store";
import type { FakeSettingsStore } from "@/core/ports/fakes/fake-settings-store";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { BASIC, CLOZE, VOCAB } from "@/fixtures/note-types";

import SettingsForm from "./SettingsForm.svelte";

function renderForm(
  settings: FakeSettingsStore = createFakeSettingsStore(),
  requestHostPermission?: (endpoint: string) => Promise<boolean>,
) {
  return {
    settings,
    ...render(SettingsForm, {
      settings,
      anki: createFakeAnkiClient({
        decks: ["Default", "Geography"],
        noteTypes: [BASIC, VOCAB, CLOZE],
      }),
      ...(requestHostPermission === undefined ? {} : { requestHostPermission }),
    }),
  };
}

describe("the settings form", () => {
  it("labels every control, so it can be reached from the keyboard", async () => {
    renderForm();

    expect(
      await screen.findByLabelText("Deck new cards start in"),
    ).toBeVisible();
    expect(screen.getByLabelText("Note type new cards start on")).toBeVisible();
    expect(screen.getByLabelText("Field for the page address")).toBeVisible();
    expect(screen.getByLabelText("Field for the page title")).toBeVisible();
    expect(screen.getByLabelText("How the address is written")).toBeVisible();
    expect(screen.getByLabelText("AnkiConnect address")).toBeVisible();
    expect(
      screen.getByLabelText("How long to wait (milliseconds)"),
    ).toBeVisible();
  });

  it("offers Anki's decks", async () => {
    renderForm();

    const deck = await screen.findByLabelText<HTMLSelectElement>(
      "Deck new cards start in",
    );
    expect([...deck.options].map((option) => option.value)).toContain(
      "Geography",
    );
  });

  // Test 2 of the M8 plan, at the surface the user touches.
  it("saves what was chosen", async () => {
    const { settings } = renderForm();

    const deck = await screen.findByLabelText("Deck new cards start in");
    await fireEvent.change(deck, { target: { value: "Geography" } });
    await fireEvent.click(
      screen.getByRole("button", { name: "Save settings" }),
    );

    const stored = await settings.load();
    expect(stored.ok && stored.value.defaultDeck).toBe("Geography");
    expect(await screen.findByText("Settings saved.")).toBeVisible();
  });

  it("says which setting is wrong instead of saving it", async () => {
    const { settings } = renderForm();

    const endpoint = await screen.findByLabelText("AnkiConnect address");
    await fireEvent.input(endpoint, { target: { value: "not a url" } });
    await fireEvent.click(
      screen.getByRole("button", { name: "Save settings" }),
    );

    expect(
      await screen.findByText(/never talks to anywhere else/i),
    ).toBeVisible();
    const stored = await settings.load();
    expect(stored.ok && stored.value.endpoint).toBe(DEFAULT_SETTINGS.endpoint);
  });

  it("marks the field that failed validation for a screen reader", async () => {
    renderForm();

    const endpoint = await screen.findByLabelText("AnkiConnect address");
    await fireEvent.input(endpoint, { target: { value: "not a url" } });
    await fireEvent.click(
      screen.getByRole("button", { name: "Save settings" }),
    );

    expect(
      await screen.findByText(/never talks to anywhere else/i),
    ).toBeVisible();
    expect(endpoint).toHaveAttribute("aria-invalid", "true");
  });

  /**
   * M9. Almost nobody has a key (4.8), and a credential box on a form that
   * does not need one is a box people fill in wrongly — so it appears for a
   * reason rather than by default.
   */
  it("keeps the API key field off a form that has no use for one", async () => {
    renderForm();

    await screen.findByLabelText("AnkiConnect address");

    expect(screen.queryByLabelText("AnkiConnect API key")).toBeNull();
  });

  it("offers it to a user who says their AnkiConnect has one", async () => {
    renderForm();
    await screen.findByLabelText("AnkiConnect address");

    await fireEvent.click(screen.getByRole("button", { name: /api key/i }));

    expect(screen.getByLabelText("AnkiConnect API key")).toBeVisible();
  });

  it("shows it unasked when AnkiConnect refuses for want of a key", async () => {
    const anki = createFakeAnkiClient({});
    anki.failWith({
      kind: "api-key-required",
      message: "valid api key must be provided",
    });
    render(SettingsForm, { settings: createFakeSettingsStore(), anki });

    expect(await screen.findByLabelText("AnkiConnect API key")).toBeVisible();
  });

  it("shows it unasked when one is already stored", async () => {
    renderForm(createFakeSettingsStore({ apiKey: "s3cret" }));

    expect(await screen.findByLabelText("AnkiConnect API key")).toBeVisible();
  });

  // 8.5a: the key is stored like any other setting, and shown like a password.
  it("does not put the API key on screen in plain text", async () => {
    renderForm(createFakeSettingsStore({ apiKey: "s3cret" }));

    const key = await screen.findByLabelText("AnkiConnect API key");
    expect(key).toHaveAttribute("type", "password");
  });

  it("resets to the defaults without asking the store to save the form", async () => {
    const { settings } = renderForm(
      createFakeSettingsStore({ defaultDeck: "Geography" }),
    );

    await screen.findByLabelText("Deck new cards start in");
    await fireEvent.click(
      screen.getByRole("button", { name: "Reset to defaults" }),
    );

    const stored = await settings.load();
    expect(stored.ok && stored.value).toEqual(DEFAULT_SETTINGS);
  });

  it("says so when Anki cannot be reached, and still lets the rest be edited", async () => {
    const anki = createFakeAnkiClient({});
    anki.failWith({ kind: "anki-not-running", message: "closed" });

    render(SettingsForm, { settings: createFakeSettingsStore(), anki });

    expect(await screen.findByText(/Anki is not running/i)).toBeVisible();
    expect(screen.getByLabelText("AnkiConnect address")).toBeEnabled();
  });

  it("adds a default tag through the editor the card uses", async () => {
    const { settings } = renderForm();

    await screen.findByLabelText("Deck new cards start in");
    await fireEvent.input(screen.getByLabelText("Add a tag"), {
      target: { value: "imported" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    await fireEvent.click(
      screen.getByRole("button", { name: "Save settings" }),
    );

    const stored = await settings.load();
    expect(stored.ok && stored.value.defaultTags).toEqual(["imported"]);
  });

  it("offers only the chosen note type's fields to map the source into", async () => {
    renderForm();

    const noteType = await screen.findByLabelText(
      "Note type new cards start on",
    );
    await fireEvent.change(noteType, { target: { value: "Vocab" } });

    const urlField = screen.getByLabelText<HTMLSelectElement>(
      "Field for the page address",
    );
    expect([...urlField.options].map((option) => option.value)).toEqual([
      "",
      "Front",
      "Example",
    ]);
  });
});

describe("the permission a configured endpoint needs", () => {
  it("says so, and keeps the setting, when the browser refuses", async () => {
    const { settings } = renderForm(
      createFakeSettingsStore(),
      async () => false,
    );

    const endpoint = await screen.findByLabelText("AnkiConnect address");
    await fireEvent.input(endpoint, {
      target: { value: "http://127.0.0.1:9999" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Save settings" }),
    );

    expect(
      await screen.findByText(/has not given Anklipper access/i),
    ).toBeVisible();
    const stored = await settings.load();
    expect(stored.ok && stored.value.endpoint).toBe("http://127.0.0.1:9999");
  });

  it("says nothing about a permission that was granted", async () => {
    renderForm(createFakeSettingsStore(), async () => true);

    await screen.findByLabelText("AnkiConnect address");
    await fireEvent.click(
      screen.getByRole("button", { name: "Save settings" }),
    );

    expect(await screen.findByText("Settings saved.")).toBeVisible();
    expect(screen.queryByText(/has not given Anklipper access/i)).toBeNull();
  });
});
