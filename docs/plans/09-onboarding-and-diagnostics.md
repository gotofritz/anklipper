# M9 — Onboarding, diagnostics, UX polish

Index: `00-plan.md`. Depends on: M8. Blocks: M10.

> **Partly landed elsewhere.** M10 went ahead of this milestone, and M13
> took the pieces 1.0.0 could not ship without. Already built, do not build
> again:
>
> - **9.3** — every M4 cause renders its own cause and fix, in
>   `src/sidebar/error-copy.ts`, keyed by the taxonomy so a new cause without
>   copy is a type error.
> - **9.6, 9.7** — the host permission is asked for from a click, in the
>   editor, and `permission-missing` is the one cause that gets that button
>   instead of a **Try again** that could never work.
> - **The connection indicator** — the status strip's marker distinguishes
>   unchecked (`RT/--`) from connected (`RT/OK`) from failed (`RT/NO`).
> - **9.5, README** — Firefox ships first, and the README carries setup, the
>   AnkiConnect step, and installation.
>
> Still this milestone's: **9.2a** (the manual `webCorsOriginList` fallback
> with the running origin filled in and copyable), the **diagnostics view**,
> and the API-key field surfaced on demand. Re-read the deliverables below
> against what is already there before writing any of it.

## Goal

Make the extension usable by someone who did not build it. Until this
milestone it cannot work on a fresh machine at all: AnkiConnect rejects the
extension's origin until the user edits the add-on's configuration.

## Non-goals

No AI (M12), no Chrome build (see 9.5), no new capture features, and no
editor work — Anki-editor parity is M10.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 9.1 | First run **checks and guides** rather than assuming success | The default state of a new install is broken through no fault of the user. |
| 9.2 | The primary path is **triggering `requestPermission` and asking the user to approve the dialog in Anki** (P9) | The add-on adds the origin and saves its own config on approval. "Click Yes in the window that just appeared in Anki" is a far smaller ask than editing JSON, and it sidesteps the per-install UUID entirely. |
| 9.2a | The **manual fallback** names the exact JSON to paste into `webCorsOriginList`, with the running extension's own origin filled in and copyable | Needed for the dead end in 9.7, and on Firefox no value could have been documented in advance because the `moz-extension://` UUID differs per installation (P8). |
| 9.7 | A **denied or ignored** handshake is presented as a dead end with a manual fix, never as "try again" | Ticking "ignore future requests" writes the origin to `ignoreOriginList`, after which the dialog never reappears. A retry button there loops the user forever. |
| 9.8 | Onboarding **never suggests `"*"`** as an allowlist value | It is honoured as a wildcard, and it would let any site the user visits drive their collection destructively. Not offered even as a shortcut. |
| 9.6 | Onboarding also **requests the loopback host permission** from a gesture, before the origin step | Firefox MV3 leaves it ungranted at install (2.7). Asking after the allowlist edit would show a failure the user has already fixed. |
| 9.3 | Diagnostics report a **cause and its fix**, using M4's taxonomy and confidence flag | Where the cause is ambiguous, show the two likeliest fixes rather than one confident wrong one. |
| 9.4 | Diagnostics are reachable **after** onboarding, from the panel | The failure recurs whenever Anki closes. |
| 9.5 | Chrome is **after the first release** | Firefox ships first (P5). M2's sidebar wrapper and origin helper already carry the differences, and WXT builds the Chrome target throughout, so the port is exercise rather than design. |

## Deliverables

- First-run flow, in order: request the host permission, probe, trigger the
  `requestPermission` handshake, tell the user to approve the dialog in Anki,
  then re-probe until it connects — no browser reload, no Anki restart.
- Manual fallback screen with the copyable origin and the exact JSON, reached
  from the dead end in 9.7 and from diagnostics.
- An **API key** field, surfaced when the add-on reports a key is required
  rather than shown to everyone by default.
- Diagnostics view: current cause, the fix, the endpoint in use, and Anki's
  reported version when reachable.
- Panel connection indicator that distinguishes "not checked" from "checked
  and failing".
- Fast repeated creation: after a successful add, the panel returns to a
  ready state with the deck retained.
- Several cards from one page without reopening or re-navigating.
- Success and error feedback consistent with M6's cause-plus-action rule.
- Keyboard shortcuts documented in-extension.
- `README.md`: setup, the AnkiConnect step, and troubleshooting.

## Tests to write first

1. Each M4 cause renders its own guidance; none falls through to a generic
   message.
2. The manual fallback shows the running extension's actual origin, not a
   placeholder and not a value baked in at build time.
2b. The happy path triggers the handshake and, once approved, connects
    without asking the user to edit anything.
2c. A denied handshake routes to the manual fallback and offers no retry.
2d. `"*"` appears nowhere in any guidance the extension renders.
2a. With the host permission ungranted, onboarding asks for it first and does
    not report an AnkiConnect fault the user cannot act on.
3. Re-check after a simulated fix moves the flow to success without a reload.
4. An ambiguous probe result (low confidence) shows both candidate fixes.
5. A successful add returns the panel to ready with the deck retained.
6. Two cards can be created in sequence from one page.
7. The connection indicator distinguishes unchecked from failed.
8. Onboarding does not reappear once the connection has succeeded.

## Done when

- A clean browser profile with an unconfigured AnkiConnect can be brought to
  a working state using only in-extension guidance and the Anki dialog —
  verified by doing it, not by reading the code.
- The same, for a user who previously declined and is now in
  `ignoreOriginList`: the manual fallback gets them working.
- Closing Anki mid-session produces a message that names the cause; reopening
  and re-checking recovers without losing a draft.
- `README.md` and `docs/initial-context.md` reflect shipped behaviour.

## Risks

- **Guidance drifting from the taxonomy.** Copy lives with the cause it
  explains (M6, 6.5), so a new cause cannot ship without its guidance.
- **Origin changes.** The pinned identity from M2 is what keeps 9.2 truthful
  across reloads; if the origin changes, every user's allowlist entry breaks.
  On Firefox this also means a reinstall gives a new UUID — onboarding must
  be re-enterable (9.4) precisely because that happens.
- **Onboarding that cannot be re-entered.** Users clear config and change
  machines. 9.4 exists so the path is never one-shot.
