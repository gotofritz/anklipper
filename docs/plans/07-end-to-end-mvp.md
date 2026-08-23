# M7 — End-to-end MVP

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
