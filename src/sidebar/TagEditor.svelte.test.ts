import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import TagEditor from "./TagEditor.svelte";

function renderEditor(tags: readonly string[] = ["europe", "capitals"]) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(TagEditor, { tags, onAdd, onRemove });

  return { onAdd, onRemove };
}

describe("the tag editor", () => {
  it("lists the tags the draft carries", () => {
    renderEditor();

    expect(screen.getByRole("list", { name: /tags/i })).toBeInTheDocument();
    expect(screen.getByText("europe")).toBeInTheDocument();
    expect(screen.getByText("capitals")).toBeInTheDocument();
  });

  it("says so when there are none", () => {
    renderEditor([]);

    expect(screen.getByText(/no tags/i)).toBeInTheDocument();
  });

  it("hands over a typed tag and clears the box", async () => {
    const { onAdd } = renderEditor();
    const box = screen.getByLabelText(/add a tag/i);

    await fireEvent.input(box, { target: { value: "geography" } });
    await fireEvent.click(screen.getByRole("button", { name: /add tag/i }));

    expect(onAdd).toHaveBeenCalledWith("geography");
    expect(box).toHaveValue("");
  });

  // A tag box that needs the mouse is a tag box nobody uses.
  it("hands over a tag typed and entered", async () => {
    const { onAdd } = renderEditor();
    const box = screen.getByLabelText(/add a tag/i);

    await fireEvent.input(box, { target: { value: "geography" } });
    await fireEvent.keyDown(box, { key: "Enter" });

    expect(onAdd).toHaveBeenCalledWith("geography");
  });

  it("does not hand over an empty tag", async () => {
    const { onAdd } = renderEditor();

    await fireEvent.click(screen.getByRole("button", { name: /add tag/i }));

    expect(onAdd).not.toHaveBeenCalled();
  });

  it("removes the tag whose button was pressed", async () => {
    const { onRemove } = renderEditor();

    await fireEvent.click(
      screen.getByRole("button", { name: /remove europe/i }),
    );

    expect(onRemove).toHaveBeenCalledWith("europe");
  });
});
