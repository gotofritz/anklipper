import { expect, it } from "vitest";

// M1's deliverable is the loop, not the config: a failing test has to fail in
// CI, and pass once corrected. The previous commit asserted 2 + 2 === 5 and
// turned both CI jobs red — the build job's `pnpm test`, and the lint job's
// Vitest pre-commit hook. Run 32651929991 is the artefact. Corrected here.
it("fails the build when an assertion is wrong", () => {
  expect(2 + 2).toBe(4);
});
