# M4 — AnkiConnect adapter

Index: `00-plan.md`. Depends on: M3. Blocks: M6–M9.

## Goal

The only module in the codebase that knows AnkiConnect's wire format. It
implements the `AnkiClient` port from M3 against mocked HTTP, and turns every
failure mode into a typed cause the UI can act on.

## Non-goals

No UI, no retry policy, no onboarding copy (M9). The adapter reports causes;
deciding what to say about them is someone else's job.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 4.1 | Endpoint `http://127.0.0.1:8765`, overridable from settings in M8 | The add-on's `config.json` defaults are `webBindAddress` `127.0.0.1`, `webBindPort` `8765`, `webCorsOriginList` `["http://localhost"]`, `apiKey` `null`, `ignoreOriginList` `[]`. The default allowlist contains no extension origin, so the first-run state is always rejected until P9's handshake runs. `"*"` is honoured as a wildcard and must never be suggested — it would let any site the user visits drive the collection. |
| 4.2 | **Typed error taxonomy, never a boolean or bare throw** | Required by `AGENTS.md`. |
| 4.3 | The probe returns a **cause**, not availability | "Not available" is three different problems with three different fixes. |
| 4.4 | **Duplicate detection ships in the MVP** via `canAddNotes` | Resolves an index open question. One extra call, and duplicates are the most common way an Anki collection rots. Surfaced as a warning, not a block — the user may genuinely want a near-duplicate. |
| 4.5 | Responses are **validated, not cast** | AnkiConnect is an external service; `as` on its output is how malformed data becomes a crash three layers away. |
| 4.7 | The adapter implements the **`requestPermission` handshake** (P9) and treats it as fire-and-then-re-probe | The reply is unreadable from a non-allowlisted origin, so success is established by a follow-up probe succeeding, not by parsing the response. |
| 4.8 | **Optional API key** support: when configured, every action except `requestPermission` carries a `key` field | `apiKey` defaults to `null`, so most users never set one — but the ones who do would otherwise see every call fail with a message the UI cannot explain. Never logged, never included in diagnostics output. |
| 4.9 | The **API version is read from the add-on**, not hardcoded | `requestPermission` reports the version on success. Pin whatever value the request envelope needs after verifying it against a real installation. |
| 4.6 | The adapter reports **which note types are cloze-flavoured** | The model (3.7) needs this, and it cannot be inferred from the field names. Detect it from the note type's templates — a template referencing `{{cloze:…}}` — with the built-in `Cloze` name as a fallback heuristic. The exact AnkiConnect action for fetching templates must be **verified against a real Anki** in this milestone rather than assumed. |

## Error taxonomy

* `anki-not-running` — connection refused on loopback.
* `addon-missing` — connection succeeds, endpoint does not behave like
  AnkiConnect.
* `origin-rejected` — reachable but the extension origin is absent from
  `webCorsOriginList`. The single most likely first-run state, and the one a
  naive "is it up?" check misreports as success. The cause carries the
  origin, read at runtime (P8), so M9 can show the user their own value.
* `permission-missing` — the loopback host permission has not been granted.
  Distinct from the above on Firefox, where the user grants it after install
  (2.7); a request without it fails in a way that otherwise looks like the
  add-on being absent.
* `api-error` — AnkiConnect returned an error string; carries it.
* `api-key-required` — the add-on has an `apiKey` set and the request had no
  key or a wrong one. Recognised from its error message; distinct because the
  fix is a settings change, not a connection one.
* `permission-denied` — the handshake ran and the user declined, or the origin
  sits in `ignoreOriginList` so no dialog will ever appear again. The second
  case is a dead end that only a manual config edit clears, so it must not be
  reported as a transient failure.
* `empty-cloze` — a cloze note reached Anki with no deletions. M3's
  validation should prevent this, so reaching it means the two disagree;
  surface it as its own cause rather than a generic API error, because the
  fix is different.
