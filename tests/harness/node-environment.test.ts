import { expect, it } from "vitest";

// The node project exists to keep the domain layer honest: anything that
// reaches for the DOM there is a boundary violation, and this fails loudly if
// the two Vitest projects ever collapse into one.
it("runs domain tests without a DOM", () => {
  expect(typeof document).toBe("undefined");
});
