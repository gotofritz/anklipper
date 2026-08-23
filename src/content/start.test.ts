import { describe, expect, it } from "vitest";

import { createMessenger } from "@/messaging/messenger";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";

import { startContent } from "./start";

describe("content script", () => {
  it("identifies itself as the page context when pinged", async () => {
    const transport = createFakeRuntimeMessaging();
    startContent({ messaging: transport });

    await expect(
      createMessenger(transport).send({ type: "ping" }),
    ).resolves.toEqual({ ok: true, value: { from: "content" } });
  });

  it("stops answering once it is stopped", async () => {
    const transport = createFakeRuntimeMessaging();

    startContent({ messaging: transport })();

    const reply = await createMessenger(transport).send({ type: "ping" });
    expect(reply.ok === false && reply.error.kind).toBe("no-receiver");
  });
});
