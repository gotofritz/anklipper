import { describe, expect, it } from "vitest";

import { CONTEXT_CAP, HTML_CAP, SELECTION_CAP, capText, warn } from "./capture";

describe("capText", () => {
  it("leaves text shorter than the cap alone", () => {
    expect(capText("Paris is the capital of France.", SELECTION_CAP)).toEqual({
      text: "Paris is the capital of France.",
      truncated: false,
    });
  });

  it("leaves text exactly at the cap alone", () => {
    const text = "x".repeat(CONTEXT_CAP);

    expect(capText(text, CONTEXT_CAP)).toEqual({ text, truncated: false });
  });

  // 5.3, and the risk note: select-all on a long article is megabytes, and the
  // cap has to bite before any of it crosses a message boundary.
  it("truncates at the cap and says so", () => {
    const capped = capText("y".repeat(SELECTION_CAP + 1), SELECTION_CAP);

    expect(capped.text).toHaveLength(SELECTION_CAP);
    expect(capped.truncated).toBe(true);
  });

  it("caps the retained HTML fragment more generously than the text (5.2)", () => {
    expect(HTML_CAP).toBeGreaterThan(SELECTION_CAP);
  });
});

describe("warn", () => {
  it("pairs a kind with the message the user is shown (5.4)", () => {
    expect(warn("shadow-dom", "the selection is inside a shadow root")).toEqual(
      {
        kind: "shadow-dom",
        message: "the selection is inside a shadow root",
      },
    );
  });
});
