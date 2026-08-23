import { expect, it } from "vitest";

import { ALIAS_PROBE } from "@/fixtures/alias-probe";

it("resolves the @/ alias under test", () => {
  expect(ALIAS_PROBE).toBe("resolved via @/");
});
