import { render, screen } from "@testing-library/svelte";
import { expect, it } from "vitest";

import Greeting from "@/fixtures/Greeting.svelte";

it("renders a Svelte component and queries its text", () => {
  render(Greeting, { name: "Anki" });

  expect(screen.getByText("Hello, Anki!")).toBeInTheDocument();
});
