import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import Picker from "./Picker.svelte";

const DECKS = ["Default", "Geography", "Geography::Rivers", "Spanish::Verbs"];

function renderPicker(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();

  return {
    onChange,
    ...render(Picker, {
      id: "deck",
      label: "Deck",
      value: "Geography",
      options: DECKS,
      onChange,
      ...overrides,
    }),
  };
}

function options() {
  return screen
    .getAllByRole("option")
    .map((option) => (option as HTMLOptionElement).value);
}

describe("1. choosing", () => {
  it("shows the value it was given", () => {
    renderPicker();

    expect(screen.getByLabelText("Deck")).toHaveValue("Geography");
  });

  it("offers everything Anki reported", () => {
    renderPicker();

    expect(options()).toEqual(DECKS);
  });

  it("hands the choice back", async () => {
    const { onChange } = renderPicker();

    await fireEvent.change(screen.getByLabelText("Deck"), {
      target: { value: "Spanish::Verbs" },
    });

    expect(onChange).toHaveBeenCalledWith("Spanish::Verbs");
  });

  // A collection Anki has not reported yet, or one whose deck was renamed:
  // the draft's own value stays choosable rather than silently becoming
  // another deck's.
  it("keeps a value the list does not contain", () => {
    renderPicker({ value: "Gone", options: DECKS });

    expect(screen.getByLabelText("Deck")).toHaveValue("Gone");
    expect(options()).toContain("Gone");
  });
});

describe("2. filtering, because a real collection has dozens", () => {
  it("narrows the list to what matches", async () => {
    renderPicker();

    await fireEvent.input(screen.getByLabelText(/filter decks/i), {
      target: { value: "geo" },
    });

    expect(options()).toEqual(["Geography", "Geography::Rivers"]);
  });

  it("ignores case", async () => {
    renderPicker({ value: "Spanish::Verbs" });

    await fireEvent.input(screen.getByLabelText(/filter decks/i), {
      target: { value: "SPANISH" },
    });

    expect(options()).toEqual(["Spanish::Verbs"]);
  });

  it("keeps the chosen value visible even when it does not match", async () => {
    renderPicker();

    await fireEvent.input(screen.getByLabelText(/filter decks/i), {
      target: { value: "spanish" },
    });

    expect(options()).toContain("Geography");
  });

  it("says so when nothing matches", async () => {
    renderPicker();

    await fireEvent.input(screen.getByLabelText(/filter decks/i), {
      target: { value: "zzz" },
    });

    expect(screen.getByText(/no decks match/i)).toBeInTheDocument();
  });
});

describe("3. reachable", () => {
  it("labels both controls and leaves them in the tab order", () => {
    const { container } = renderPicker();

    for (const control of container.querySelectorAll("input, select")) {
      expect(control, control.outerHTML).toHaveAccessibleName();
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});
