import type {
  CaptureWarning,
  CaptureWarningKind,
  PageCapture,
} from "@/core/capture";
import { warn } from "@/core/capture";
import type { CardDraft } from "@/core/draft";
import type { GenerationDefaults } from "@/core/generate";
import { generateFromCapture } from "@/core/generate";
import type { DraftStore } from "@/core/ports/types";
import { DEFAULT_SETTINGS } from "@/core/settings";
import { err, ok, type Result } from "@/core/result";
import type { Messenger } from "@/messaging/messenger";
import type { ScriptingPort } from "@/platform/scripting";
import type { SidebarError, SidebarPort } from "@/platform/sidebar";

/**
 * One user gesture, from the click to a stored draft (M5).
 *
 * The gesture is a context-menu entry or a keyboard shortcut; both arrive
 * here as a `CaptureTrigger`, so there is one path to test and one path to
 * get wrong.
 */
export interface CaptureTrigger {
  readonly tabId?: number;
  /**
   * The browser's own copy of the selection, from the menu event. Truncated
   * and plain (5.1), and used only when the page itself cannot be read.
   */
  readonly selectionText?: string;
  readonly pageUrl?: string;
}

/**
 * What a capture starts from when nothing has resolved settings for it — the
 * shipped defaults, which are Anki's own `Default` deck and its own `Basic`
 * (M8; M7 had the same two values as constants here).
 *
 * `Default` rather than an empty deck: every Anki collection ships with one,
 * so a capture is addable without an edit — and if the user has renamed it,
 * the add answers `unknown-deck` and the editor says so with the real deck
 * list already in its selector. The note type is the name heuristic's guess
 * (3.7) and is replaced by Anki's own descriptor the moment the sidebar can
 * reach it (4.6).
 */
export const FALLBACK_DEFAULTS: GenerationDefaults = {
  deck: DEFAULT_SETTINGS.defaultDeck,
  noteType: DEFAULT_SETTINGS.defaultNoteType,
  tags: DEFAULT_SETTINGS.defaultTags,
  fieldMapping: DEFAULT_SETTINGS.fieldMapping,
  sourceUrlStyle: DEFAULT_SETTINGS.sourceUrlStyle,
};

/**
 * How long the sidebar gets to answer before the capture stops waiting on it.
 * Nothing depends on the answer except the report: the draft is stored either
 * way, and a sidebar the user can open themselves is a far smaller problem
 * than a capture that produced nothing.
 */
export const SIDEBAR_OPEN_TIMEOUT_MS = 1_000;

export interface CaptureDeps {
  readonly messenger: Messenger;
  readonly scripting: ScriptingPort;
  readonly sidebar: SidebarPort;
  readonly drafts: DraftStore;
  /** Where a capture waits when a draft is already in flight (7.4). */
  readonly pending: DraftStore;
  /**
   * Resolved per gesture rather than passed as a value (M8): the deck a card
   * starts in depends on the deck the last one went into, and the background
   * is unloaded when idle, so there is nothing to cache it in anyway. Called
   * after `sidebar.open`, so it cannot cost the gesture.
   */
  readonly defaults?: () => GenerationDefaults | Promise<GenerationDefaults>;
  readonly now?: () => Date;
  /** Injected so the timeout is testable without waiting for it. */
  readonly sidebarTimeoutMs?: number;
}

export type CaptureFailureKind =
  /** The gesture named no tab — nothing to read. */
  | "no-tab"
  /** Neither the page nor the event carried any text. */
  | "nothing-captured"
  /** A draft was made and could not be stored, so the sidebar cannot read it. */
  | "not-saved";

export interface CaptureFailure {
  readonly kind: CaptureFailureKind;
  readonly message: string;
}

/** Which slot the capture went into (7.4). */
export type DraftSlot = "draft" | "pending";

export interface CaptureOutcome {
  readonly draft: CardDraft;
  /**
   * `pending` means a draft was already in flight, so this one is waiting for
   * the user to say which they meant rather than having replaced it.
   */
  readonly stored: DraftSlot;
  /** What could not be read, or was read only in part (5.4). */
  readonly warnings: readonly CaptureWarning[];
  /**
   * Whether the sidebar opened. Kept rather than thrown: the draft is stored
   * either way, and a sidebar the user can open themselves is a smaller
   * problem than a capture that produced nothing.
   */
  readonly sidebar: Result<void, SidebarError>;
}

function fromTrigger(
  trigger: CaptureTrigger,
  warnings: readonly CaptureWarning[],
): PageCapture {
  return {
    text: trigger.selectionText ?? "",
    html: "",
    context: "",
    heading: "",
    title: "",
    url: trigger.pageUrl ?? "",
    warnings,
  };
}

/**
 * Ask the page. A tab with no content script is the ordinary case rather than
 * an error — it predates the extension, or the user never triggered a capture
 * in it — so the first `no-receiver` buys one injection and one retry.
 */
