import type { CaptureWarning, PageCapture } from "@/core/capture";
import { warn } from "@/core/capture";
import type { CardDraft } from "@/core/draft";
import type { GenerationDefaults } from "@/core/generate";
import { generateFromCapture } from "@/core/generate";
import { createNoteType } from "@/core/note-type";
import type { DraftStore } from "@/core/ports/types";
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
 * Until M8 stores what the user chose, a capture lands on Anki's own Basic
 * with no deck. The empty deck fails validation, which is the editor's cue to
 * ask for one rather than to invent one.
 */
export const FALLBACK_NOTE_TYPE = createNoteType({
  name: "Basic",
  fields: ["Front", "Back"],
});

export const FALLBACK_DEFAULTS: GenerationDefaults = {
  deck: "",
  noteType: FALLBACK_NOTE_TYPE,
};

export interface CaptureDeps {
  readonly messenger: Messenger;
  readonly scripting: ScriptingPort;
  readonly sidebar: SidebarPort;
  readonly drafts: DraftStore;
  readonly defaults?: GenerationDefaults;
  readonly now?: () => Date;
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

export interface CaptureOutcome {
  readonly draft: CardDraft;
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

async function finish(
  trigger: CaptureTrigger,
  deps: CaptureDeps,
  opening: Promise<Result<void, SidebarError>>,
): Promise<Result<CaptureOutcome, CaptureFailure>> {
  const sidebar = await opening;

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
    deps.defaults ?? FALLBACK_DEFAULTS,
    {
      ...(deps.now === undefined ? {} : { now: deps.now }),
    },
  );

  // The background is unloaded when idle, so the draft is durable from the
  // moment it exists — and the sidebar reads it back out rather than being
  // handed it across a gesture.
  const saved = await deps.drafts.save(draft);
  if (!saved.ok) {
    return err({
      kind: "not-saved",
      message: `the draft could not be stored: ${saved.error.message}`,
    });
  }

  return ok({ draft, warnings: filled.warnings, sidebar });
}
