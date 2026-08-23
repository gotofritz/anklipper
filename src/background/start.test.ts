import { describe, expect, it } from "vitest";

import { createMessenger } from "@/messaging/messenger";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";

import { startBackground } from "./start";

describe("background", () => {
  it("answers a ping once it has started", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground({ messaging: transport });

    await expect(
      createMessenger(transport).send({ type: "ping" }),
    ).resolves.toEqual({ ok: true, value: { from: "background" } });
  });

  it("does not answer before it has started", async () => {
    const transport = createFakeRuntimeMessaging();

    const reply = await createMessenger(transport).send({ type: "ping" });

    expect(reply.ok === false && reply.error.kind).toBe("no-receiver");
  });

  it("rejects a message it has no handler for, rather than dropping it", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground({ messaging: transport });

    const reply = await transport.send({ type: "not-a-message" });

    expect(reply).toEqual({
      ok: true,
      value: {
        ok: false,
        error: {
          kind: "unknown-message",
          message: expect.stringContaining("not-a-message"),
        },
      },
    });
  });

  it("stops answering once it is stopped", async () => {
    const transport = createFakeRuntimeMessaging();

    startBackground({ messaging: transport })();

    const reply = await createMessenger(transport).send({ type: "ping" });
    expect(reply.ok === false && reply.error.kind).toBe("no-receiver");
  });
});
