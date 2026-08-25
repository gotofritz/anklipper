import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import type { FieldApi } from "./types";

import FieldEditor from "./FieldEditor.svelte";
import { rangeOffsetsOf } from "./selection.dom";

function renderField(overrides: Record<string, unknown> = {}) {
  const onInput = vi.fn();
  const onToggleSticky = vi.fn();
  const registered = new Map<string, FieldApi>();

  const rendered = render(FieldEditor, {
    name: "Front",
    value: "Capital of <b>France</b>?",
    onInput,
    onToggleSticky,
    register: (name: string, api: FieldApi | undefined) => {
      if (api === undefined) registered.delete(name);
      else registered.set(name, api);
    },
    ...overrides,
  });

  return { ...rendered, onInput, onToggleSticky, registered };
}

function richField() {
  return screen.getByRole("textbox", { name: "Front" });
}

describe("1. showing a field", () => {
  it("renders the field's markup, not its source", () => {
    renderField();

    expect(richField().innerHTML).toBe("Capital of <b>France</b>?");
    expect(richField().textContent).toBe("Capital of France?");
  });

  it("is editable and labelled by the field's own name", () => {
    renderField();

    expect(richField()).toHaveAttribute("contenteditable", "true");
    expect(screen.getByText("Front")).toBeInTheDocument();
  });

  it("hands back what was typed", async () => {
    const { onInput } = renderField();

    richField().innerHTML = "Longest river?";
    await fireEvent.input(richField());

    expect(onInput).toHaveBeenCalledWith("Longest river?");
  });
});

describe("2. the HTML source toggle (10.4)", () => {
  it("shows the markup as text when asked", async () => {
    renderField();

    await fireEvent.click(screen.getByRole("button", { name: /html/i }));

    expect(screen.getByLabelText(/front \(html\)/i)).toHaveValue(
      "Capital of <b>France</b>?",
    );
    expect(
      screen.queryByRole("textbox", { name: "Front" }),
    ).not.toBeInTheDocument();
  });

  it("applies what was edited in source, and goes back", async () => {
    const { onInput } = renderField();

    await fireEvent.click(screen.getByRole("button", { name: /html/i }));
    await fireEvent.input(screen.getByLabelText(/front \(html\)/i), {
      target: { value: "<i>Lyon</i>" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /html/i }));

    expect(onInput).toHaveBeenCalledWith("<i>Lyon</i>");
  });

  it("says which state it is in", async () => {
    renderField();
    const toggle = screen.getByRole("button", { name: /html/i });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});

describe("3. the sticky pin (10.6)", () => {
  it("says whether the field is pinned", () => {
    renderField({ sticky: true });

    expect(screen.getByRole("button", { name: /pin/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("asks for the pin to be toggled", async () => {
    const { onToggleSticky } = renderField();

    await fireEvent.click(screen.getByRole("button", { name: /pin/i }));

    expect(onToggleSticky).toHaveBeenCalledWith("Front");
  });
});

describe("4. a duplicate first field (10.8)", () => {
  it("marks the field itself rather than raising a banner", () => {
    renderField({ duplicate: true });

    expect(richField()).toHaveAttribute("data-duplicate", "true");
    expect(screen.getByText(/already has a note/i)).toBeInTheDocument();
  });

  it("says nothing when the card is not a duplicate", () => {
    renderField();

    expect(richField()).not.toHaveAttribute("data-duplicate", "true");
  });
});

describe("5. what is wrong with the field", () => {
  it("names the problem and points the field at it", () => {
    renderField({
      issues: [
        {
          code: "field-required",
          message: "Front may not be empty",
          field: "Front",
        },
      ],
    });

    expect(richField()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/front cannot be empty/i)).toBeInTheDocument();
  });
});

describe("6. pasting (10.5)", () => {
  it("strips what the allowlist does not carry, and keeps what it does", async () => {
    const { onInput } = renderField({ value: "" });

    await fireEvent.paste(richField(), {
      clipboardData: {
        getData: (type: string) =>
          type === "text/html"
            ? '<b onclick="x()">bold</b><script>evil()</script><span>plain</span>'
            : "bold plain",
      },
    });

    expect(onInput).toHaveBeenCalledWith("<b>bold</b>plain");
  });

  it("escapes plain text when that is all the clipboard has", async () => {
    const { onInput } = renderField({ value: "" });

    await fireEvent.paste(richField(), {
      clipboardData: {
        getData: (type: string) => (type === "text/html" ? "" : "5 < 6"),
      },
    });

    expect(onInput).toHaveBeenCalledWith("5 &lt; 6");
  });
});

describe("7. what the toolbar can do to it", () => {
  it("registers the selection it holds and gives it up on unmount", () => {
    const { registered, unmount } = renderField();

    const api = registered.get("Front");
    expect(api).toBeDefined();
    expect(api?.isSource()).toBe(false);

    unmount();
    expect(registered.has("Front")).toBe(false);
  });

  it("reports the caret as a text offset", async () => {
    const { registered } = renderField();
    const node = richField();

    const range = document.createRange();
    range.setStart(node.firstChild as Text, 3);
    range.setEnd(node.firstChild as Text, 7);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    await fireEvent.keyUp(node);

    expect(registered.get("Front")?.selection()).toEqual({
      start: 3,
      end: 7,
    });
  });
});

describe("8. when the value comes back changed", () => {
  // Pressing Enter leaves a `<div>` behind and the sanitiser answers with a
  // `<br>`, so rewriting the markup is on the ordinary typing path — and a
  // rewrite that dropped the caret would send the cursor to the top of the
  // field on every new line.
  it("keeps the caret where it was", async () => {
    const { rerender } = renderField({ value: "one" });
    const node = richField();

    node.focus();
    const range = document.createRange();
    range.setStart(node.firstChild as Text, 3);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    await rerender({ value: "one<br>" });

    expect(node.innerHTML).toBe("one<br>");
    expect(
      rangeOffsetsOf(node, window.getSelection()?.getRangeAt(0) as Range),
    ).toEqual({ start: 3, end: 3 });
  });

  it("leaves the selection alone when the field is not focused", async () => {
    const { rerender } = renderField({ value: "one" });

    await rerender({ value: "<b>one</b>" });

    expect(richField().innerHTML).toBe("<b>one</b>");
  });
});
