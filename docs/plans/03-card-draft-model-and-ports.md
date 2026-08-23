# M3 — `CardDraft` model and ports

Index: `00-plan.md`. Depends on: M2. Blocks: M4–M12.

## Goal

The contract every other layer speaks: a `CardDraft`, its validation, the
deterministic generator that produces one, and the port interfaces the outer
layers implement. Pure TypeScript — no `browser.*`, no Svelte, no network.

This is the milestone that makes the rest testable. It runs in the `node`
Vitest project, and a DOM or browser import here is a design failure.

## Non-goals

No AnkiConnect calls (M4), no DOM extraction (M5), no UI (M6). Generation is
deterministic; AI is M12. Cloze markup is produced here, but the controls
that drive it are M6, and AI *choosing* what to hide stays in M12.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 3.1 | `fields` is `Record<string, string>`, keyed by the note type's **real field names** | Positional field arrays break the moment a note type is edited in Anki. |
| 3.2 | **Note-type switch remaps by field name; unmatched content is stashed, never dropped** | Resolves an index open question. Fields whose names exist in both note types carry over; the rest move to a `stash` that restores if the user switches back. Silent data loss on a dropdown change is the worst available option. |
| 3.3 | `CardDraft` is a **plain immutable value**; transitions are pure functions returning a new draft | Makes every transition trivially testable and keeps UI state out of the model. |
| 3.4 | Validation returns a **list of typed issues**, not a boolean | The editor needs to say which field is wrong and why. |
| 3.5 | Ports defined here, implemented elsewhere: `AnkiClient`, `DraftStore`, `SettingsStore` | Each ships an in-memory fake in the same milestone. The fakes are what M6 develops against. |
| 3.6 | Source text is stored **verbatim and separately** from generated fields | The user may edit fields freely; provenance must survive. |
| 3.7 | **Cloze is a note-type flavour, not a second draft type**: `CardDraft` carries `noteTypeKind: "standard" \| "cloze"`, derived from the note type rather than chosen by the user | One model and one editor. A parallel `ClozeDraft` would duplicate every transition and validation rule. |
| 3.8 | **Deletions live as `{{cN::…}}` markup inside the field text** — the canonical Anki representation is the single source of truth | A parallel array of ranges drifts out of sync the moment the user edits the text by hand. Parse on demand instead. |
| 3.9 | A new deletion takes `max(existing ordinal) + 1`; **reusing an ordinal is explicit and supported** | Grouping several spans under one `cN` is cloze's main non-obvious feature and costs one argument. |
| 3.10 | **Overlapping deletions are rejected**; ordinal **gaps are left alone** | Anki cannot represent overlap. Gaps (c1, c3) are legal, and silently renumbering would rewrite markup the user may have grouped deliberately — the same data loss 3.2 exists to prevent. |
| 3.11 | Markup is **round-trip validated**, not escaped | Captured web text can contain braces. Rather than invent an escaping scheme, assert that re-parsing the field yields exactly the deletions intended, and fail with a specific issue when it does not. |
| 3.12 | **Basic ↔ Cloze switching stashes per 3.2**, plus an explicit opt-in "convert" that carries `Front` into `Text` | The two note types share no field names, so 3.2 alone would stash everything. Converting is useful but must be a user action, never automatic. |

## Deliverables

* `CardDraft`: deck, note type, `fields`, `stash`, tags, selected text,
  surrounding context, source URL, source title, created-at, generation
  metadata (generator name and version, so a later AI generator is
  distinguishable from this one).
* Transitions: set field, set deck, set note type (per 3.2), add/remove tag,
  apply defaults.
* Cloze operations, all pure string transforms over a field's text: add a
  deletion over a character range, remove a deletion by ordinal or position,
  renumber on explicit request only, and parse a field into its deletions
  (ordinal, span, optional hint).
* Cloze hint support — `{{c1::answer::hint}}` — since it is the same parser.
* `convertToCloze(draft)` per 3.12, and its inverse, which strips markup back
  to plain text.
* Validation: deck present, note type present, required fields non-empty,
  field names belong to the note type, tags well-formed, and — for cloze
  note types — **at least one deletion present**. AnkiConnect rejects an
  empty cloze note anyway; catching it here gives a better error and one
  fewer round trip.
* `generateBasicCard(selection, context, defaults)` → `CardDraft`. Front from
  selected text, back left for the user, source recorded.
* Port interfaces plus in-memory fakes, including fakes that can be told to
  fail — every consumer needs to test its own error path.

## Tests to write first

1. A selection produces a draft with source text, URL, and title preserved
   verbatim.
2. Switching note type carries over same-named fields.
3. Switching note type stashes unmatched content; switching back restores it.
4. Validation reports the specific missing field, not just "invalid".
5. Whitespace-only content fails the non-empty rule.
6. Transitions do not mutate the input draft.
7. A field name absent from the note type is rejected.
8. Fakes can be driven into failure and report it in the port's own error
   shape.
9. Marking a range produces `{{c1::…}}`; a second range produces `{{c2::…}}`.
10. A range can be marked with an explicit existing ordinal, grouping both
    spans under one `cN`.
11. Parsing a field returns every deletion with its ordinal, span, and hint.
12. A deletion overlapping an existing one is rejected with a typed issue.
13. Removing the middle deletion leaves a gap; the remaining ordinals are
    unchanged.
14. Explicit renumbering closes gaps and preserves grouping.
15. A cloze note type with no deletions fails validation with its own issue.
16. A standard note type is unaffected by cloze validation.
17. Text containing braces round-trips: either it parses to exactly the
    intended deletions, or validation reports the specific conflict.
18. `convertToCloze` carries `Front` into `Text`; converting back strips
    markup and does not lose the plain text.

## Done when

* Generation, validation, and every transition are covered, including 3.2 in
  both directions.
* The layer imports nothing from `wxt`, `webextension-polyfill`, or Svelte —
  asserted by the boundary lint rule scaffolded in M1, now populated.
* Tests run in the `node` project with no jsdom.

## Risks

* **The stash becomes a junk drawer.** Bound it: one stash per note type,
  cleared when the user explicitly clears a field. Write that test now.
* **Metadata sprawl.** Generation metadata is for provenance, not a place to
  park UI state.
* **Cloze markup as a mini-language.** The parser must stay small: ordinal,
  span, optional hint, no nesting. Anki's own renderer has more surface than
  that; matching it is not this project's job. Anything it cannot parse
  becomes a typed issue, never a silent reinterpretation of the user's text.
* **Offsets after edits.** Character ranges are computed against the text as
  the editor last saw it. Transitions take the text plus a range and return
  new text — they never hold onto an offset across an edit.
