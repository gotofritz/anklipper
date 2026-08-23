# M12 — AI-assisted generation

Index: `00-plan.md`. Depends on: M11.

## Status: blocked

`AGENTS.md` requires that an AI feature state exactly what data leaves the
browser, and bars premature AI integration. **No code starts until the design
questions below are answered in this file** and the answers are reviewed.

Until then this is a specification for a decision, not a work plan.

Everything before this milestone keeps all page content on loopback. This
milestone is where that stops being true, which is why it is last and why it
is gated.

## What must be settled first

### Data egress

* Exactly which fields leave the browser: selected text only, or the
  surrounding context and page URL too?
* Does the page URL or title go with it? Both can be sensitive independent of
  the selection.
* Is anything retained by the provider, and for how long? Does the chosen
  provider train on it?
* What is the user told, and when — at install, at opt-in, or at each use?

### Consent

* Opt-in, defaulting to off, per `AGENTS.md`.
* Is consent per use, per session, or persistent? Can it be withdrawn, and
  what happens to work in flight?
* Is there a per-site block list, given that selections come from arbitrary
  pages?

### Credentials

* Where does an API key live? `storage.local` is readable by anything with
  access to the profile.
* Does the key belong to the user or to a hosted service? A hosted service
  changes this from a client feature to an operated one, with its own privacy
  policy.
* Never log the key; never include it in diagnostics output (M9).

### Behaviour

* Which generation styles: question/answer, definition, cloze span selection?
  Cloze *machinery* already ships in M3–M7 (P7); what is open here is whether
  a model picks the spans to hide.
* Is AI output a **proposal the user accepts**, or the draft itself? Given
  that everything so far is user-editable, a proposal is the smaller change.
* What happens on provider failure, timeout, or rate limit? The deterministic
  generator must remain the fallback, always available.
* Cost visibility: does the user see what a generation costs them?

## Shape, once unblocked

* A `CardGenerator` port with the M3 deterministic generator as one
  implementation and the AI generator as another. Generation metadata already
  records generator name and version (3.6), so cards remain attributable.
* The AI adapter is isolated exactly as the AnkiConnect adapter is: no
  provider details leak into the UI or the card model.
* Network egress confined to that adapter; a boundary lint rule enforces it,
  as with `browser.*` in M3.

## Tests, once unblocked

1. With consent absent, no request is made — asserted at the network layer,
   not the UI.
2. Withdrawing consent stops requests immediately.
3. Only the agreed fields appear in the request payload.
4. Provider failure falls back to deterministic generation with the failure
   surfaced.
5. AI output produces a valid `CardDraft` that the user can still edit.
5a. AI-proposed cloze spans go through M3's transitions, so overlap and
    ordinal rules hold identically to hand-marked deletions.
6. Credentials never appear in logs or diagnostics output.

## Done when

Not defined. Defining it is the first task of this milestone, after the
questions above are answered.
