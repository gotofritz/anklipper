import { describe, expect, it } from "vitest";

import {
  applyMark,
  spliceField,
  clearMarks,
  editField,
  escapeFieldHtml,
  fieldFromText,
  fieldText,
  hasMarkOver,
  isFieldEmpty,
  parseField,
  sanitizeFieldHtml,
  serializeField,
  toggleMark,
} from "./field-html";

describe("1. plain text in, field HTML out", () => {
  it("escapes what would otherwise be markup", () => {
    expect(escapeFieldHtml('a < b & c > "d"')).toBe(
      "a &lt; b &amp; c &gt; &quot;d&quot;",
    );
  });

  it("turns line breaks into the break Anki renders", () => {
    expect(fieldFromText("one\ntwo")).toBe("one<br>two");
  });

  // 10.3: what the extractor pulls off the page is plain text, and a page
  // that contains a tag must not become one in the user's collection.
  it("does not let captured text become markup", () => {
    expect(fieldFromText("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});

describe("2. field HTML in, plain text out", () => {
  it("drops the tags and decodes the entities", () => {
    expect(fieldText("<b>Paris</b> &amp; <i>Lyon</i>")).toBe("Paris & Lyon");
  });

  it("reads a break as a line break", () => {
    expect(fieldText("one<br>two")).toBe("one\ntwo");
  });

  it("reads a block boundary as a line break", () => {
    expect(fieldText("<div>one</div><div>two</div>")).toBe("one\ntwo");
  });

  it("calls a field with nothing but markup empty", () => {
    expect(isFieldEmpty("<br>")).toBe(true);
    expect(isFieldEmpty("<b> </b>")).toBe(true);
    expect(isFieldEmpty("<b>x</b>")).toBe(false);
  });
});

describe("3. sanitising (10.5)", () => {
  // The hostile fixture the milestone's done-when asks for.
  it("strips scripts, handlers, styles, and embeds", () => {
    const hostile = [
      "<script>fetch('https://evil.test')</script>",
      '<b onclick="steal()">bold</b>',
      '<i style="position:fixed">italic</i>',
      '<iframe src="https://evil.test"></iframe>',
      "<img src=x onerror=alert(1)>",
      '<a href="javascript:alert(1)">link</a>',
      "<style>body{display:none}</style>",
    ].join("");

    const clean = sanitizeFieldHtml(hostile);

    expect(clean).toBe("<b>bold</b><i>italic</i>link");
    expect(clean).not.toMatch(/script|onclick|onerror|style|iframe|img|href/i);
  });

  it("keeps the inline formatting Anki's own editor produces", () => {
    expect(
      sanitizeFieldHtml("<b>b</b><i>i</i><u>u</u><sub>s</sub><sup>p</sup>"),
    ).toBe("<b>b</b><i>i</i><u>u</u><sub>s</sub><sup>p</sup>");
  });

  it("normalises the tags a browser prefers to the ones Anki writes", () => {
    expect(sanitizeFieldHtml("<strong>a</strong><em>b</em>")).toBe(
      "<b>a</b><i>b</i>",
    );
  });

  it("drops a tag it does not know but keeps what it wrapped", () => {
    expect(sanitizeFieldHtml('<span class="x">kept</span>')).toBe("kept");
  });

  it("throws away a script's content, not only its tags", () => {
    expect(sanitizeFieldHtml("<script>evil()</script>after")).toBe("after");
  });

  it("is idempotent, so a round trip through the editor loses nothing", () => {
    const once = sanitizeFieldHtml("<div><b>a<i>b</i></b>c</div><div>d</div>");
    expect(sanitizeFieldHtml(once)).toBe(once);
  });

  it("escapes a stray bracket rather than guessing at a tag", () => {
    expect(sanitizeFieldHtml("5 < 6")).toBe("5 &lt; 6");
  });
});

describe("4. runs, which is what the mapping is built on", () => {
  it("carries the marks that are open over each stretch of text", () => {
    expect(parseField("<b>Pa<i>ri</i>s</b>!")).toEqual([
      { text: "Pa", marks: ["b"] },
      { text: "ri", marks: ["b", "i"] },
      { text: "s", marks: ["b"] },
      { text: "!", marks: [] },
    ]);
  });

  it("round-trips back to the same markup", () => {
    const html = "<b>Pa<i>ri</i>s</b>!";
    expect(serializeField(parseField(html))).toBe(html);
  });
});

describe("5. marks over a text range", () => {
  it("bolds exactly the selected characters", () => {
    expect(applyMark("Paris is France", 0, 5, "b")).toBe(
      "<b>Paris</b> is France",
    );
  });

  // Tags are always nested in `INLINE_MARKS` order, whatever order they were
  // applied in. Anki renders both the same, and one canonical shape is what
  // keeps a second pass from rewriting the field.
  it("bolds across markup that is already there", () => {
    expect(applyMark("a<i>bc</i>d", 1, 3, "b")).toBe("a<b><i>bc</i></b>d");
  });

  it("says whether the whole range already carries the mark", () => {
    expect(hasMarkOver("<b>Paris</b> is", 0, 5, "b")).toBe(true);
    expect(hasMarkOver("<b>Paris</b> is", 0, 8, "b")).toBe(false);
    expect(hasMarkOver("Paris", 2, 2, "b")).toBe(false);
  });

  it("toggles off what is already on", () => {
    expect(toggleMark("<b>Paris</b>", 0, 5, "b")).toBe("Paris");
    expect(toggleMark("Paris", 0, 5, "b")).toBe("<b>Paris</b>");
  });

  it("clears every mark in the range and leaves the rest alone", () => {
    expect(clearMarks("<b>ab</b><i>cd</i>", 1, 3)).toBe("<b>a</b>bc<i>d</i>");
  });
});

describe("6. splicing text in at text offsets", () => {
  it("inserts without disturbing the marks around it", () => {
    expect(editField("<b>Paris</b>", [{ start: 5, end: 5, insert: "!" }])).toBe(
      "<b>Paris!</b>",
    );
  });

  it("can insert text that carries no marks at all", () => {
    expect(
      editField("<b>Paris</b>", [
        { start: 0, end: 0, insert: "[", marks: [] },
        { start: 5, end: 5, insert: "]", marks: [] },
      ]),
    ).toBe("[<b>Paris</b>]");
  });

  it("deletes a range and closes the gap", () => {
    expect(editField("a<b>bcd</b>e", [{ start: 2, end: 3, insert: "" }])).toBe(
      "a<b>bd</b>e",
    );
  });
});

describe("7. dropping one field's markup into another", () => {
  it("keeps the formatting of what is pasted in", () => {
    expect(spliceField("Paris is here", 6, 8, "<b>was</b>")).toBe(
      "Paris <b>was</b> here",
    );
  });

  it("replaces a selection", () => {
    expect(spliceField("<b>Paris</b> is here", 0, 5, "Lyon")).toBe(
      "Lyon is here",
    );
  });

  it("inserts into an empty field", () => {
    expect(spliceField("", 0, 0, "<i>new</i>")).toBe("<i>new</i>");
  });
});
