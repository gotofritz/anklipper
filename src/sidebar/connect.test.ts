import { describe, expect, it } from "vitest";

import { createMessenger } from "@/messaging/messenger";
import { createFakeRuntimeMessaging } from "@/platform/fakes/fake-runtime-messaging";
import { startBackground } from "@/background/start";

import { pingBackground } from "./connect";

describe("sidebar connection", () => {
  it("reports the context that answered", async () => {
    const transport = createFakeRuntimeMessaging();
    startBackground({ messaging: transport });

    await expect(pingBackground(createMessenger(transport))).resolves.toEqual({
      kind: "connected",
      from: "background",
    });
  });

  // The background is an event page on Firefox and a service worker on
  // Chrome; both are unloaded when idle. A sidebar that crashed on the first
  // unanswered ping would be unusable.
  it("reports a background that did not answer as unavailable", async () => {
    const status = await pingBackground(
      createMessenger(createFakeRuntimeMessaging()),
    );

    expect(status).toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("no-receiver"),
    });
  });
});
