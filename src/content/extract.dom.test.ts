import { beforeEach, describe, expect, it } from "vitest";

import { CONTEXT_CAP, SELECTION_CAP } from "@/core/capture";

import { extractCapture } from "./extract.dom";

function select(
  start: Node,
  startOffset: number,
  end: Node,
  endOffset: number,
) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectContentsOf(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function textOf(selector: string): Text {
  const node = document.querySelector(selector)?.firstChild;
  if (!node) throw new Error(`no text node in ${selector}`);
  return node as Text;
}

function extract() {
  return extractCapture({ document, window });
}

function kinds(warnings: readonly { kind: string }[]) {
  return warnings.map((warning) => warning.kind);
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

describe("extractCapture", () => {
  // Test 1.
  it("takes the selected text and the paragraph around it", () => {
    document.body.innerHTML = `
      <p id="one">France is a country in Europe. Paris is its capital.</p>
      <p id="two">Berlin is the capital of Germany.</p>`;
    const paragraph = textOf("#one");
    select(paragraph, 31, paragraph, 51);

    const capture = extract();

    expect(capture.text).toBe("Paris is its capital");
    expect(capture.context).toBe(
      "France is a country in Europe. Paris is its capital.",
    );
  });

  // Test 2.
  it("finds the nearest preceding heading across intervening elements", () => {
    document.body.innerHTML = `
      <h1>Europe</h1>
      <h2>France</h2>
      <figure><img alt="" /></figure>
      <div><p id="target">Paris is its capital.</p></div>
      <h2>Germany</h2>`;
    selectContentsOf(document.querySelector("#target")!);

    expect(extract().heading).toBe("France");
  });

  it("reports no heading rather than inventing one", () => {
    document.body.innerHTML = `<p id="target">Paris is its capital.</p>`;
    selectContentsOf(document.querySelector("#target")!);

    expect(extract().heading).toBe("");
  });

  // Test 3.
  it("uses the common ancestor when the selection spans several blocks", () => {
    document.body.innerHTML = `
      <section id="wrap">
        <p id="one">First paragraph.</p>
        <p id="two">Second paragraph.</p>
      </section>`;
    select(textOf("#one"), 0, textOf("#two"), 17);

    const capture = extract();

    expect(capture.text).toContain("First paragraph.");
    expect(capture.text).toContain("Second paragraph.");
    expect(capture.context).toBe("First paragraph.\nSecond paragraph.");
  });

  // The risk note: a framework wrapper with no text of its own is not context.
  it("climbs past a block ancestor that carries no text", () => {
    document.body.innerHTML = `
      <article id="outer">
        <p>Paris is the capital of France.</p>
      </article>`;
    const empty = document.createElement("div");
    document.querySelector("#outer")!.append(empty);
    const span = document.createElement("span");
    span.textContent = "   ";
    empty.append(span);
    selectContentsOf(span);

    expect(extract().context).toContain("Paris is the capital of France.");
  });

  // Test 4.
  it("truncates a selection over the cap and flags the truncation", () => {
    const long = "z".repeat(SELECTION_CAP + 500);
    document.body.innerHTML = `<p id="target">${long}</p>`;
    selectContentsOf(document.querySelector("#target")!);

    const capture = extract();

    expect(capture.text).toHaveLength(SELECTION_CAP);
    expect(kinds(capture.warnings)).toContain("selection-truncated");
  });

  it("truncates surrounding context over its own, smaller cap", () => {
    const long = "w".repeat(CONTEXT_CAP + 200);
    document.body.innerHTML = `<p id="target">Lead. ${long}</p>`;
    const paragraph = textOf("#target");
    select(paragraph, 0, paragraph, 5);

    const capture = extract();

    expect(capture.text).toBe("Lead.");
    expect(capture.context).toHaveLength(CONTEXT_CAP);
    expect(kinds(capture.warnings)).toContain("context-truncated");
  });

  // Test 5.
  it("flattens markup to text, keeps line breaks, and retains the HTML (5.2)", () => {
    document.body.innerHTML = `
      <div id="target"><p>First line.</p><p>Second <b>line</b>.<br />Third line.</p></div>`;
    selectContentsOf(document.querySelector("#target")!);

    const capture = extract();

    expect(capture.text).toBe("First line.\nSecond line.\nThird line.");
    expect(capture.html).toContain("<b>line</b>");
    expect(capture.html).toContain("<br");
  });

  it("collapses runs of whitespace without collapsing the line breaks", () => {
    document.body.innerHTML = `
      <div id="target"><p>Spaced      out</p><p>and     wrapped</p></div>`;
    selectContentsOf(document.querySelector("#target")!);

    expect(extract().text).toBe("Spaced out\nand wrapped");
  });

  // Test 6.
  it("reports the shadow-DOM blind spot rather than returning empty text", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.querySelector("#host")!;
    host.attachShadow({ mode: "open" }).innerHTML =
      `<p>Paris is the capital of France.</p>`;
    const range = document.createRange();
    range.selectNode(host);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const capture = extract();

    expect(capture.text).toBe("");
    expect(kinds(capture.warnings)).toContain("shadow-dom");
  });

  it("reports the cross-origin frame blind spot", () => {
    document.body.innerHTML = `<iframe id="frame"></iframe><p id="empty"></p>`;
    const frame = document.querySelector("#frame")!;
    Object.defineProperty(frame, "contentDocument", {
      get() {
        throw new Error("blocked a frame with origin from accessing a frame");
      },
    });
    selectContentsOf(document.querySelector("#empty")!);

    expect(kinds(extract().warnings)).toContain("cross-origin-frame");
  });

  it("records the page's own title and url", () => {
    document.title = "France — Example";
    document.body.innerHTML = `<p id="target">Paris.</p>`;
    selectContentsOf(document.querySelector("#target")!);

    const capture = extract();

    expect(capture.title).toBe("France — Example");
    expect(capture.url).toBe(window.location.href);
  });

  it("returns an empty capture when nothing is selected", () => {
    document.body.innerHTML = `<p>Paris is the capital of France.</p>`;

    const capture = extract();

    expect(capture.text).toBe("");
    expect(capture.context).toBe("");
  });
});
