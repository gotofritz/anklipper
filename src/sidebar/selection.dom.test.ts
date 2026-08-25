import { afterEach, describe, expect, it } from "vitest";

import { fieldText } from "@/core/field-html";

import {
  caretRangeAt,
  placeCaretAt,
  rangeOffsetsOf,
  selectRangeIn,
  textOffsetOf,
} from "./selection.dom";

let host: HTMLElement | undefined;

function field(html: string): HTMLElement {
  host?.remove();
  host = document.createElement("div");
  host.contentEditable = "true";
  host.innerHTML = html;
  document.body.append(host);

  return host;
}

afterEach(() => {
  host?.remove();
  host = undefined;
});

/** The offsets a user's selection over `text` would produce. */
function selectText(node: HTMLElement, text: string) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current !== null) {
    const at = (current as Text).data.indexOf(text);
    if (at !== -1) {
      const range = document.createRange();
      range.setStart(current, at);
      range.setEnd(current, at + text.length);
      return range;
    }
    current = walker.nextNode();
  }

  throw new Error(`no text node holds ${text}`);
}

describe("1. a DOM position as a text offset", () => {
  it("counts the text before it", () => {
    const node = field("Paris is the capital");
    const text = node.firstChild as Text;

    expect(textOffsetOf(node, text, 0)).toBe(0);
    expect(textOffsetOf(node, text, 5)).toBe(5);
  });

  // The plan's test 8: the offsets the model works in are the field's text,
  // and inline markup between the ends of a selection must not shift them.
  it("counts across inline markup", () => {
    const node = field("<b>Paris</b> is the <i>capital</i>");
    const last = node.querySelector("i")?.firstChild as Text;

    expect(textOffsetOf(node, last, 0)).toBe("Paris is the ".length);
    expect(textOffsetOf(node, last, 7)).toBe("Paris is the capital".length);
  });

  it("counts a line break as one character, the way the field's text does", () => {
    const node = field("one<br>two");
    const second = node.lastChild as Text;

    expect(fieldText(node.innerHTML)).toBe("one\ntwo");
    expect(textOffsetOf(node, second, 0)).toBe(4);
  });

  it("reads a position given as an element and a child index", () => {
    const node = field("<b>Paris</b> is here");

    expect(textOffsetOf(node, node, 0)).toBe(0);
    expect(textOffsetOf(node, node, 1)).toBe(5);
    expect(textOffsetOf(node, node, 2)).toBe("Paris is here".length);
  });

  it("says nothing about a node outside the field", () => {
    const node = field("Paris");
    const stranger = document.createElement("div");
    stranger.textContent = "elsewhere";

    expect(textOffsetOf(node, stranger.firstChild as Text, 0)).toBeUndefined();
  });
});

describe("2. a range as a pair of offsets", () => {
  it("maps a selection over plain text", () => {
    const node = field("Paris is the capital");

    expect(rangeOffsetsOf(node, selectText(node, "Paris"))).toEqual({
      start: 0,
      end: 5,
    });
  });

  it("maps a selection that starts after markup", () => {
    const node = field("<b>Paris</b> is the capital of France.");

    expect(rangeOffsetsOf(node, selectText(node, "France"))).toEqual({
      start: 24,
      end: 30,
    });
  });

  it("maps a selection spanning a tag boundary", () => {
    const node = field("<b>Paris</b> is here");
    const range = document.createRange();
    range.setStart(node.querySelector("b")?.firstChild as Text, 2);
    range.setEnd(node.lastChild as Text, 3);

    expect(rangeOffsetsOf(node, range)).toEqual({ start: 2, end: 8 });
  });
});

describe("3. putting the caret back", () => {
  it("lands on the character the offset names", () => {
    const node = field("<b>Paris</b> is here");
    placeCaretAt(node, 7);

    const range = caretRangeAt(node, 7);
    expect(range).toBeDefined();
    expect(rangeOffsetsOf(node, range as Range)).toEqual({
      start: 7,
      end: 7,
    });
  });

  it("clamps past the end rather than throwing", () => {
    const node = field("Paris");
    placeCaretAt(node, 99);

    expect(rangeOffsetsOf(node, caretRangeAt(node, 99) as Range)).toEqual({
      start: 5,
      end: 5,
    });
  });

  it("puts the caret in an empty field without complaining", () => {
    const node = field("");

    expect(() => placeCaretAt(node, 0)).not.toThrow();
  });
});

describe("4. putting a selection back", () => {
  // A toolbar action rewrites the field, so bold-then-italic over one phrase
  // would otherwise cost two selections.
  it("re-selects the range across markup", () => {
    const node = field("<b>Paris</b> is here");
    selectRangeIn(node, 2, 8);

    const selection = window.getSelection();
    expect(selection?.rangeCount).toBe(1);
    expect(rangeOffsetsOf(node, selection?.getRangeAt(0) as Range)).toEqual({
      start: 2,
      end: 8,
    });
  });
});
