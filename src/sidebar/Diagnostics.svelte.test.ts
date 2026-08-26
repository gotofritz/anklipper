import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import type { ComponentProps } from "svelte";
import { describe, expect, it, vi } from "vitest";

import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import type {
  AnkiDiagnostics,
  AnkiError,
  AnkiErrorKind,
} from "@/core/ports/types";
import { BASIC } from "@/fixtures/note-types";

import Diagnostics from "./Diagnostics.svelte";
import { ankiErrorCopy } from "./error-copy";

const ORIGIN = "moz-extension://8b7c1f2e-0a3d-4c5b-9e6f-1a2b3c4d5e6f";

const FACTS: AnkiDiagnostics = {
  endpoint: "http://127.0.0.1:8765",
  origin: ORIGIN,
  apiKeyConfigured: false,
  timeoutMs: 5_000,
};

/** Every cause M4 can report, so none of them may fall through (test 1). */
const ANKI_KINDS: readonly AnkiErrorKind[] = [
  "anki-not-running",
  "addon-missing",
  "permission-missing",
  "api-key-required",
  "malformed-response",
  "duplicate-note",
  "unknown-deck",
  "unknown-note-type",
  "unknown-field",
  "timeout",
  "api-error",
];

type DiagnosticsProps = ComponentProps<typeof Diagnostics>;

function renderDiagnostics(
  props: Partial<DiagnosticsProps> & { failWith?: AnkiError } = {},
) {
  const { failWith, ...rest } = props;
  const anki = createFakeAnkiClient({
    decks: ["Geography"],
    noteTypes: [BASIC],
    apiVersion: 6,
  });
  if (failWith !== undefined) anki.failWith(failWith);

  return {
    anki,
    ...render(Diagnostics, {
      anki,
      describe: async () => FACTS,
      ...rest,
    }),
  };
}

const failure = (kind: AnkiErrorKind): AnkiError => ({
  kind,
  message: "Anki said something",
});

/** The disclosure the whole report lives in. `<details>` is a `group`. */
const report = (): HTMLElement => screen.getByRole("group");

/** The check runs on mount, so every case waits for its first answer. */
async function settled(): Promise<HTMLElement> {
  const group = report();
  await waitFor(() => {
    expect(group.textContent).not.toMatch(/checking/i);
  });

  return group;
}

describe("what the report says before anything has answered", () => {
  it("says the connection has not been checked, not that it failed", () => {
    const { container } = renderDiagnostics();

    expect(container.textContent).toMatch(/checking/i);
    expect(container.textContent).not.toMatch(/not connected/i);
  });
});

describe("a connection that works", () => {
  it("says so, and names the version Anki reported", async () => {
    const { container } = renderDiagnostics();

    await settled();

    expect(container.textContent).toMatch(/connected/i);
    expect(container.textContent).toContain("6");
  });

  it("stays out of the way rather than opening over the card", async () => {
    renderDiagnostics();

    expect(await settled()).not.toHaveAttribute("open");
  });
});

describe("a connection that does not work", () => {
  it("opens itself rather than waiting to be found", async () => {
    renderDiagnostics({ failWith: failure("anki-not-running") });

    expect(await settled()).toHaveAttribute("open");
  });

  /** Test 1: every cause gets its own words, and its own next action. */
  it("gives each cause its own cause and its own fix", async () => {
    const seen = new Set<string>();

    for (const kind of ANKI_KINDS) {
      const { container, unmount } = renderDiagnostics({
        failWith: failure(kind),
      });
      await settled();

      const copy = ankiErrorCopy(failure(kind));
      expect(container.textContent).toContain(copy.cause);
      expect(container.textContent).toContain(copy.action);
      expect(seen.has(copy.cause)).toBe(false);
      seen.add(copy.cause);

      unmount();
    }
  });

  it("names the endpoint it tried", async () => {
    const { container } = renderDiagnostics({
      failWith: failure("anki-not-running"),
    });

    await settled();

    expect(container.textContent).toContain(FACTS.endpoint);
  });

  it("reports whether a key is set, and never a key", async () => {
    const { container } = renderDiagnostics({
      describe: async () => ({ ...FACTS, apiKeyConfigured: true }),
      failWith: failure("api-key-required"),
    });

    await settled();

    expect(container.textContent).toMatch(/key/i);
    expect(container.textContent).not.toContain("s3cret");
  });

  /** Test 3: the fix is made elsewhere, and the flow picks it up in place. */
  it("connects on a re-check once the cause is gone, without a reload", async () => {
    const { anki, container } = renderDiagnostics({
      failWith: failure("anki-not-running"),
    });
    await settled();

    anki.failWith(undefined);
    await fireEvent.click(screen.getByRole("button", { name: /check again/i }));

    await waitFor(() => {
      expect(container.textContent).not.toContain(
        ankiErrorCopy(failure("anki-not-running")).cause,
      );
    });
    expect(container.textContent).toMatch(/connected/i);
  });
});