async function readPage(
  tabId: number,
  deps: CaptureDeps,
): Promise<Result<PageCapture, CaptureWarning>> {
  const first = await deps.messenger.sendToTab(tabId, {
    type: "capture-selection",
  });
  if (first.ok) return ok(first.value);
  if (first.error.kind !== "no-receiver") {
    return err(warn("no-content-script", first.error.message));
  }

  const injected = await deps.scripting.inject(tabId);
  if (!injected.ok) {
    return err(warn("no-content-script", injected.error.message));
  }

  const second = await deps.messenger.sendToTab(tabId, {
    type: "capture-selection",
  });
  return second.ok
    ? ok(second.value)
    : err(warn("no-content-script", second.error.message));
}

/**
 * Handle one gesture.
 *
 * Deliberately not `async`: the sidebar has to be opened inside the gesture's
 * own task, and an `await` in front of that call forfeits the gesture on both
 * browsers. Everything before `sidebar.open` here is synchronous, and a test
 * holds it that way.
 */
export function captureFromGesture(
  trigger: CaptureTrigger,
  deps: CaptureDeps,
): Promise<Result<CaptureOutcome, CaptureFailure>> {
  const opening = deps.sidebar.open({ tabId: trigger.tabId });

  return finish(trigger, deps, opening);
}

/**
 * Settle, or give up and say so. A promise that never settles would otherwise
 * take the whole capture down with it.
 */
function withTimeout(
  opening: Promise<Result<void, SidebarError>>,
  ms: number,
): Promise<Result<void, SidebarError>> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () =>
        resolve(
          err({
            kind: "open-timed-out",
            message: `the sidebar did not answer within ${ms}ms`,
          }),
        ),
      ms,
    );

    void opening.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        resolve(
          err({
            kind: "open-failed",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
        );
      },
    );
  });
}

async function finish(
  trigger: CaptureTrigger,
  deps: CaptureDeps,
  opening: Promise<Result<void, SidebarError>>,
): Promise<Result<CaptureOutcome, CaptureFailure>> {
  if (trigger.tabId === undefined) {
    return err({
      kind: "no-tab",
      message: "the gesture named no tab to capture from",
    });
  }

  const read = await readPage(trigger.tabId, deps);
  const capture = read.ok ? read.value : fromTrigger(trigger, [read.error]);

  // A blind spot still makes a card when the event carried text (5.4): a
  // degraded card beats no card, provided the degradation is visible.
  const filled =
    capture.text === "" && (trigger.selectionText ?? "") !== ""
      ? { ...capture, text: trigger.selectionText as string }
      : capture;

  if (filled.text.trim() === "") {
    return err({
      kind: "nothing-captured",
      message: read.ok
        ? "nothing was selected on the page"
        : `no content script could read this page: ${read.error.message}`,
    });
  }

  const draft = generateFromCapture(
    filled,
    deps.defaults === undefined ? FALLBACK_DEFAULTS : await deps.defaults(),
    {
      ...(deps.now === undefined ? {} : { now: deps.now }),
    },
  );

  // The background is unloaded when idle, so the draft is durable from the
  // moment it exists — and the sidebar reads it back out rather than being
  // handed it across a gesture.
  //
  // One draft is edited at a time (7.4): with one already in flight this
  // waits behind it, and the sidebar asks which the user meant. A read that
  // failed is not a card anyone is editing, so it is replaced rather than
  // protected.
  const inFlight = await deps.drafts.load();
  const stored: DraftSlot =
    inFlight.ok && inFlight.value !== undefined ? "pending" : "draft";

  const saved = await (stored === "pending" ? deps.pending : deps.drafts).save(
    draft,
  );
  if (!saved.ok) {
    return err({
      kind: "not-saved",
      message: `the draft could not be stored: ${saved.error.message}`,
    });
  }

  // Only now, with the draft safely stored, is the sidebar's answer worth
  // waiting for — and even then, not indefinitely.
  const sidebar = await withTimeout(
    opening,
    deps.sidebarTimeoutMs ?? SIDEBAR_OPEN_TIMEOUT_MS,
  );

  return ok({ draft, stored, warnings: filled.warnings, sidebar });
}

/**
 * What a capture is worth saying out loud (5.4).
 *
 * Deliberately not the draft: a report is for a console and for an issue, so
 * it carries kinds and our own messages and no page content whatsoever. A
 * test pins that.
 */
export interface CaptureReport {
  readonly outcome: "captured" | "failed";
  readonly failure?: CaptureFailure;
  /** Which slot it went into — `pending` means the user has to be asked (7.4). */
  readonly stored?: DraftSlot;
  readonly warnings: readonly CaptureWarningKind[];
  readonly sidebar?: SidebarError;
}

export function describeCapture(
  result: Result<CaptureOutcome, CaptureFailure>,
): CaptureReport {
  if (!result.ok) {
    return { outcome: "failed", failure: result.error, warnings: [] };
  }

  const { warnings, sidebar, stored } = result.value;
  return {
    outcome: "captured",
    stored,
    warnings: warnings.map((warning) => warning.kind),
    ...(sidebar.ok ? {} : { sidebar: sidebar.error }),
  };
}
