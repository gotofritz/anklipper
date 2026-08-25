import type { ClozeDeletion } from "@/core/cloze";
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
import {
  fieldDeletions,
  markClozeInField,
  nextFieldOrdinal,
  removeClozeFromField,
} from "@/core/field-cloze";
import type { InlineMark } from "@/core/field-html";
import {
  clearMarks,
  hasMarkOver,
  sanitizeFieldHtml,
  toggleMark,
} from "@/core/field-html";
import type { NoteType } from "@/core/note-type";
import { hasField, primaryFieldOf } from "@/core/note-type";
import type {
  AnkiClient,
  AnkiError,
  DraftStore,
  DraftStoreError,
  NoteId,
  RememberedStore,
} from "@/core/ports/types";
import {
  applySticky,
  isFieldSticky,
  pinField,
  stickyFieldsOf,
  unpinField,
} from "@/core/sticky";
import type { StickyFields } from "@/core/sticky";
import { validateDraft } from "@/core/validate";

import { clozeIssueCopy, draftIssueCopy } from "./error-copy";
import { rememberSticky, setStickyPin } from "./session";

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
  /**
   * Where the sticky pins live (10.6), alongside the deck the last card went
   * into (8.5). Remembered state, not settings — so a reset leaves it alone.
   */
  readonly remembered: RememberedStore;
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
  /** Every tag the collection already holds, for completion (10.9). */
  readonly knownTags: Resource<readonly string[]>;
  /** `true` means Anki already holds a note with this first field (4.4). */
  readonly duplicate: Resource<boolean>;
  /**
   * The field to highlight as a duplicate, Anki's own way of showing one
   * (10.8) — its first field, and never a banner. Still non-blocking (4.4).
   */
  readonly duplicateField: string | undefined;
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
  /** The pinned fields of the note type in hand (10.6). */
  readonly stickyFields: readonly string[];
  isSticky(field: string): boolean;
  /** Pin the field, or let it go. Writes through to what is remembered. */
  toggleSticky(field: string): Promise<void>;
  /** Whether a selection already carries a mark, for a button's pressed state. */
  isMarked(
    field: string,
    start: number,
    end: number,
    mark: InlineMark,
  ): boolean;
  /** Turn a mark on over a selection, or off if it is already on. */
  format(field: string, start: number, end: number, mark: InlineMark): void;
  /** Anki's "remove formatting", over the selection. */
  clearFormat(field: string, start: number, end: number): void;
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
  let knownTags = $state.raw<Resource<readonly string[]>>({ kind: "idle" });
  let duplicate = $state.raw<Resource<boolean>>({ kind: "idle" });
  let sticky = $state.raw<StickyFields>({});
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

    // The slot may have been handed over while this edit was waiting — the
    // card was added, discarded, or replaced by the newer selection (7.3,
    // 7.4). Writing then would resurrect a card the user is finished with, or
    // overwrite the one they chose instead, so the write is conditional on
    // the slot still holding this capture.
    const current = await deps.drafts.load();
    if (!current.ok) {
      saveError = current.error;
      return;
    }
    if (current.value?.createdAt !== outstanding.createdAt) return;

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

  /**
   * Rewrite one field through a pure function of its HTML. Every toolbar
   * action is one of these, so the field lookup, the refusal, and the
   * persistence exist once rather than once per button.
   */
  function overField(field: string, change: (html: string) => string): void {
    if (!hasField(draft.noteType, field)) return;

    const next = setFieldOn(draft, field, change(draft.fields[field] ?? ""));
    if (next.ok) apply(next.value);
    else refuse(next.error);
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
    get knownTags() {
      return knownTags;
    },
    get duplicate() {
      return duplicate;
    },
    get duplicateField() {
      if (duplicate.kind !== "ready" || !duplicate.value) return undefined;
      return primaryFieldOf(draft.noteType);
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
      return fieldDeletions(clozeText());
    },
    get nextOrdinal() {
      return nextFieldOrdinal(clozeText());
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
    get stickyFields() {
      return stickyFieldsOf(sticky, draft.noteType.name);
    },

    async load(): Promise<void> {
      decks = { kind: "loading" };
      noteTypes = { kind: "loading" };

      knownTags = { kind: "loading" };

      const [deckNames, models, collectionTags, remembered] = await Promise.all(
        [
          deps.anki.deckNames(),
          deps.anki.noteTypes(),
          deps.anki.tags(),
          deps.remembered.load(),
        ],
      );

      decks = deckNames.ok
        ? { kind: "ready", value: deckNames.value }
        : { kind: "failed", error: deckNames.error };
      noteTypes = models.ok
        ? { kind: "ready", value: models.value }
        : { kind: "failed", error: models.error };
      // 10.9's completion is a convenience, so a collection that will not
      // report its tags costs the completion and nothing else.
      knownTags = collectionTags.ok
        ? { kind: "ready", value: collectionTags.value }
        : { kind: "failed", error: collectionTags.error };
      // What cannot be read is what the extension does not remember (8.5).
      sticky = remembered.ok ? (remembered.value.sticky ?? {}) : {};

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

      // 10.6, after the reconciliation: the pins are keyed by note type and
      // by field, and the note type is only settled once Anki has spoken.
      // Only empty fields are filled, so nothing the capture wrote is lost.
      const carried = applySticky(draft, sticky);
      if (carried !== draft) apply(carried);

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

    /**
     * 10.5, at the one place a field is written: whatever route content took
     * to get here — typing, a paste, the source view, a toolbar button — it
     * arrives sanitised, so there is no path by which page markup reaches the
     * user's collection.
     */
    setField(field: string, value: string): void {
      const next = setFieldOn(draft, field, sanitizeFieldHtml(value));
      if (next.ok) apply(next.value);
      else refuse(next.error);
    },

    isMarked(
      field: string,
      start: number,
      end: number,
      mark: InlineMark,
    ): boolean {
      if (!hasField(draft.noteType, field)) return false;

      return hasMarkOver(draft.fields[field] ?? "", start, end, mark);
    },

    format(field: string, start: number, end: number, mark: InlineMark): void {
      overField(field, (html) => toggleMark(html, start, end, mark));
    },

    clearFormat(field: string, start: number, end: number): void {
      overField(field, (html) => clearMarks(html, start, end));
    },

    isSticky(field: string): boolean {
      return isFieldSticky(sticky, draft.noteType.name, field);
    },

    /**
     * The pin is applied here and written through, rather than written and
     * re-read: the button has to change under the press, and a storage round
     * trip is a frame the user would see it not change in. `sticky.ts` owns
     * what a pin *is* either way, so the two cannot say different things.
     */
    async toggleSticky(field: string): Promise<void> {
      const noteType = draft.noteType.name;
      const pinned = !isFieldSticky(sticky, noteType, field);
      const value = draft.fields[field] ?? "";

      sticky = pinned
        ? pinField(sticky, noteType, field, value)
        : unpinField(sticky, noteType, field);

      await setStickyPin(deps.remembered, noteType, field, value, pinned);
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

      // Nothing selected is the common case, and `addDeletion` would call it
      // an invalid range; the copy for that code asks for a selection.
      if (start === end) {
        notice = clozeIssueCopy({
          code: "cloze-range-invalid",
          message: `${start}–${end} is not a range within the field`,
        });
        return undefined;
      }

      const marked = markClozeInField(draft.fields[field] ?? "", {
        start,
        end,
        ...(ordinal === undefined ? {} : { ordinal }),
      });
      if (!marked.ok) {
        notice = clozeIssueCopy(marked.error);
        return undefined;
      }

      const next = setFieldOn(draft, field, marked.value.html);
      if (!next.ok) {
        refuse(next.error);
        return undefined;
      }
      apply(next.value);

      // Just past the markup that was written, or every mark after the first
      // lands somewhere the user did not leave the caret.
      return marked.value.caret;
    },

    removeCloze(ordinal: number): void {
      const field = clozeFieldOf();
      if (field === undefined) return;

      overField(field, (html) => removeClozeFromField(html, ordinal));
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
      // 10.6: the pinned fields carry what the card that was actually added
      // held, not what was halfway typed. A failure here costs the next
      // capture its head start and nothing more, so it is not raised.
      await rememberSticky(deps.remembered, draft);
      await deps.onAdded?.(added.value);
    },
  };
}
