import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import LandingArea from "./LandingArea.svelte";

const TEXT = "Paris is the capital of France.";

function renderLanding(overrides: Record<string, unknown> = {}) {
  const onInput = vi.fn();
  const onSend = vi.fn();

  return {
    onInput,
    onSend,
    ...render(LandingArea, {
      text: TEXT,
      fields: ["Front", "Back"],
      onInput,
      onSend,
      ...overrides,
    }),
  };
}

function box() {
  return screen.getByLabelText(/selected text/i) as HTMLTextAreaElement;
}

function select(text: string) {
  const at = box().value.indexOf(text);
  box().setSelectionRange(at, at + text.length);
}

async function sendTo(field: string) {
  await fireEvent.change(screen.getByLabelText(/send to/i), {
    target: { value: field },
  });
  await fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
}

describe("1. the box itself", () => {
  it("shows the captured text", () => {
    renderLanding();

    expect(box()).toHaveValue(TEXT);
  });

  it("hands back what was typed into it", async () => {
    const { onInput } = renderLanding();

    await fireEvent.input(box(), { target: { value: "edited" } });

    expect(onInput).toHaveBeenCalledWith("edited");
  });
});

describe("2. sending a run of it into a field (10a.2)", () => {
  it("offers every field of the note type as a destination", () => {
    renderLanding();

    expect(
      screen
        .getAllByRole("option")
        .map((one) => (one as HTMLOptionElement).value),
    ).toEqual(["Front", "Back"]);
  });

  // A note type with eight fields is eight buttons wide in a sidebar a third
  // of a window across; a menu is one control however many there are.
  it("starts on the note type's first field", async () => {
    const { onSend } = renderLanding();

    await fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(onSend).toHaveBeenCalledWith("Front", TEXT, false);
  });

  it("sends what is selected", async () => {
    const { onSend } = renderLanding();

    select("Paris");
    await sendTo("Front");

    expect(onSend).toHaveBeenCalledWith("Front", "Paris", false);
  });

  // Nothing selected is not an error state: the common case is wanting the
  // lot, and refusing would be a dialog for something a button can just do.
  it("sends the whole box when nothing is selected", async () => {
    const { onSend } = renderLanding();

    await sendTo("Back");

    expect(onSend).toHaveBeenCalledWith("Back", TEXT, false);
  });

  it("offers the new field set when the note type changes", async () => {
    const { rerender } = renderLanding();

    await rerender({ fields: ["Text", "Back Extra"] });

    expect(
      screen
        .getAllByRole("option")
        .map((one) => (one as HTMLOptionElement).value),
    ).toEqual(["Text", "Back Extra"]);
  });

  // A chosen field that the new note type does not have would send nowhere.
  it("falls back to the first field when the chosen one is gone", async () => {
    const { onSend, rerender } = renderLanding();

    await fireEvent.change(screen.getByLabelText(/send to/i), {
      target: { value: "Back" },
    });
    await rerender({ fields: ["Text", "Back Extra"] });
    await fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(onSend).toHaveBeenCalledWith("Text", TEXT, false);
  });

  it("keeps the chosen field when the note type still has it", async () => {
    const { onSend, rerender } = renderLanding();

    await fireEvent.change(screen.getByLabelText(/send to/i), {
      target: { value: "Back" },
    });
    await rerender({ fields: ["Front", "Back", "Extra"] });
    await fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(onSend).toHaveBeenCalledWith("Back", TEXT, false);
  });
});

describe("3. insert or replace", () => {
  it("inserts by default", () => {
    renderLanding();

    expect(screen.getByLabelText(/replace/i)).not.toBeChecked();
  });

  it("says to replace once the box is ticked", async () => {
    const { onSend } = renderLanding();

    await fireEvent.click(screen.getByLabelText(/replace/i));
    select("Paris");
    await sendTo("Front");

    expect(onSend).toHaveBeenCalledWith("Front", "Paris", true);
  });
});

describe("4. reachable and labelled", () => {
  it("names every control and leaves it in the tab order", () => {
    const { container } = renderLanding();

    for (const control of container.querySelectorAll(
      "textarea, input, select, button",
    )) {
      expect(control, control.outerHTML).toHaveAccessibleName();
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});