/**
 * 9.6 and test 2a. Firefox MV3 grants no host permission at install, so the
 * first thing a fresh install is missing is the browser's leave — not
 * anything about Anki, which the user cannot act on and may have running
 * perfectly well.
 */
describe("the host permission", () => {
  it("offers the ask, and not a retry that could never work (9.7)", async () => {
    renderDiagnostics({
      failWith: failure("permission-missing"),
      grantAccess: async () => true,
    });
    await settled();

    expect(
      screen.getByRole("button", { name: /allow access to anki/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check again/i })).toBeNull();
  });

  it("blames the browser rather than reporting a fault in Anki", async () => {
    const { container } = renderDiagnostics({
      failWith: failure("permission-missing"),
      grantAccess: async () => true,
    });

    await settled();

    expect(container.textContent).not.toMatch(/start anki/i);
    expect(container.textContent).not.toMatch(/install the ankiconnect/i);
  });

  it("connects once the browser has granted it", async () => {
    const anki = createFakeAnkiClient({ apiVersion: 6 });
    anki.failWith({ kind: "permission-missing", message: "not granted" });
    const { container } = render(Diagnostics, {
      anki,
      describe: async () => FACTS,
      grantAccess: async () => {
        anki.failWith(undefined);
        return true;
      },
    });
    await settled();

    await fireEvent.click(
      screen.getByRole("button", { name: /allow access to anki/i }),
    );

    await waitFor(() => {
      expect(container.textContent).not.toMatch(/not connected/i);
    });
    expect(container.textContent).toMatch(/connected/i);
  });

  it("keeps the message and the button when the user declines", async () => {
    const { container } = renderDiagnostics({
      failWith: failure("permission-missing"),
      grantAccess: async () => false,
    });
    await settled();

    await fireEvent.click(
      screen.getByRole("button", { name: /allow access to anki/i }),
    );

    expect(
      await screen.findByRole("button", { name: /allow access to anki/i }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain(
      ankiErrorCopy(failure("permission-missing")).cause,
    );
  });

  it("falls back to a re-check where nothing can ask", async () => {
    renderDiagnostics({ failWith: failure("permission-missing") });
    await settled();

    expect(
      screen.getByRole("button", { name: /check again/i }),
    ).toBeInTheDocument();
  });
});

describe("an API key AnkiConnect is asking for", () => {
  it("sends the user to the field that holds it", async () => {
    const openSettings = vi.fn();
    renderDiagnostics({
      failWith: failure("api-key-required"),
      openSettings,
    });
    await settled();

    await fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(openSettings).toHaveBeenCalled();
  });

  it("offers no settings button where there is no page to open", async () => {
    renderDiagnostics({ failWith: failure("api-key-required") });

    await settled();

    expect(screen.queryByRole("button", { name: /settings/i })).toBeNull();
  });
});

/** Test 2 and 9.2a, through the report rather than the component in isolation. */
describe("the manual fallback, from diagnostics", () => {
  it("offers the allowlist edit with this installation's own origin", async () => {
    const { container } = renderDiagnostics({
      failWith: failure("anki-not-running"),
    });

    await settled();

    expect(container.textContent).toContain("webCorsOriginList");
    expect(container.textContent).toContain(ORIGIN);
  });

  it("does not offer it while the connection is working", async () => {
    const { container } = renderDiagnostics();

    await settled();

    expect(container.textContent).not.toContain("webCorsOriginList");
  });

  /** Test 2d, over everything this view can render. */
  it("never suggests a wildcard, whatever went wrong", async () => {
    for (const kind of ANKI_KINDS) {
      const { container, unmount } = renderDiagnostics({
        failWith: failure(kind),
        grantAccess: async () => true,
        openSettings: () => {},
      });
      await settled();

      expect(container.textContent).not.toContain("*");
      unmount();
    }
  });
});

/**
 * Test 8. A user who has connected once does not need to be walked through
 * setting it up again — Anki closing is a fault report, not a first run.
 */
describe("once the connection has succeeded", () => {
  it("walks a fresh install through what it needs", async () => {
    const { container } = renderDiagnostics({
      failWith: failure("anki-not-running"),
    });

    await settled();

    expect(container.textContent).toMatch(/before Anklipper can add cards/i);
  });

  it("does not walk through it again when Anki is closed mid-session", async () => {
    const { anki, container } = renderDiagnostics();
    await settled();

    anki.failWith(failure("anki-not-running"));
    await fireEvent.click(screen.getByRole("button", { name: /check again/i }));

    await waitFor(() => {
      expect(container.textContent).toMatch(/not connected/i);
    });
    expect(container.textContent).not.toMatch(
      /before Anklipper can add cards/i,
    );
    expect(container.textContent).toContain(
      ankiErrorCopy(failure("anki-not-running")).cause,
    );
  });
});
