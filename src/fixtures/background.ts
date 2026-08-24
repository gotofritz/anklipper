import type { BackgroundDeps } from "@/background/start";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import { ok } from "@/core/result";
import type { RuntimeMessagingPort } from "@/platform/runtime-messaging";

/**
 * The ports `startBackground` needs, stubbed. Tests that are about something
 * else — the sidebar's connection check, say — take this and override the one
 * port they care about.
 */
export function backgroundDeps(
  messaging: RuntimeMessagingPort,
  overrides: Partial<BackgroundDeps> = {},
): BackgroundDeps {
  return {
    messaging,
    menus: {
      create: async () => {},
      removeAll: async () => {},
      onClicked: () => () => {},
    },
    commands: { onCommand: () => () => {} },
    scripting: { inject: async () => ok(undefined) },
    sidebar: { open: async () => ok(undefined) },
    drafts: createFakeDraftStore(),
    ...overrides,
  };
}
