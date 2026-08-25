import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import { parseCloze } from "@/core/cloze";
import type { ClozeDeletion } from "@/core/cloze";

import ClozeControls from "./ClozeControls.svelte";

function renderControls(deletions: readonly ClozeDeletion[], nextOrdinal = 1) {
  const onMark = vi.fn();
  const onRemove = vi.fn();
  render(ClozeControls, { deletions, nextOrdinal, onMark, onRemove });

  return { onMark, onRemove };
}

describe("the cloze controls", () => {
  it("says what to do when nothing is hidden yet", () => {
    renderControls([]);

    expect(screen.getByText(/select.*mark/i)).toBeInTheDocument();
  });

  // The point of the list: the markup is readable without counting braces.
  it("lists each deletion under its ordinal", () => {
    renderControls(parseCloze("{{c1::Paris}} is in {{c2::France}}"), 3);

    const list = screen.getByRole("list", { name: /deletions/i });
    expect(list).toHaveTextContent("c1");
    expect(list).toHaveTextContent("Paris");
    expect(list).toHaveTextContent("c2");
    expect(list).toHaveTextContent("France");
  });

  // 3.9: two spans under one ordinal are one deletion with two blanks.
  it("shows spans sharing an ordinal as one entry", () => {
    renderControls(parseCloze("{{c1::Paris}} and {{c1::Lyon}}"), 2);

    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveTextContent("Paris");
    expect(entries[0]).toHaveTextContent("Lyon");
  });

  it("marks a new deletion by default", async () => {
    const { onMark } = renderControls([], 1);

    await fireEvent.click(
      screen.getByRole("button", { name: /mark selection/i }),
    );

    expect(onMark).toHaveBeenCalledWith(undefined);
  });

  it("names the ordinal a new deletion will take", () => {
    renderControls(parseCloze("{{c1::Paris}}"), 2);

    expect(screen.getByRole("option", { name: /c2/ })).toBeInTheDocument();
  });

  it("marks under an ordinal the user picked", async () => {
    const { onMark } = renderControls(parseCloze("{{c1::Paris}}"), 2);

    await fireEvent.change(screen.getByLabelText(/mark the selection as/i), {
      target: { value: "1" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: /mark selection/i }),
    );

    expect(onMark).toHaveBeenCalledWith(1);
  });

  it("removes the deletion whose button was pressed", async () => {
    const { onRemove } = renderControls(
      parseCloze("{{c1::Paris}} is in {{c2::France}}"),
      3,
    );

    await fireEvent.click(screen.getByRole("button", { name: /remove c2/i }));

    expect(onRemove).toHaveBeenCalledWith(2);
  });
});
