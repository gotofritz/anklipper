import type { ClozeDeletion } from "@/core/cloze";
import {
  addDeletion,
  nextClozeOrdinal,
  parseCloze,
  removeDeletionsByOrdinal,
} from "@/core/cloze";
import type { CardDraft, DraftIssue } from "@/core/draft";
import {
  addTag as addTagTo,
  convertToCloze as convertToClozeOn,
  noteTypeKindOf,
  refreshNoteType,
  removeTag as removeTagFrom,
  setDeck as setDeckOn,
  setField as setFieldOn,
  setNoteType as setNoteTypeOn,
} from "@/core/draft";
import type { NoteType } from "@/core/note-type";
import { primaryFieldOf } from "@/core/note-type";
import type {
  AnkiClient,
  AnkiError,
  DraftStore,
  DraftStoreError,
  NoteId,
} from "@/core/ports/types";
import { validateDraft } from "@/core/validate";

import { clozeIssueCopy, draftIssueCopy } from "./error-copy";

/**
 * The one layer between the editor's components and the ports (6.2).
 *
 * Components render this and hand back intents; every transition of the draft
 * itself goes through M3's pure functions (6.1), so the note-type remap rule
 * and the cloze grammar exist in exactly one place. Nothing here imports
 * `browser.*` or the AnkiConnect adapter — it is handed an `AnkiClient`, which
 * in tests is M3's in-memory fake.
 */

/**
 * Every asynchronous read is one of four things, and they are not
 * interchangeable (6.3): an empty deck list and a closed Anki look identical
 * once both are rendered as "nothing here".
 */
export type Resource<T> =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly value: T }
  | { readonly kind: "failed"; readonly error: AnkiError };

export type Submission =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "added"; readonly noteId: NoteId }
  | { readonly kind: "failed"; readonly error: AnkiError }
  /** The draft did not validate, so nothing was sent. */
  | { readonly kind: "refused" };

export interface EditorDeps {
  readonly anki: AnkiClient;
  readonly draft: CardDraft;
  /**
   * Where every edit goes (7.1). The draft is durable from the moment it
   * exists, and an edit is part of it: Firefox's sidebar goes with the window
   * and the background is unloaded when idle, so work held only in memory is
   * lost without the user having done anything wrong.
   */
  readonly drafts: DraftStore;
  /** How long an edit waits before it is written. */
  readonly debounceMs?: number;
  /**
   * The card reached Anki (7.3). The slot it was held in is the panel's to
   * hand over, since a capture may already be waiting behind it (7.4).
   */
  readonly onAdded?: (noteId: NoteId) => void | Promise<void>;
}

/**
 * Long enough that a sentence typed at speed is one write, short enough that
 * a sidebar closed straight after an edit has already written it. Both halves
 * of M7's risk: every keystroke is wasteful, and on blur loses the last field.
 */
export const SAVE_DEBOUNCE_MS = 400;

export interface EditorModel {
  readonly draft: CardDraft;
  readonly decks: Resource<readonly string[]>;
  readonly noteTypes: Resource<readonly NoteType[]>;
  /** `true` means Anki already holds a note with this first field (4.4). */
  readonly duplicate: Resource<boolean>;
  readonly submission: Submission;
  /** Everything the card model finds wrong, live (3.4). */
  readonly issues: readonly DraftIssue[];
  /** Names for the selectors: what Anki reported, plus the draft's own. */
  readonly deckOptions: readonly string[];
  readonly noteTypeOptions: readonly string[];
  /** 6.7: read off the note type, never matched on its name. */
  readonly isCloze: boolean;
  /** The field deletions live in, on a cloze note type. */
  readonly clozeField: string | undefined;
  readonly deletions: readonly ClozeDeletion[];
  readonly nextOrdinal: number;
  /** A transition a pure function refused, already in the user's words. */
  readonly notice: string | undefined;
  /** Why the last edit was not persisted, if it was not (7.1). */
  readonly saveError: DraftStoreError | undefined;
  /** The note type a captured card converts to (3.12), once Anki has named one. */
  readonly clozeTarget: NoteType | undefined;
  load(): Promise<void>;
  checkDuplicate(): Promise<void>;
  setDeck(deck: string): void;
  setNoteType(name: string): void;
  setField(field: string, value: string): void;
  addTag(tag: string): void;
  removeTag(tag: string): void;
  /** Returns where to leave the caret, or `undefined` if it was refused. */
  markCloze(start: number, end: number, ordinal?: number): number | undefined;
  removeCloze(ordinal: number): void;
  /** Basic → Cloze, carrying the selection across (3.12). */
  convertToCloze(): void;
  /** Write an outstanding edit now — before a submit, or before the sidebar closes. */
  flush(): Promise<void>;
  /** Drop an outstanding edit and stop the clock. The sidebar is going away. */
  stop(): void;
  submit(): Promise<void>;
}

