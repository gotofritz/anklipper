# M10 — Card editor parity

Index: `00-plan.md`. Depends on: M9. Blocks: M12.

## Goal

Make the sidebar a real Anki note editor, not a two-field approximation:
every note type in the user's collection selectable, its own fields rendered
in its own order, and the editing affordances someone already used to Anki
expects to find.

M6 shipped the mechanism — note-type picker, field set driven by the note
type, validation. This milestone closes the gap between "the right inputs
exist" and "this feels like Anki's editor".

## Non-goals

Media — images, screenshots, `storeMediaFile` — is **M11**, not this
milestone: it changes what the adapter uploads and what a draft has to
persist, so it gets its own plan. Audio and video are not planned. No AI
(M12).

**LaTeX and MathJax are not part of this project** and will not be added.
No buttons, no parsing, no rendering.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 10.1 | **Fields render in the note type's own order**, as the collection defines it | `modelFieldNames` returns them ordered, so this is free — but only if nothing sorts or re-keys them on the way through. |
| 10.2 | **Rich text editing per field, backed by `contenteditable`** — this **supersedes 6.6**'s plain `<textarea>` | Anki stores field content as HTML and its editor is rich. A plain textarea cannot offer bold, italic, or sub/superscript, which is most of what "reproduce Anki's editor" means. Recorded here rather than silently changed, per `AGENTS.md`. |
| 10.3 | **5.2 is unchanged**: capture is still plain text | What the *extractor* pulls off the page and what the *editor* can produce are different questions. Pasting a page's markup into a card remains a bad default; typing bold in the editor is not. |
| 10.4 | Every field has an **HTML source toggle** | Anki has one, cloze markup is easier to fix in source, and it is the escape hatch when the rich editor does the wrong thing. |
| 10.5 | Inserted and pasted HTML is **sanitised to an allowlist** of inline tags | Field HTML is rendered by Anki in its own webview. An extension that pipes arbitrary page markup into a user's collection is handing an untrusted page a persistent surface. Allow inline formatting; strip scripts, event handlers, styles, and embeds. M11 extends the allowlist to `<img>` and nothing else. |
| 10.6 | **Sticky fields**: a field can be pinned so its content carries to the next note | Anki's own feature, and the one that makes capturing several cards from one page fast — which is what 9.x asked for and did not deliver. |
| 10.7 | Anki's **keyboard shortcuts** are matched where they do not collide with the browser's | Muscle memory is most of the value; a different set is worse than none. |
| 10.8 | Duplicate detection is shown **the way Anki shows it** — first field highlighted, not a separate banner | Builds on 4.4's `canAddNotes`; still non-blocking. |

## Deliverables

* Note-type picker listing every note type in the collection, filterable —
  a real collection has dozens.
* Deck picker, likewise filterable, with the last-used deck from 8.5.
* Per-field editor: label, rich text input, source toggle, sticky pin.
* Formatting toolbar: bold, italic, underline, superscript, subscript, and
  clear formatting — the set Anki puts on its own toolbar.
* Cloze controls from M6, moved into the same toolbar so there is one place
  where marking happens.
* Tag editor with completion from the collection's existing tags.
* Duplicate highlighting on the first field.
* Adapter additions for whatever this needs beyond M4 — existing tags, and
  note-type metadata rich enough to render fields in order.

## Where this gets harder than it looks

Cloze marking in M6 used a `<textarea>`'s `selectionStart`/`selectionEnd`.
Under `contenteditable` the selection is a DOM `Range`, and the model's cloze
functions (3.8–3.11) take **text offsets**. Something must map between them,
and that mapping is where off-by-one bugs live.

The model does not change: it keeps taking text plus a range and returning
new text. The editor owns the mapping, and the mapping gets its own tests
independent of any component — including a field whose HTML contains inline
markup between the selection's start and end.

If the mapping proves unstable, the fallback is 10.4's source toggle: mark
cloze in source mode, where offsets are literal. Decide that on evidence, not
in advance.

## Tests to write first

1. A note type's fields render in the collection's order, not alphabetically.
2. Switching note type re-renders the field set and honours 3.2's remap and
   stash.
3. Bold applied to a selection produces the expected inline markup in the
   field's value.
4. The source toggle round-trips: markup shown as source, edited, and applied
   back without loss.
5. Pasted markup is sanitised — a `<script>`, an inline handler, and a style
   attribute are all stripped, while `<b>` and `<i>` survive.
6. A sticky field's content carries to the next draft; a non-sticky one does
   not.
7. Cloze marking under `contenteditable` produces the same result as the same
   selection in source mode.
8. A selection spanning existing inline markup maps to the correct text
   offsets.
9. Tag completion offers tags from the collection and still accepts a new one.
10. A duplicate first field is highlighted, and submission is still allowed.
11. Every toolbar action is reachable by keyboard, and the shortcuts match
    Anki's where they do not collide with the browser's.

## Done when

* A note type with several fields — one of the user's real ones, not the
  built-in Basic — renders and submits correctly.
* A card created here is indistinguishable in Anki from one typed into Anki's
  own editor, including formatting.
* Sanitisation is verified against a hostile fixture, not only a friendly one.
* The layout still holds at a narrow sidebar width (M6's done-when).

## Risks

* **Scope.** Anki's editor has years of features. This milestone is the
  formatting toolbar, field fidelity, sticky fields, and tags. Media is M11;
  LaTeX and MathJax are never. Adding either here is how this milestone stops
  shipping.
* **`contenteditable`.** It is the least pleasant API in the browser —
  inconsistent behaviour on paste, undo, and caret placement. Keep the
  allowlist small, own the paste handler, and test at the value level rather
  than by trusting the browser's own editing commands.
* **Regressing M6.** Everything M6 tested must still pass; 10.2 changes the
  input element under those tests, which is exactly when behaviour-level
  tests earn their keep.
