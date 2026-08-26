import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import { CAPTURE_SHORTCUT } from "@/manifest/manifest";
import { SHORTCUT_DOCS } from "@/sidebar/shortcuts";

import ShortcutList from "./ShortcutList.svelte";

describe("the keyboard shortcuts, documented in the extension", () => {
  it("lists every chord, with what it does", () => {
    const { container } = render(ShortcutList);

    for (const entry of SHORTCUT_DOCS) {
      expect(container.textContent).toContain(entry.keys);
      expect(container.textContent).toContain(entry.description);
    }
  });

  it("leads with the one that makes a card at all", () => {
    const { container } = render(ShortcutList);

    expect(container.textContent).toContain(CAPTURE_SHORTCUT);
  });

  it("says where the capture shortcut can be changed", () => {
    render(ShortcutList);

    expect(screen.getByRole("heading")).toHaveTextContent(/shortcut/i);
  });
});
