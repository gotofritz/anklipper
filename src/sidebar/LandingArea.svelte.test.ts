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
  await fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`send to ${field}`, "i") }),
  );
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
  it("offers one button per field of the note type", () => {
    renderLanding();

    expect(
      screen.getByRole("button", { name: /send to front/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send to back/i }),
    ).toBeInTheDocument();
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

  it("re-renders its buttons when the note type changes", async () => {
    const { rerender } = renderLanding();

    await rerender({ fields: ["Text", "Back Extra"] });

    expect(
      screen.getByRole("button", { name: /send to text/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send to front/i }),
    ).not.toBeInTheDocument();
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
      "textarea, input, button",
    )) {
      expect(control, control.outerHTML).toHaveAccessibleName();
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});
