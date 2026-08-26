import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import { allowlistSnippet } from "@/anki/allowlist";

import ManualFallback from "./ManualFallback.svelte";

const ORIGIN = "moz-extension://8b7c1f2e-0a3d-4c5b-9e6f-1a2b3c4d5e6f";

function renderFallback(props: {
  origin?: string;
  copy?: () => Promise<void>;
}) {
  return render(ManualFallback, { origin: ORIGIN, ...props });
}

describe("the manual allowlist fallback", () => {
  /**
   * Test 2. On Firefox the `moz-extension://` UUID is minted per installation
   * (P8), so a value baked in at build time is wrong for everyone but whoever
   * built it — and a placeholder is a value the user would paste verbatim.
   */
  it("shows the running extension's own origin", () => {
    const { container } = renderFallback({});

    expect(container.textContent).toContain(ORIGIN);
    expect(container.textContent).not.toContain("<uuid>");
    expect(container.textContent).not.toContain("YOUR_EXTENSION_ID");
  });

  it("shows the exact JSON to paste, under AnkiConnect's own key", () => {
    const { container } = renderFallback({});

    expect(container.textContent).toContain(allowlistSnippet(ORIGIN));
    expect(container.textContent).toContain("webCorsOriginList");
  });

  it("says where in Anki the edit is made", () => {
    renderFallback({});

    expect(screen.getByText(/Tools/)).toHaveTextContent(/Add-ons/);
  });

  /** 9.8. Honoured as a wildcard, and web pages are what CORS constrains. */
  it("never suggests a wildcard", () => {
    const { container } = renderFallback({});

    expect(container.textContent).not.toContain("*");
  });

  it("copies the snippet when asked", async () => {
    const copy = vi.fn(async () => {});
    renderFallback({ copy });

    await fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(copy).toHaveBeenCalledWith(allowlistSnippet(ORIGIN));
    expect(await screen.findByRole("status")).toHaveTextContent(/copied/i);
  });

  /**
   * The clipboard is a permission and a browser setting away from failing, and
   * the snippet is on screen either way — so a refusal says to select it, not
   * that the fix is unavailable.
   */
  it("still leaves the snippet selectable when the clipboard refuses", async () => {
    const copy = vi.fn(async () => {
      throw new Error("denied");
    });
    const { container } = renderFallback({ copy });

    await fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/select/i);
    expect(container.textContent).toContain(allowlistSnippet(ORIGIN));
  });

  it("offers no copy button when nothing can copy", () => {
    renderFallback({ copy: undefined });

    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
  });

  /** There is no allowlist entry to write before the extension has an origin. */
  it("says the origin could not be read rather than showing an empty one", () => {
    const { container } = renderFallback({ origin: "" });

    expect(container.textContent).not.toContain('""');
    expect(screen.getByRole("alert")).toHaveTextContent(/origin/i);
  });
});
