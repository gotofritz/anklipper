import { describe, expect, it } from "vitest";

import { addDeletion } from "./cloze";
import {
  fieldDeletions,
  findMalformedClozeInField,
  markClozeInField,
  nextFieldOrdinal,
  removeClozeFromField,
  stripClozeFromField,
} from "./field-cloze";
import { fieldText } from "./field-html";

const PLAIN = "Paris is the capital of France.";
/** `Paris` is bold, so a selection over it spans markup (the plan's test 8). */
const MARKED = "<b>Paris</b> is the capital of France.";

function marked(html: string, start: number, end: number, ordinal?: number) {
  const result = markClozeInField(html, {
    start,
    end,
    ...(ordinal === undefined ? {} : { ordinal }),
  });
  if (!result.ok) throw new Error(result.error.message);

  return result.value;
}

describe("1. marking a selection", () => {
  it("wraps plain text the way the model does", () => {
    expect(marked(PLAIN, 0, 5).html).toBe(
      "{{c1::Paris}} is the capital of France.",
    );
  });

  // 10.5's braces are content, not formatting: they go outside the markup so
  // the deletion reads as Anki writes it.
  it("keeps the formatting inside the deletion", () => {
    expect(marked(MARKED, 0, 5).html).toBe(
      "{{c1::<b>Paris</b>}} is the capital of France.",
    );
  });

  it("takes the next ordinal, and groups on request", () => {
    const once = marked(MARKED, 0, 5).html;
    expect(nextFieldOrdinal(once)).toBe(2);

    const twice = marked(once, 32, 38).html;
    expect(fieldText(twice)).toBe(
      "{{c1::Paris}} is the capital of {{c2::France}}.",
    );

    const grouped = marked(once, 32, 38, 1).html;
    expect(fieldText(grouped)).toBe(
      "{{c1::Paris}} is the capital of {{c1::France}}.",
    );
  });

  it("leaves the caret just past the markup it wrote", () => {
    expect(marked(PLAIN, 0, 5).caret).toBe("{{c1::Paris}}".length);
  });

  it("refuses an overlap, and changes nothing", () => {
    const once = marked(MARKED, 0, 5).html;
    const again = markClozeInField(once, { start: 2, end: 8 });

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("cloze-overlap");
  });

  it("refuses an empty range", () => {
    const nothing = markClozeInField(PLAIN, { start: 3, end: 3 });

    expect(nothing.ok).toBe(false);
    if (!nothing.ok) expect(nothing.error.code).toBe("cloze-range-invalid");
  });
});

/**
 * The milestone's test 7, as an equivalence rather than a pair of examples:
 * whatever the mapping does to the markup, the *text* it produces has to be
 * the text the model would have produced from the same selection typed into
 * the source view.
 */
describe("2. parity with source mode", () => {
  const cases: readonly [string, number, number][] = [
    [PLAIN, 0, 5],
    [MARKED, 0, 5],
    [MARKED, 6, 8],
    ["<b>a</b><i>bc</i>d", 1, 3],
    ["one<br>two", 4, 7],
    ["<i>Pa</i>ris &amp; Lyon", 0, 5],
    ["<b>Paris</b> is the <i>capital</i> of France.", 13, 20],
  ];

  it.each(cases)("%s [%d, %d)", (html, start, end) => {
    const inSource = addDeletion(fieldText(html), { start, end });
    expect(inSource.ok).toBe(true);
    if (!inSource.ok) return;

    expect(fieldText(marked(html, start, end).html)).toBe(inSource.value);
  });
});

describe("3. reading what is there", () => {
  it("parses the deletions out of the field's text", () => {
    const once = marked(MARKED, 0, 5).html;

    expect(fieldDeletions(once).map((one) => one.answer)).toEqual(["Paris"]);
    expect(fieldDeletions("nothing here")).toEqual([]);
  });

  it("names markup that does not parse", () => {
    expect(findMalformedClozeInField("{{c1::open")).toBeDefined();
    expect(findMalformedClozeInField(MARKED)).toBeUndefined();
  });

  // A deletion the user split across a bold boundary still parses, because
  // the parse runs on the text and not on the markup.
  it("sees a deletion whose braces are in different tags", () => {
    expect(
      fieldDeletions("<b>{{c1::Pa</b>ris}}").map((one) => one.answer),
    ).toEqual(["Paris"]);
  });
});

describe("4. unmarking", () => {
  it("unwraps one ordinal and keeps the formatting", () => {
    const once = marked(MARKED, 0, 5).html;

    expect(removeClozeFromField(once, 1)).toBe(MARKED);
  });

  it("unwraps every span sharing an ordinal", () => {
    const once = marked(PLAIN, 0, 5).html;
    const grouped = marked(once, 32, 38, 1).html;

    expect(removeClozeFromField(grouped, 1)).toBe(PLAIN);
  });

  it("leaves other ordinals alone", () => {
    const once = marked(PLAIN, 0, 5).html;
    const twice = marked(once, 32, 38).html;

    expect(fieldText(removeClozeFromField(twice, 1))).toBe(
      "Paris is the capital of {{c2::France}}.",
    );
  });

  it("strips the lot, hints included (3.12)", () => {
    const hinted = markClozeInField(PLAIN, { start: 0, end: 5, hint: "city" });
    expect(hinted.ok).toBe(true);
    if (!hinted.ok) return;

    expect(fieldText(hinted.value.html)).toBe(
      "{{c1::Paris::city}} is the capital of France.",
    );
    expect(stripClozeFromField(hinted.value.html)).toBe(PLAIN);
  });
});