* `malformed-response` — shape did not validate.
* `timeout`.

Distinguishing the first three from the browser's side is imprecise, and the
source read confirms why: for a non-allowlisted origin the add-on answers with
`Access-Control-Allow-Origin: http://localhost`, so the extension cannot read
even the `403` it sends. A rejected origin and a dead port both surface as a
failed `fetch`.

One technique worth testing before settling for a guess: a `no-cors` request
returns an opaque response when *something* is listening on the port and
throws when nothing is, which separates `anki-not-running` from
`origin-rejected` without needing a readable body. Verify it behaves that way
on Firefox before relying on it.

Where the adapter still cannot be certain, it returns its best guess **and
says so**, so M9 can present the two likeliest fixes rather than one confident
wrong one.

## Deliverables

* Request envelope with the API version, and one place that builds it.
* Operations: `deckNames`, `modelNames`, `modelFieldNames`, `canAddNotes`,
  `addNote`, `requestPermission`, plus whatever action exposes note-type
  templates for 4.6.
* Note-type descriptors carrying name, fields, and cloze flavour, so the UI
  and model never re-derive it.
* `CardDraft` → `addNote` params mapping, including tags and the source
  field policy. The editor never sees a request shape.
* Response validation per operation.
* Probe returning a cause plus a confidence flag.
* Timeouts on every call — Anki can accept a connection and never answer.

## Tests to write first

1. A valid `addNote` response yields the new note id.
2. An AnkiConnect error string surfaces as `api-error` carrying that string.
3. Connection refused yields `anki-not-running`.
3a. A missing host permission yields `permission-missing`, checked before any
    request is attempted.
3b. The handshake sends `requestPermission` without a key, and reports
    "asked, awaiting the user" rather than success or failure.
3c. A re-probe succeeding after the handshake resolves to connected.
3d. A denied handshake yields `permission-denied`, flagged as needing a manual
    fix rather than a retry.
3e. With an API key configured, every action except `requestPermission`
    carries it; the add-on's key error surfaces as `api-key-required`.
3f. No test, log line, or diagnostics payload contains the key's value.
4. A CORS-shaped failure yields `origin-rejected`.
5. A 200 response of the wrong shape yields `malformed-response`, not a cast.
6. A response that never arrives yields `timeout`.
7. `canAddNotes` false surfaces as a duplicate warning, and the draft is
   still addable.
8. A draft maps to the documented `addNote` params, including tags.
9. Every operation validates its response shape.
10. A note type whose template references `{{cloze:…}}` is reported as cloze-
    flavoured; a standard one is not.
11. A cloze draft maps to `addNote` with its markup intact — the adapter does
    not touch the braces.
12. An empty-cloze rejection from Anki surfaces as `empty-cloze`, not
    `api-error`.

## Done when

* Every taxonomy branch is covered by a mocked-response test.
* No Svelte or `browser.*` import appears in the layer.
* One manual pass against a real Anki confirms the happy path and the
  `origin-rejected` path — the second by testing before adding the origin to
  `webCorsOriginList`.
* The origin the adapter reports is the one AnkiConnect actually accepts when
  pasted in, on a real Firefox profile.
* Cloze detection verified against a real Anki, including a **custom**
  cloze-flavoured note type, not only the built-in `Cloze`.
* The handshake verified end to end on a real installation from a clean
  `webCorsOriginList`: dialog appears, approving it adds the origin, and the
  next probe connects without a restart.
* The add-on's behaviour re-checked against the **installed** version rather
  than the source read for this plan — AnkiConnect's canonical repository has
  moved to SourceHut and the GitHub tree may lag.

## Risks

* **Confusing "reachable" with "usable".** Test 4 is the one that matters;
  without it the extension will report itself healthy and fail at `addNote`.
* **Anki version drift.** Field and model responses vary across versions.
  Validate, and fail with `malformed-response` rather than half-working.
