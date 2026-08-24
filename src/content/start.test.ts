import { describe, expect, it, vi } from "vitest";

import type { PageCapture } from "@/core/capture";
import { createMessenger } from "@/messaging/messenger";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";

import { startContent } from "./start";

const CAPTURE: PageCapture = {
  text: "Paris is the capital of France.",
  html: "<b>Paris</b> is the capital of France.",
  context: "France is a country in Europe. Paris is the capital of France.",
  heading: "France",
  title: "France — Example",
  url: "https://example.test/france",
  warnings: [],
};

describe("content script", () => {
  it("identifies itself as the page context when pinged", async () => {
    const transport = createFakeRuntimeMessaging();
    startContent({ messaging: transport, extract: () => CAPTURE });

    await expect(
      createMessenger(transport).send({ type: "ping" }),
    ).resolves.toEqual({ ok: true, value: { from: "content" } });
  });

  it("stops answering once it is stopped", async () => {
    const transport = createFakeRuntimeMessaging();

    startContent({ messaging: transport, extract: () => CAPTURE })();

    const reply = await createMessenger(transport).send({ type: "ping" });
    expect(reply.ok === false && reply.error.kind).toBe("no-receiver");
  });

  it("answers a capture request by reading the page", async () => {
    const transport = createFakeRuntimeMessaging();
    const extract = vi.fn(() => CAPTURE);
    startContent({ messaging: transport, extract });

    await expect(
      createMessenger(transport).send({ type: "capture-selection" }),
    ).resolves.toEqual({ ok: true, value: CAPTURE });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  // Nothing reads the page until the user asks for a card there.
  it("does not read the page until it is asked to", () => {
    const extract = vi.fn(() => CAPTURE);

    startContent({ messaging: createFakeRuntimeMessaging(), extract });

    expect(extract).not.toHaveBeenCalled();
  });
});
