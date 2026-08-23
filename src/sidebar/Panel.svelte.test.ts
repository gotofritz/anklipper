import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import Panel from "./Panel.svelte";
import type { SidebarStatus } from "./connect";

const never = () => new Promise<SidebarStatus>(() => {});

describe("sidebar panel", () => {
  it("names the extension", () => {
    render(Panel, { connect: never });

    expect(
      screen.getByRole("heading", { name: "Anklipper" }),
    ).toBeInTheDocument();
  });

  it("says it is connecting while the background has not answered", () => {
    render(Panel, { connect: never });

    expect(screen.getByRole("status")).toHaveTextContent(/connecting/i);
  });

  it("reports the context that answered once it has", async () => {
    render(Panel, {
      connect: async () => ({ kind: "connected", from: "background" }),
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/background/i);
  });

  it("reports an unreachable background rather than staying blank", async () => {
    render(Panel, {
      connect: async () => ({ kind: "unavailable", reason: "no-receiver" }),
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/no-receiver/);
  });
});
