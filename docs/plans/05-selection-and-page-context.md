# M5 — Selection and page context

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
