# M7 — End-to-end MVP

## As built

The flow works: select text, edit the card, add it, and it is in Anki. All
five decisions hold, and the eight tests below exist —
`tests/integration/mvp-flow.svelte.test.ts` is nine cases against the real
gesture path, the real content-script reply, the real generation, the real
`DraftStore` over the real `StoragePort`, the real message channel, and the
real panel, with only the `AnkiClient` faked. What differs from the text
below, and why:

**7.4 prompts whenever a card is open, not only when it has been edited.**
The decision as written is unconditional — "a new selection **prompts** rather
than overwriting" — and its test says "while a draft is dirty". Prompting on
the dirty case alone needs a dirty bit: something stored beside the draft,
written by the sidebar on the first edit, read by the background one context
away. Prompting whenever the slot is occupied needs nothing, satisfies the
decision as stated, and is the conservative half of the difference. It also
almost never fires: 7.3 empties the slot on every successful add, so the
prompt appears only for a card the user abandoned without adding.

**There are two storage keys, not a wider store.** `createStoredDrafts` takes
the key, so the draft and the capture waiting behind it are two `DraftStore`s
rather than one interface with the slot baked into every method name. M3's
port is unchanged. `src/sidebar/session.ts` holds the two moves on the pair,
and they turn out to be one operation with two triggers: the card was added
(7.3), or the user said they meant the newer selection (7.4). Both hand the
slot over to whatever is waiting, or empty it.

**The editor gained the conversion M6 left without an affordance.** The plan's
test 1a says "selection → convert → mark two deletions", and 3.12's
`convertToCloze` had no control anywhere. It is a button now, offered when
Anki has reported a cloze note type and the card is not already on one. The
reverse — `convertFromCloze` — stays unwired: which standard note type to
convert *to* is a choice only the user can make, and the note-type dropdown
plus 3.2's stash already makes it without losing anything.

**The stale-note-type risk is handled by a new pure function, not by
`setNoteType`.** `refreshNoteType` applies 3.2's remap to a note type that
kept its name, and returns the draft itself when Anki's reading and the
draft's agree — so reconciling on open is not an edit. `setNoteType` could not
do it: its first line returns early on a matching name, and its stash-restore
step would drop exactly the content the reconciliation exists to keep.
`sameNoteType` in `note-type.ts` is what "agree" means. This also fixes a
smaller thing for free: the capture's note type is the name heuristic's guess
(3.7), and the reconciliation replaces it with Anki's own descriptor, so a
custom cloze note type with no "cloze" in its name is recognised the moment
the sidebar can reach Anki.

**The panel is keyed on `draft.createdAt`, not on the draft.** M6 keyed the
editor on the draft value, which was right when only a capture could change
it. From M7 the panel re-reads on every storage change and the editor's own
saves are among them, so keying on the value would remount the editor —
losing the caret and the cloze selection — on every debounced write. The
capture's timestamp is its identity; two gestures cannot land in the same
millisecond.

**The success confirmation is the panel's, not the editor's.** 7.3 clears the
slot, which unmounts the editor and with it the editor's own "Added to Anki."
The panel remembers which capture went in and says so where the first-run
text would otherwise be. Remembering the capture rather than a flag is what
survives the re-read that follows the add, which can still return the card
that was just added.

**Cancel became Discard, and Escape no longer triggers it.** M6 left
`onCancel` optional and unwired, so the button did nothing in the shipped
panel and Escape was bound to it harmlessly. Wiring it to empty the slot —
the only way to be rid of a card you do not want — made a stray keypress a
one-keystroke data loss, in the milestone whose whole subject is not losing
the user's work. It is a named button now, and nothing else.

**A write is conditional on the slot still holding its own capture.** The
debounce means an edit can still be outstanding when the slot changes hands,
and the flush that fires as the editor unmounts is exactly when that happens.
Without the check, choosing **Use the new selection** with an unsaved
keystroke would write the replaced card back over the one the user chose —
the integration test for 7.4 fails on that, and passes with the read. The same
check covers a discarded card and one already added.

