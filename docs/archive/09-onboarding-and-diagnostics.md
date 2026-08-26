# M9 — Onboarding, diagnostics, UX polish

## As built

M9 landed after M10 and M13, which had already taken the pieces 1.0.0 could
not ship without. What this milestone actually built is the connection report,
the manual allowlist fallback behind it, the API key field that appears only
when something asks for one, and the shortcuts written down. The differences
from the plan below, and why.

**Onboarding and diagnostics are one view, not two.** The plan describes a
first-run flow (9.1) and a diagnostics view reachable afterwards (9.4). They
say the same things — a fresh install and an Anki closed an hour ago both need
the cause and the fix — so they are one `<details>` at the top of the panel:
`Diagnostics.svelte`, folded away when Anki answers and open when it does not.
A wizard would have been no use the second time, and the second time is the
common case. What separates the two framings is one flag,
`DiagnosticsModel.everConnected`: someone who has never connected gets the
sentence explaining what the extension needs, and someone whose Anki just
closed does not get it again. That is test 8, and it is what the plan's "does
not reappear" turned out to mean.

**9.2 was not built, because P9 stays reversed.** The plan's primary path is
triggering AnkiConnect's `requestPermission` handshake. M4's manual pass found
the add-on serving a request from an origin absent from `webCorsOriginList`,
so there was never anything for the handshake to unblock, and P9 was reversed
before this milestone started. Onboarding is the host permission first (9.6)
and the report after it. **Tests 2b and 2c are therefore about a handshake
that does not exist**; what replaced them is the host permission's own path —
the ask is offered for `permission-missing` and for no other cause, granting
it re-checks in place, and declining leaves the message and the button
standing, because declining is an answer and not a dead end.

**9.7 attaches to the cause a retry could never fix.** With no handshake there
is no denied-handshake dead end. The rule survives as the one it was always
about: `permission-missing` renders **Allow access to Anki** and no **Check
again**, because a re-check refuses before anything leaves the browser. M13
had already applied the same rule in the editor; the report follows it.

**Test 4 is obsolete.** It asks that an ambiguous probe result show both
candidate fixes, on the assumption the probe would carry a confidence flag.
M4 removed the ambiguity rather than resolving it — a rejected origin and a
dead port are no longer indistinguishable — so every cause `AnkiConnection`
reports is determinate, and there is no low-confidence result to render two
fixes for. Nothing was built for it.

**Tests 5 and 6 were already true.** Fast repeated creation and several cards
from one page are M7's slot handover and M8's remembered deck working
together, and neither needed a change. They are in
`tests/integration/mvp-flow.svelte.test.ts` as sections 11 and 12 — written
against behaviour that already passed, and kept because nothing else pins the
sidebar staying open across an add and the next capture.

**`AnkiDiagnostics` moved to `src/core/ports/types.ts`.** The report renders
it and the sidebar holds no adapter import, so the shape belongs with the
ports; `src/anki/client.ts` re-exports it, and
`createSettingsAnkiDiagnostics` fills it in from the same settings the client
is built from — per call, so the two cannot describe different endpoints.

**The API key field is surfaced in the options page, not the panel.** It is
where the field already lived, and a credential is better typed in one place
than two. `apiKeyWanted` is true when a key is stored, when a load found
AnkiConnect refusing for want of one, or when the user pressed **My
AnkiConnect needs an API key**. The report routes `api-key-required` there
rather than growing a second box.

**The shortcuts are documented on the options page** (`ShortcutList.svelte`,
from `SHORTCUT_DOCS`). They were in `title` attributes, which document a chord
to whoever hovers a button and to nobody else. `CAPTURE_SHORTCUT` became a
constant in `src/manifest/manifest.ts` so the list and the manifest cannot
disagree, and a test holds the list to both.

**The manual fallback is `src/anki/allowlist.ts` plus
`ManualFallback.svelte`.** The snippet builder is in the adapter layer, where
the add-on's config shape belongs; the component renders it under a failure
with a copy button. It keeps AnkiConnect's own `http://localhost` entry so a
paste adds rather than removes, and it is a config fragment rather than a whole
object because the user has other keys in there. `"*"` appears in no guidance
this extension renders (9.8), and three tests hold it that way: over the
snippet builder, over the report for every cause, and over the fallback
itself.

### Not verified

The **Done when** list below asks for three things to be verified by doing
them: a clean browser profile with an unconfigured AnkiConnect brought to a
working state; the same for a user already in `ignoreOriginList`; and Anki
closed mid-session and recovered without losing a draft. **None of the three
was performed.** They need Firefox and a real Anki, and this milestone was
built in an environment with neither. Every one of them is covered by
automated tests against M3's fakes — which is not the same thing, and is
exactly the gap the plan wrote that criterion to catch. They remain to be done
against a real Anki before the next release.

---

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
