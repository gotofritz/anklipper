# M10 — Card editor parity

## As built

Shipped as planned, with six things worth recording.

**It landed before M9.** The plan says "Depends on: M9", and nothing in it
turned out to: M9 is onboarding and diagnostics over M4's error taxonomy, and
this milestone touches neither. The dependency was ordering, not coupling.
M9 is still open and unchanged.

**The `contenteditable` risk was answered by not trusting the browser.** The
plan's fallback was 10.4's source toggle, to be decided "on evidence". No
fallback was needed, because no browser editing command is used at all: a
field's HTML is parsed into runs of text carrying inline marks, every action —
bold, clear, paste, cloze — is a pure function over those runs, and the
component only renders what comes back. That put the mapping the plan warned
about in `src/core/field-html.ts`, where concatenating the runs' text *is* the
offsets `cloze.ts` works in, so `src/sidebar/selection.dom.ts` only has to
measure the DOM the same way. Both have tests of their own, and the parity the
plan asked for in test 7 is asserted as an equivalence over a table of cases
rather than as a pair of examples.

**Sanitising rebuilds rather than filters.** 10.5 asked for an allowlist; what
is implemented re-emits everything from the parsed model with the text escaped
and no attributes at all, so nothing reaches a collection that
`serializeField` did not write. The hostile fixture the done-when asked for is
`src/core/field-html.test.ts`.

**Making fields HTML reached further than the editor.** Three things outside
it had to change so that a page's text cannot become a collection's markup:
`generate.ts` escapes the captured selection, `source-fields.ts` escapes the
page title and URL in the plain style as well as the link style (and joins
with `<br>` rather than a newline, which a field renders as a space), and
`validate.ts` reads "empty" off a field's *text*, since a `contenteditable`
the user emptied is left holding a `<br>`.

**10.7 has one deliberate omission.** Anki clears formatting with `Ctrl+R`,
which is the browser's reload. The plan's rule is to match Anki "where they do
not collide with the browser's", so that chord is not claimed and remove-
formatting is reachable only from its toolbar button — which still satisfies
test 11, since a button is reachable by keyboard. `Ctrl+B` and `Ctrl+U` *are*
claimed from the browser, because an editor without bold or underline is not
one.

**Two smaller additions the deliverables implied.** `AnkiClient` grew
`tags()` over AnkiConnect's `getTags` for 10.9's completion, and `Remembered`
grew `sticky` for 10.6's pins — which made every write to that one storage key
go through `updateRemembered`, since the deck (8.5) and the pins now share it
and a whole-value write would drop whichever half the other caller had just
made.

## M10a — the landing area

Added after the milestone, on the same branch, from the first real use of it.
Not in the plan below; recorded here because it is the same pull request.

**The report:** *"when I change card type the text I selected goes away."*

**The cause was 3.2, working as designed and saying nothing.** A note type owns
its field names, so `setNoteType` remaps by name and stashes what does not
match. Basic and Cloze share no field name, so a switch between them carries
nothing, stashes everything, and renders a form of empty fields. The text was
never lost — switching back restores it — but nothing in the UI said so, and
"recoverable if you happen to switch back" is not a thing a user can know.

**The fix is structural, not a message.** `CardDraft.scratch` holds the
selected text as plain text, outside the field map entirely (P12), seeded by
generation from the same selection that fills the primary field. Nothing that
changes note type touches it, because it is not a field. The editor renders it
as a `<textarea>` above the note-type picker, and `sendToField` fills fields
*from* it — escaping on the way in, since a field is HTML and page text is not
(10.5).

Three decisions taken with the user rather than assumed:

| # | Decision | Note |
|---|----------|------|
| 10a.1 | The landing area is **plain text**, editable, and persisted with the draft | It is what the extractor read (5.2, 10.3), and it is the surface M12 will generate from. Formatting belongs on the far side of a send. |
| 10a.2 | Sending **inserts at the caret** the target field was last left at; a checkbox **replaces** instead | Insert loses nothing, so it is the default; replace is destructive, so it is asked for. The caret is cached per field, since pressing the button moves focus off it. |
| 10a.3 | A capture arriving while a card is open **still waits and asks** (7.4) | Considered appending to the landing area instead; rejected, because there would then be no way to start a fresh card from a selection without discarding first. |

Two smaller things came with it. A draft stored before `scratch` existed has
its landing area filled from the capture on read, degrading rather than
refusing (8.2's rule) — a card half-written when the extension updates is
exactly the one nobody can afford to lose. And the stash is now *named*: the
editor says which note type's content it is holding, since silence about it
was the other half of what made a note-type change look destructive.

---

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