**The capture's defaults are Anki's own `Default` deck.** The plan says
defaults are hardcoded constants here; M5 left the deck empty so validation
would ask for one. Every Anki collection has a `Default` deck, so a capture is
now addable without an edit, and a user who has renamed it gets
`unknown-deck` from the taxonomy with the real deck list already in the
selector.

**Persistence is debounced in the view-model, with two flushes.**
`SAVE_DEBOUNCE_MS` is 400ms; `flush()` is called before every submit and on
`pagehide`, which is the last event a closing sidebar gets. A write that fails
is rendered — an edit that was not stored looks exactly like one that was, and
it is the one failure the user cannot see coming.

**Not done, and why.** The three manual passes under *Done when* — a real
card, a real cloze card with one card per ordinal, and Anki closed — need a
running Anki and a real browser, so they are step 8 of the developer guide's
Firefox checklist rather than anything this repository can assert. The
integration test covers the same paths against the fake.

Index: `00-plan.md`. Depends on: M4, M5, M6. Blocks: M8–M12.

## Goal

Wire the real adapter into the real UI: select text, edit, add, confirm — a
card in Anki. First milestone with user-visible value, and the first where
losing the user's work is possible.

## Non-goals

No settings UI (M8), no onboarding (M9). Defaults are hardcoded constants
here and become configurable next.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 7.1 | **The draft is persisted from the moment it exists**, not on submit | Anki being closed is the dominant failure and it lands *after* editing. The background context is also unloaded when idle on both browsers (M2's risk), so unpersisted state is lost without any user error at all. |
| 7.2 | A failed add leaves the draft **intact and retryable**, with no re-editing | |
| 7.3 | Success clears the persisted draft and confirms in-panel | |
| 7.4 | One draft in flight; a new selection **prompts** rather than overwriting | Silently discarding an edited draft because the user selected something else is the same data loss as 7.1, from a different direction. |
| 7.5 | Retry is **manual** in the MVP | An automatic queue is deferred; it needs conflict and ordering rules that are not worth designing yet. |

## Deliverables

* Composition root wiring real `AnkiClient`, `DraftStore`, and settings
  defaults into the panel.
* `DraftStore` implemented on extension storage against the M3 port.
* Full flow: context menu → extraction → generation → panel → validation →
  `canAddNotes` → `addNote` → confirmation.
* Restore-on-open: reopening the sidebar restores the in-flight draft. On
  Firefox the sidebar often stays open across navigation, so the same path
  must also handle a live sidebar receiving a new draft.
* Retry affordance on failure.

## Tests to write first

1. Integration, adapter mocked: selection → draft → submit → note created.
1a. The same flow for a cloze note type: selection → convert → mark two
    deletions → submit → note created with markup intact.
2. The draft is persisted before the sidebar renders it.
3. Submit failure keeps the draft and offers retry; a second attempt uses the
   same draft.
4. Retry after the failure clears succeeds and clears the draft.
5. Reopening the sidebar restores an in-flight draft, including edits.
6. Success clears the persisted draft.
7. A new selection while a draft is dirty prompts, and declining keeps the
   existing draft.
8. An unloaded and restarted background context does not lose the draft.

## Done when

* The integration test passes with AnkiConnect mocked.
* A manual pass against real Anki creates a real card, and a second pass
  creates a real **cloze** card that generates one card per ordinal in Anki —
  the only way to confirm the markup is actually valid.
* A manual pass with Anki **closed** loses nothing: the draft survives, and
  retrying after opening Anki succeeds.
* `docs/initial-context.md` updated — this milestone changes the messaging
  and composition story.

## Risks

* **Persistence write frequency.** Writing on every keystroke is wasteful;
  writing on blur loses the last field. Debounce, and flush before submit and
  before the sidebar closes.
* **Stale note-type field names.** The user may edit note types in Anki
  mid-draft. Re-fetch on sidebar open and reconcile via 3.2 rather than
  submitting field names that no longer exist.
* **Confirmation that hides failure.** Confirm only after the adapter returns
  a note id.