function firstFieldValue(draft: CardDraft): string {
  const primary = primaryFieldOf(draft.noteType);
  return primary === undefined ? "" : (draft.fields[primary] ?? "");
}

function withCurrent(
  names: readonly string[],
  current: string,
): readonly string[] {
  return names.includes(current) ? names : [current, ...names];
}

export function createEditorModel(deps: EditorDeps): EditorModel {
  // `$state.raw`, not `$state`: a draft is an immutable value replaced whole
  // on every transition (3.3), so a deep proxy would cost something and buy
  // nothing — and would hand the port a proxy instead of the draft.
  let draft = $state.raw<CardDraft>(deps.draft);
  let decks = $state.raw<Resource<readonly string[]>>({ kind: "idle" });
  let noteTypes = $state.raw<Resource<readonly NoteType[]>>({ kind: "idle" });
  let duplicate = $state.raw<Resource<boolean>>({ kind: "idle" });
  let submission = $state.raw<Submission>({ kind: "idle" });
  let notice = $state.raw<string | undefined>(undefined);
  let saveError = $state.raw<DraftStoreError | undefined>(undefined);

  /** Latest-wins: an edit can outrun the duplicate check it started. */
  let duplicateRun = 0;

  const debounceMs = deps.debounceMs ?? SAVE_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unwritten: CardDraft | undefined;
  /**
   * The card is in Anki and the slot has been handed over (7.3). A write
   * landing after that would put the card that was just added straight back
   * into it.
   */
  let done = false;

  function cancel(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  /** Debounced, per M7's risk: not every keystroke, and not only on blur. */
  function persist(next: CardDraft): void {
    if (done) return;
    unwritten = next;
    cancel();
    timer = setTimeout(() => void write(), debounceMs);
  }

  async function write(): Promise<void> {
    cancel();
    const outstanding = unwritten;
    unwritten = undefined;
    if (outstanding === undefined || done) return;

    const saved = await deps.drafts.save(outstanding);
    // Silently failing to save is the one failure the user cannot see coming:
    // everything still looks edited, and none of it is anywhere.
    saveError = saved.ok ? undefined : saved.error;
  }

  /**
   * The single place the draft is replaced. A duplicate warning is about one
   * first field, so it stops applying the moment that field changes — showing
   * it against text the user has already replaced would be worse than showing
   * nothing.
   */
  function apply(next: CardDraft): void {
    const changed = firstFieldValue(next) !== firstFieldValue(draft);
    draft = next;
    persist(next);
    notice = undefined;
    // The last attempt was about the draft as it was; an edit makes both its
    // verdict and its error stale, and re-arms the add button.
    submission = { kind: "idle" };
    if (changed) duplicate = { kind: "idle" };
  }

  function refuse(issue: DraftIssue): void {
    notice = draftIssueCopy(issue);
  }

  function clozeFieldOf(): string | undefined {
    return noteTypeKindOf(draft) === "cloze"
      ? primaryFieldOf(draft.noteType)
      : undefined;
  }

  function clozeText(): string {
    const field = clozeFieldOf();
    return field === undefined ? "" : (draft.fields[field] ?? "");
  }

  /**
   * The note type a Basic capture converts to (3.12). Anki's own list, and
   * its own reading of the flavour (4.6) — never a name matched here.
   */
  function clozeTargetOf(): NoteType | undefined {
    if (noteTypeKindOf(draft) === "cloze") return undefined;
    if (noteTypes.kind !== "ready") return undefined;

    return noteTypes.value.find((one) => one.kind === "cloze");
  }

  return {
    get draft() {
      return draft;
    },
    get decks() {
      return decks;
    },
    get noteTypes() {
      return noteTypes;
    },
    get duplicate() {
      return duplicate;
    },
    get submission() {
      return submission;
    },
    get issues() {
      return validateDraft(draft);
    },
    get deckOptions() {
      return withCurrent(decks.kind === "ready" ? decks.value : [], draft.deck);
    },
    get noteTypeOptions() {
      return withCurrent(
        noteTypes.kind === "ready"
          ? noteTypes.value.map((one) => one.name)
          : [],
        draft.noteType.name,
      );
    },
    get isCloze() {
      return noteTypeKindOf(draft) === "cloze";
    },
    get clozeField() {
      return clozeFieldOf();
    },
    get deletions() {
      return parseCloze(clozeText());
    },
    get nextOrdinal() {
      return nextClozeOrdinal(parseCloze(clozeText()));
    },
    get notice() {
      return notice;
    },
    get saveError() {
      return saveError;
    },
    get clozeTarget() {
      return clozeTargetOf();
    },

    async load(): Promise<void> {
      decks = { kind: "loading" };
      noteTypes = { kind: "loading" };

      const [deckNames, models] = await Promise.all([
        deps.anki.deckNames(),
        deps.anki.noteTypes(),
      ]);

      decks = deckNames.ok
        ? { kind: "ready", value: deckNames.value }
        : { kind: "failed", error: deckNames.error };
      noteTypes = models.ok
        ? { kind: "ready", value: models.value }
        : { kind: "failed", error: models.error };

      // The note type may have been edited in Anki since the capture, and
      // field names are the draft's keys (3.1) — submitting one Anki no
      // longer has would be refused three layers from here. `refreshNoteType`
      // returns the draft itself when the two readings agree, which is the
      // ordinary case and must not count as an edit.
      if (models.ok) {
        const fresh = models.value.find(
          (one) => one.name === draft.noteType.name,
        );
        const reconciled =
          fresh === undefined ? draft : refreshNoteType(draft, fresh);
        if (reconciled !== draft) apply(reconciled);
      }

      await this.checkDuplicate();
    },

    async checkDuplicate(): Promise<void> {
      const run = ++duplicateRun;
      duplicate = { kind: "loading" };

      const answer = await deps.anki.canAddNote(draft);
      if (run !== duplicateRun) return;

      duplicate = answer.ok
        ? { kind: "ready", value: !answer.value }
        : { kind: "failed", error: answer.error };
    },

    setDeck(deck: string): void {
      apply(setDeckOn(draft, deck));
    },

    setNoteType(name: string): void {
      if (name === draft.noteType.name) return;
      const chosen =
        noteTypes.kind === "ready"
          ? noteTypes.value.find((one) => one.name === name)
          : undefined;
      // A name Anki has not reported is not a note type this can switch to:
      // the field set comes from the descriptor, and there is none to use.
      if (chosen === undefined) return;

      apply(setNoteTypeOn(draft, chosen));
    },

    setField(field: string, value: string): void {
      const next = setFieldOn(draft, field, value);
      if (next.ok) apply(next.value);
      else refuse(next.error);
    },

    addTag(tag: string): void {
      const next = addTagTo(draft, tag);
      if (next.ok) apply(next.value);
      else refuse(next.error);
    },

    removeTag(tag: string): void {
      apply(removeTagFrom(draft, tag));
    },

    markCloze(start: number, end: number, ordinal?: number) {
      const field = clozeFieldOf();
      if (field === undefined) return undefined;

      const text = draft.fields[field] ?? "";
      // Nothing selected is the common case, and `addDeletion` would call it
      // an invalid range; the copy for that code asks for a selection.
      if (start === end) {
        notice = clozeIssueCopy({
          code: "cloze-range-invalid",
          message: `${start}–${end} is not a range within the field`,
        });
        return undefined;
      }

      const marked = addDeletion(text, {
        start,
        end,
        ...(ordinal === undefined ? {} : { ordinal }),
      });
      if (!marked.ok) {
        notice = clozeIssueCopy(marked.error);
        return undefined;
      }

      const next = setFieldOn(draft, field, marked.value);
      if (!next.ok) {
        refuse(next.error);
        return undefined;
      }
      apply(next.value);

      // The markup was inserted at `start`, so the deletion now beginning
      // there is the new one; its end is where the caret belongs, or every
      // mark after the first lands somewhere the user did not leave it.
      const written = parseCloze(marked.value).find(
        (one) => one.start === start,
      );
      return written?.end ?? start;
    },

    removeCloze(ordinal: number): void {
      const field = clozeFieldOf();
      if (field === undefined) return;

      const next = setFieldOn(
        draft,
        field,
        removeDeletionsByOrdinal(draft.fields[field] ?? "", ordinal),
      );
      if (next.ok) apply(next.value);
      else refuse(next.error);
    },

    convertToCloze(): void {
      const target = clozeTargetOf();
      if (target === undefined) return;

      const next = convertToClozeOn(draft, target);
      if (next.ok) apply(next.value);
      else refuse(next.error);
    },

    flush(): Promise<void> {
      return write();
    },

    stop(): void {
      cancel();
      unwritten = undefined;
    },

    async submit(): Promise<void> {
      // The slot is handed over on success (7.3), so a second press would
      // otherwise put a second copy of the same card into Anki.
      if (submission.kind === "added" || submission.kind === "submitting") {
        return;
      }
      // Before anything is sent: a failed add is 7.2's case, and it has to
      // leave the edits behind rather than the draft as it was captured.
      await write();

      if (validateDraft(draft).length > 0) {
        submission = { kind: "refused" };
        return;
      }

      submission = { kind: "submitting" };
      const added = await deps.anki.addNote(draft);
      if (!added.ok) {
        // 7.2: the draft stands, and pressing again retries it unchanged.
        submission = { kind: "failed", error: added.error };
        return;
      }

      done = true;
      cancel();
      unwritten = undefined;
      submission = { kind: "added", noteId: added.value };
      await deps.onAdded?.(added.value);
    },
  };
}
