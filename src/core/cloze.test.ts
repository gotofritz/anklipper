import { describe, expect, it } from "vitest";

import {
  addDeletion,
  findMalformedCloze,
  parseCloze,
  removeDeletionAt,
  removeDeletionsByOrdinal,
  renumberDeletions,
  stripCloze,
} from "./cloze";
import { isErr, isOk } from "./result";

/** `addDeletion` returns a Result; tests that expect success want the text. */
function marked(
  text: string,
  request: Parameters<typeof addDeletion>[1],
): string {
  const result = addDeletion(text, request);
  if (isErr(result))
    throw new Error(`expected a marked field: ${result.error.code}`);
  return result.value;
}

function rangeOf(text: string, needle: string): { start: number; end: number } {
  const start = text.indexOf(needle);
  if (start < 0) throw new Error(`${needle} is not in ${text}`);
  return { start, end: start + needle.length };
}

describe("addDeletion", () => {
  it("wraps the range in {{c1::…}}, and the next range in {{c2::…}} (3.9)", () => {
    const one = marked("Paris is the capital of France", {
      ...rangeOf("Paris is the capital of France", "Paris"),
    });

    expect(one).toBe("{{c1::Paris}} is the capital of France");

    const two = marked(one, { ...rangeOf(one, "France") });

    expect(two).toBe("{{c1::Paris}} is the capital of {{c2::France}}");
  });

  it("reuses an ordinal on request, grouping both spans under one cN (3.9)", () => {
    const one = marked("red and blue", { ...rangeOf("red and blue", "red") });
    const two = marked(one, { ...rangeOf(one, "blue"), ordinal: 1 });

    expect(two).toBe("{{c1::red}} and {{c1::blue}}");
    expect(parseCloze(two).map((deletion) => deletion.ordinal)).toEqual([1, 1]);
  });

  it("records a hint as {{c1::answer::hint}}", () => {
    const text = marked("the capital is Paris", {
      ...rangeOf("the capital is Paris", "Paris"),
      hint: "city",
    });

    expect(text).toBe("the capital is {{c1::Paris::city}}");
  });

  it("rejects a range overlapping an existing deletion (3.10)", () => {
    const one = marked("Paris is the capital", {
      ...rangeOf("Paris is the capital", "Paris"),
    });
    const result = addDeletion(one, { ...rangeOf(one, "c1::Paris") });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("cloze-overlap");
      expect(result.error.ordinal).toBe(1);
    }
  });

  it("rejects an empty or out-of-bounds range", () => {
    for (const range of [
      { start: 2, end: 2 },
      { start: 4, end: 1 },
      { start: -1, end: 3 },
      { start: 0, end: 99 },
    ]) {
      const result = addDeletion("Paris", range);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe("cloze-range-invalid");
    }
  });

  it("rejects an ordinal Anki cannot represent", () => {
    const result = addDeletion("Paris", { start: 0, end: 5, ordinal: 0 });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("cloze-ordinal-invalid");
  });

  it("refuses to mark a field whose existing markup does not parse (3.11)", () => {
    const result = addDeletion("half open {{c1::answer and more", {
      start: 0,
      end: 4,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("cloze-markup-malformed");
  });

  it("leaves braces in captured text alone when they round-trip (3.11)", () => {
    const source = "the literal {{ and }} braces";
    const text = marked(source, { ...rangeOf(source, "braces") });

    expect(text).toBe("the literal {{ and }} {{c1::braces}}");
    expect(parseCloze(text)).toHaveLength(1);
  });

  it("reports a conflict when the resulting markup would not re-parse (3.11)", () => {
    const result = addDeletion("answer}} tail", { start: 0, end: 8 });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe("cloze-markup-unstable");
  });

  it("does not mutate the text it was given (3.3)", () => {
    const source = "Paris is the capital";
    marked(source, { start: 0, end: 5 });

    expect(source).toBe("Paris is the capital");
  });
});

describe("parseCloze", () => {
  it("returns every deletion with its ordinal, span, and hint", () => {
    const text = "{{c1::Paris::city}} is in {{c2::France}}";

    expect(parseCloze(text)).toEqual([
      {
        ordinal: 1,
        start: 0,
        end: 19,
        answer: "Paris",
        hint: "city",
      },
      {
        ordinal: 2,
        start: 26,
        end: 40,
        answer: "France",
      },
    ]);
  });

  it("finds nothing in plain text", () => {
    expect(parseCloze("Paris is the capital")).toEqual([]);
  });
});

describe("findMalformedCloze", () => {
  it("names markup it cannot parse rather than reinterpreting it", () => {
    expect(findMalformedCloze("{{c1::open")?.code).toBe(
      "cloze-markup-malformed",
    );
    expect(findMalformedCloze("{{c0::zero}}")?.code).toBe(
      "cloze-markup-malformed",
    );
  });

  it("passes well-formed markup and plain braces", () => {
    expect(findMalformedCloze("{{c1::Paris}} and {{ braces }}")).toBe(
      undefined,
    );
  });
});

describe("removing deletions", () => {
  const text = "{{c1::one}} {{c2::two}} {{c3::three}}";

  it("removes by ordinal and leaves a gap; the rest keep their numbers (3.10)", () => {
    const without = removeDeletionsByOrdinal(text, 2);

    expect(without).toBe("{{c1::one}} two {{c3::three}}");
    expect(parseCloze(without).map((deletion) => deletion.ordinal)).toEqual([
      1, 3,
    ]);
  });

  it("removes every span sharing the ordinal", () => {
    expect(removeDeletionsByOrdinal("{{c1::a}} {{c1::b}} {{c2::c}}", 1)).toBe(
      "a b {{c2::c}}",
    );
  });

  it("removes the deletion at a position, dropping its hint", () => {
    const at = text.indexOf("two");

    expect(removeDeletionAt(text, at)).toBe("{{c1::one}} two {{c3::three}}");
    expect(removeDeletionAt("{{c1::Paris::city}}", 3)).toBe("Paris");
  });

  it("leaves the text alone when nothing matches", () => {
    expect(removeDeletionsByOrdinal(text, 9)).toBe(text);
    expect(removeDeletionAt(text, text.indexOf(" "))).toBe(text);
  });
});

describe("renumberDeletions", () => {
  it("closes gaps only when asked, and preserves grouping (3.10)", () => {
    expect(renumberDeletions("{{c1::a}} {{c3::b}} {{c3::c}} {{c7::d}}")).toBe(
      "{{c1::a}} {{c2::b}} {{c2::c}} {{c3::d}}",
    );
  });

  it("keeps hints", () => {
    expect(renumberDeletions("{{c4::a::hint}}")).toBe("{{c1::a::hint}}");
  });
});

describe("stripCloze", () => {
  it("unwraps every deletion back to its answer", () => {
    expect(stripCloze("{{c1::Paris::city}} is in {{c2::France}}")).toBe(
      "Paris is in France",
    );
  });

  it("leaves plain text untouched", () => {
    expect(stripCloze("Paris is in France")).toBe("Paris is in France");
  });
});

describe("addDeletion result shape", () => {
  it("succeeds with a Result rather than throwing", () => {
    expect(isOk(addDeletion("Paris", { start: 0, end: 5 }))).toBe(true);
  });
});
