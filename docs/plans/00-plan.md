# Browser Extension → Anki: Top-Level Plan

## 1. Extension Architecture

Define the overall extension structure and responsibilities.

* Browser extension using **TypeScript + Svelte**
* Manifest V3
* Separate concerns between:

  * page/selection handling
  * Svelte UI
  * card generation
  * AnkiConnect communication
  * extension settings/state
* Establish communication between content scripts, extension UI, and background/service worker.

## 2. Text Selection & Page Context

Build the mechanism for capturing what the user wants to turn into a card.

* Detect selected text on the current page.
* Add a context-menu action such as **Create Anki Card**.
* Support an optional keyboard shortcut.
* Capture useful context:

  * selected text
  * surrounding text
  * page title
  * URL
  * relevant heading/section
* Define how much page context should be retained.

## 3. Card Draft Model

Define an internal representation of an Anki card independent of AnkiConnect.

For example:

* Deck
* Note type
* Fields
* Tags
* Source URL
* Source title
* Original selected text

This becomes the contract between card generation, the editor, and AnkiConnect.

## 4. Card Generation

Define how raw selected text becomes a useful card.

### Initial MVP

Use deterministic generation:

* Selected text → basic Front/Back card
* Preserve selected text as source material.
* Allow the user to edit everything before submission.

### Later

Add optional AI-assisted generation:

* Generate question/answer cards.
* Generate definitions.
* Generate cloze cards.
* Use surrounding page context.
* Allow different generation styles.

## 5. Svelte Card Preview & Editor

Build the main user-facing interface in **Svelte**.

* Side panel or popup UI.
* Display generated card.
* Editable Front/Back fields.
* Deck selector.
* Note-type selector.
* Tag editor.
* Source/context information.
* Add-to-Anki and cancel actions.
* Loading, validation, and error states.

The UI operates entirely on the `CardDraft` model rather than talking directly to AnkiConnect.

## 6. AnkiConnect Integration

Create a dedicated AnkiConnect service.

* Detect whether Anki/AnkiConnect is available.
* Retrieve available decks.
* Retrieve available note types/models.
* Retrieve note-type fields.
* Submit cards with `addNote`.
* Handle connection and API errors.
* Potentially check for duplicate notes before adding.

Keep this layer independent from the Svelte UI.

## 7. Settings & Persistence

Add extension-level configuration.

* Default deck.
* Default note type.
* Default tags.
* Field mappings.
* Source URL behaviour.
* Card-generation preferences.
* AnkiConnect connection/status settings where appropriate.

Persist settings using the browser extension's storage APIs.

## 8. User Experience

Polish the core workflow.

Target flow:

**Select text → Create Anki Card → Generate/preview → Edit → Add to Anki → Confirmation**

Consider:

* Keyboard shortcuts.
* Fast repeated card creation.
* Clear success/error feedback.
* Remembering the user's last-selected deck.
* Minimal interruption to browsing.
* Ability to create multiple cards from the same page.

## 9. Testing & Compatibility

Test the extension independently of Anki where possible.

* Unit-test card generation and `CardDraft`.
* Test AnkiConnect requests with mocked responses.
* Test selection/context extraction.
* Test Svelte editor behaviour.
* Test against Chrome initially.
* Add Firefox/other-browser compatibility later if desired.

## 10. Future Extensions

Leave room for functionality without designing it all upfront.

Potential later features:

* AI-generated cards.
* Cloze cards.
* Image extraction.
* Highlighted source excerpts.
* Automatic tagging.
* Duplicate detection.
* Batch card creation.
* Multiple cards from a selection.
* Anki note-type-specific editors.
* Card templates.
* Sync/history of recently created cards.

### Suggested implementation order

**1. Extension architecture**
↓
**2. Selection & page context**
↓
**3. CardDraft model**
↓
**4. Basic Svelte editor**
↓
**5. AnkiConnect integration**
↓
**6. End-to-end MVP workflow**
↓
**7. Settings & persistence**
↓
**8. UX improvements**
↓
**9. AI / advanced card generation**
