import { expect, it } from "vitest";

// M1's deliverable is the loop, not the config: a failing test has to fail in
// CI, and pass once corrected. Config that has never rejected anything is
// unproven, so this assertion is deliberately wrong on its first commit. The
// red CI run is the artefact; the next commit corrects it.
it("fails the build when an assertion is wrong", () => {
  expect(2 + 2).toBe(5);
});
