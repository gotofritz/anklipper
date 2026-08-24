# M5 — Selection and page context

## As built

Shipped as planned: 5.1–5.4 all hold, the context menu and the `Alt+Shift+A`
shortcut share one path, and extraction runs only on the gesture. What differs
from the text below, and why:

**The HTML fragment went to `source.html`, not to `GenerationMetadata`.** 5.2
says "kept in generation metadata", which reads as `draft.generation` — but
that field names the generator and its version, and page markup is not
provenance of the generator. `CardSource` already holds the capture verbatim
(3.6), so the fragment joined it there, alongside a new `source.heading`.
`draft.generation.warnings` does carry the capture's blind spots, because
those *are* something generation knows and the editor has to show.

**Two modules were added that the plan does not name.**
`src/platform/draft-store.ts` implements M3's `DraftStore` over `StoragePort`,
because the gesture and the sidebar finish in no fixed order and the
background is unloaded when idle — there is nowhere else for the draft to
live between them. The plan assigned that adapter to M7; M7 inherits a working
one. `src/platform/commands.ts` wraps `browser.commands`, which M2 had not
needed.

**The sidebar pulls rather than being pushed to.** The plan's handoff ends
"draft → sidebar". Delivering into a live sidebar is 7.4's problem, so M5
stops at storing the draft and answering `get-draft`. The panel renders the
captured text, its source, and any warnings — that is what makes the whole
path visible, not an editor, which is M6's.

**A `.dom.ts` filename convention.** `extract.dom.ts` needs a document, and
the repo's jsdom project is selected by filename. Naming the module for it
keeps the TDD hook's stem match working (`extract.dom.test.ts`) without
loosening 1.4's rule. Recorded in the developer guide.

**Two caps the plan does not state.** The retained HTML is capped at 40 000
characters and dropped with a warning past it — the plan caps the text but
the markup crosses the same message boundary. The climb for a block ancestor
with text is bounded at eight hops, per the plan's own risk note.

**The panel watches the draft key.** Found by the first manual pass: with the
sidebar already open — the common case, since Firefox's is per window — the
panel read the draft once on mount and never again, so a capture looked like
it did nothing. `StoragePort` gained `onChanged`, and the panel re-reads on
it. Pushing a draft into a live sidebar is still 7.4's; this is the pull side
of the same problem, and M5's own "done when" cannot be met without it.

**Capture failures are reported.** Also from that pass: `startBackground`
discarded the capture's `Result`, which is the silent swallow the failure
policy forbids — on a page with no content script and no selection text,
nothing was stored and nothing was said. `describeCapture` reduces a result
to kinds and our own messages, carrying no page content, and the background
hands it to an optional reporter that development builds log.

**The capture no longer waits for the sidebar.** The third thing the manual
pass found, and the one that made the other two look unfixed: `finish` awaited
`sidebar.open()` before reading the page, so every capture after the first —
the ones where Firefox's sidebar is already open — hung on a promise this
extension does not own. Nothing was stored and nothing was reported. The
gesture ordering the plan's risk note demands is *open first*, not *wait
first*: the sidebar call still happens inside the gesture's task, the capture
then runs independently, and the sidebar's answer is collected at the end
under a one-second timeout (`open-timed-out`). The regression test drove the
old code into a 15-second stall, which is what the bug was.

**Not done, and why.** The "done when" clause about a real browser is the one
item left open: the automated suite covers extraction against jsdom fixtures
and the gesture against fakes, and the manual pass is written up in the
developer guide under *Checking it in Firefox → 6. Capturing a selection*.
Its first two steps have now been run against a real Firefox — which is where
the two fixes above came from — and the blind-spot checks have not.

---

Index: `00-plan.md`. Depends on: M2, M3. Blocks: M7.

## Goal

Turn "the user selected some text and asked for a card" into a `CardDraft`.
Context-menu entry, keyboard shortcut, content-script extraction, and the
handoff into the sidebar.

## Non-goals

No editing UI (M6), no AnkiConnect (done in M4), no multi-selection or batch
capture (deferred).

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 5.1 | Extraction uses **content-script `window.getSelection()`**, not `info.selectionText` | The menu event's text is truncated by the browser and arrives as plain text with no surroundings — it cannot supply the surrounding block or heading the card model asks for. The event is still used as the trigger. |
| 5.2 | **Plain text in fields; original HTML kept in generation metadata** | Resolves an index open question. Anki fields accept HTML, but round-tripping page markup into a card produces junk far more often than it produces value. Line breaks are preserved. The HTML is retained so a later milestone can offer rich capture without re-extraction. This governs **capture**, not editing: M10 adds rich editing without changing what the extractor pulls off the page (10.3). |
| 5.3 | Context bounds: selection capped at 10 000 characters; surrounding context is the **nearest block-level ancestor's text**, capped at 1 000 characters; heading is the nearest preceding `h1`–`h6` | Resolves an index open question. Block ancestor beats a character window because it respects document structure instead of slicing mid-sentence. |
| 5.4 | Blind spots fail **loudly and specifically** | A card silently missing its context is worse than a message saying context could not be read. |

## Deliverables

* Context-menu entry *Create Anki Card*, shown only on text selection.
* Optional keyboard shortcut via `commands`.
* Content-script extractor: selected text, surrounding block text, nearest
  heading, page title, URL, and the original HTML fragment.
* Injection on demand via `activeTab` + `scripting` — never a broad content
  script, per the index's permission ceiling.
* Handoff: extraction result → M3 generator → draft → sidebar, opened in the
  same user gesture through M2's sidebar wrapper (see M2's risk note).

## Blind spots to handle explicitly

* **Shadow DOM** — `getSelection()` does not reach into closed roots.
* **Cross-origin iframes** — a separate context; the top-level script cannot
  read the selection.
* **The built-in PDF viewer** — no content script runs at all. On Firefox
  this is `pdf.js`, which is a privileged page rather than a plugin, but the
  outcome is the same.

Each yields a specific message naming what could not be captured, and where
possible still produces a draft from whatever the trigger event carried. A
degraded card beats no card, provided the degradation is visible.

## Tests to write first

1. A selection inside a paragraph yields that text plus the paragraph as
   context.
2. The nearest preceding heading is found across intervening elements.
3. A selection spanning several blocks yields their common ancestor as
   context.
4. Selection over the cap is truncated at the cap, and the truncation is
   flagged in the result.
5. Markup becomes plain text with line breaks preserved; the HTML fragment is
   retained in metadata.
6. A selection in a shadow root reports the blind spot rather than returning
   empty text.
7. No content script yields the typed "cannot extract here" failure from M2.
8. Extraction output feeds the M3 generator and produces a valid draft.

## Done when

* Extraction is tested against fixture DOMs including all three blind spots.
* Right-clicking a selection opens the panel with a populated draft in a real
  browser.
* Extraction runs only after the user gesture; nothing is injected at page
  load.

## Risks

* **Gesture chain.** Opening the sidebar must happen synchronously in the
  menu handler; awaiting extraction first can forfeit the gesture. Open the
  sidebar first, then deliver the draft.
* **A sidebar that is already open.** Firefox's sidebar persists per window,
  so the common case after the first card is that it is already showing.
  Opening it again must be harmless, and delivering a new draft into a live
  sidebar is the path 7.4 governs.
* **Enormous selections.** Select-all on a long article can be megabytes. Cap
  before anything crosses a message boundary.
* **Framework-rewritten DOMs.** The nearest block ancestor can be a wrapper
  with no useful text. Fall back up the tree, bounded.
