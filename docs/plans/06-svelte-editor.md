# M6 — Svelte editor

Index: `00-plan.md`. Depends on: M3 (ports), M4 (data shapes). Blocks: M7.

## Goal

The sidebar UI: show a draft, let the user edit every part of it, and
submit. Built entirely against the **fake** `AnkiClient` from M3 — no
protocol logic, no `browser.*` calls in components.

## Non-goals

No AnkiConnect wiring (M7), no settings screen (M8), no onboarding (M9).

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 6.1 | Components receive a draft and emit intents; **all transitions go through M3's pure functions** | No component computes a new draft itself, or 3.2's remap rule ends up reimplemented in a dropdown handler. |
| 6.2 | One **view-model layer** between components and ports | Loading and error state lives here, not scattered across components. |
| 6.3 | Every async state is explicit: idle, loading, ready, failed | A silent empty deck list is indistinguishable from Anki being closed. |
| 6.4 | Errors are rendered as **cause plus next action**, using M4's taxonomy | "Failed to add note" tells the user nothing they can act on. |
| 6.5 | Native form controls with real labels | `AGENTS.md` requires accessible controls; a custom listbox is a needless accessibility liability. |
| 6.6 | Cloze editing uses a **plain `<textarea>` and its `selectionStart`/`selectionEnd`** — no `contenteditable`, no rich editor. **Superseded by 10.2**, deliberately: this milestone ships the working flow, M10 adds Anki's formatting | Marking a deletion is "wrap the selected range", which a textarea gives for free. Rich editing is real work (sanitisation, paste, caret) and buying it before the flow works would delay everything behind it. |
| 6.7 | Cloze controls appear **only for cloze-flavoured note types** (3.7), driven by the adapter's descriptor (4.6) | Not by matching the note type's name in the UI. |

## Deliverables

* Sidebar layout: fields, deck selector, note-type selector, tag editor,
  source/context display, add and cancel. Narrow by default — a Firefox
  sidebar is roughly a third of the window and user-resizable, so the layout
  is tested at a narrow width rather than assumed to fit.
* Field set re-renders on note-type change per rule 3.2, including the stash
  restore path.
* Validation surfaced per field, from M3's typed issues.
* Duplicate warning from `canAddNotes` (4.4) — visible, non-blocking.
* Cloze controls: mark selection as a new deletion, mark it under an existing
  ordinal (grouping, per 3.9), remove a deletion, and a keyboard shortcut for
  the common case. A list of current deletions with their ordinals, so the
  markup is readable without parsing braces by eye.
* Cloze validation surfaced like any other issue: no deletions yet, or an
  overlap rejected (3.10).
* Loading, empty, and error states for deck and model lists.
* Keyboard: submit, cancel, and a sane tab order.

## Tests to write first

Observable behaviour only — no assertions on component internals.

1. A draft renders its fields, deck, note type, and tags.
2. Typing in a field updates the draft.
3. Changing note type re-renders the field set and preserves same-named
   content.
4. Switching note type and back restores stashed content.
5. Submitting an invalid draft shows the specific field error and does not
   call the port.
6. Submitting a valid draft calls the port once with that draft.
7. A failing port renders the cause and its suggested action; the draft
   stays intact and editable.
8. Deck list loading, loaded, and failed each render distinctly.
9. A duplicate warning appears and submission is still possible.
10. Every control is reachable and labelled.
11. Selecting text and marking it renders `{{c1::…}}` in the field; marking a
    second range renders `{{c2::…}}`.
12. Marking under an existing ordinal groups both spans.
13. Removing a deletion updates the field and the deletion list.
14. A cloze note type with no deletions blocks submission with its own
    message; adding one clears it.
15. An overlapping selection is refused with an explanation, and the field is
    unchanged.
16. Cloze controls are absent for a standard note type and present for a
    cloze-flavoured one.
17. Cloze marking is reachable by keyboard alone.

## Done when

* All of the above pass in the `jsdom` project.
* No component imports the AnkiConnect adapter or `browser.*`.
* The sidebar is usable by keyboard alone.
* The layout holds at a narrow sidebar width with no horizontal scrolling.
* Every M4 error cause has a rendered state — no default "something went
  wrong".

## Risks

* **Draft state duplicated into component state.** The fastest route to
  bugs where the UI and the model disagree. Derive; do not copy.
* **Testing Svelte internals.** Assert what the user sees.
* **Error copy invented here.** Wording belongs with the taxonomy so M9 can
  reuse it; keep it in one module, not inline in markup.
* **Cloze logic leaking into the component.** The button hands a text and a
  range to M3 and renders what comes back (6.1). Producing braces in a Svelte
  handler puts the rules in two places.
* **Caret position after marking.** Inserting markup moves everything after
  the selection; restore a sensible caret or repeated marking becomes
  unusable.
