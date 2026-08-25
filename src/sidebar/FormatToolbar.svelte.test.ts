import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import { parseCloze } from "@/core/cloze";

import FormatToolbar from "./FormatToolbar.svelte";

const DELETIONS = parseCloze("{{c1::Paris}} is the capital of {{c2::France}}.");

function renderToolbar(overrides: Record<string, unknown> = {}) {
  const onCommand = vi.fn();
  const onMark = vi.fn();
  const onRemove = vi.fn();

  return {
    onCommand,
    onMark,
    onRemove,
    ...render(FormatToolbar, {
      onCommand,
      onMark,
      onRemove,
      isCloze: false,
      deletions: [],
      nextOrdinal: 1,
      marks: { b: false, i: false, u: false, sub: false, sup: false },
      ...overrides,
    }),
  };
}

describe("1. the buttons Anki puts on its own toolbar", () => {
  it.each([
    [/^bold/i, "bold"],
    [/^italic/i, "italic"],
    [/^underline/i, "underline"],
    [/^superscript/i, "superscript"],
    [/^subscript/i, "subscript"],
    [/remove formatting/i, "clear"],
  ] as const)("%s", async (label, command) => {
    const { onCommand } = renderToolbar();

    await fireEvent.click(screen.getByRole("button", { name: label }));

    expect(onCommand).toHaveBeenCalledWith(command);
  });

  it("shows which marks the selection already carries", () => {
    renderToolbar({
      marks: { b: true, i: false, u: false, sub: false, sup: false },
    });

    expect(screen.getByRole("button", { name: /^bold/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^italic/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // 10.7: the shortcut is on the button, so it can be learned from the UI.
  it("names each shortcut on the control that uses it", () => {
    renderToolbar();

    expect(screen.getByRole("button", { name: /^bold/i })).toHaveAttribute(
      "title",
      expect.stringContaining("Ctrl+B"),
    );
  });

  it("leaves every control reachable and named", () => {
    const { container } = renderToolbar({
      isCloze: true,
      deletions: DELETIONS,
    });

    for (const control of container.querySelectorAll("button, select")) {
      expect(control, control.outerHTML).toHaveAccessibleName();
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});

describe("2. cloze, in the same toolbar (M10 deliverables)", () => {
  it("is absent for a standard note type", () => {
    renderToolbar();

    expect(
      screen.queryByRole("button", { name: /mark selection/i }),
    ).not.toBeInTheDocument();
  });

  it("marks a new deletion", async () => {
    const { onMark } = renderToolbar({ isCloze: true, nextOrdinal: 3 });

    await fireEvent.click(
      screen.getByRole("button", { name: /mark selection/i }),
    );

    expect(onMark).toHaveBeenCalledWith(undefined);
  });

  it("groups under an ordinal the user picked (3.9)", async () => {
    const { onMark } = renderToolbar({
      isCloze: true,
      deletions: DELETIONS,
      nextOrdinal: 3,
    });

    await fireEvent.change(screen.getByLabelText(/mark the selection as/i), {
      target: { value: "2" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: /mark selection/i }),
    );

    expect(onMark).toHaveBeenCalledWith(2);
  });

  it("lists what is hidden, one entry per ordinal", () => {
    renderToolbar({ isCloze: true, deletions: DELETIONS, nextOrdinal: 3 });

    expect(
      within(screen.getByRole("list", { name: /deletions/i })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
  });

  it("removes one by its ordinal", async () => {
    const { onRemove } = renderToolbar({
      isCloze: true,
      deletions: DELETIONS,
      nextOrdinal: 3,
    });

    await fireEvent.click(screen.getByRole("button", { name: /remove c1/i }));

    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
