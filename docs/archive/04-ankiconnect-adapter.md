# M4 — AnkiConnect adapter

Index: `00-plan.md`. Depends on: M3. Blocks: M6–M9.

## As built

Archived on completion. Where the milestone landed differently from the plan
below:

* **The port grew the probe and the handshake.** `AnkiClient` now declares
  `probe()` and `requestPermission()` alongside the four data operations, so
  M9's onboarding talks to the same interface everything else does rather than
  reaching past it into the adapter. `AnkiErrorKind` gained the five causes the
  taxonomy names — `permission-missing`, `permission-denied`,
  `api-key-required`, `empty-cloze`, `timeout` — and `AnkiError` gained two
  optional fields: `origin`, which `origin-rejected` carries so M9 can show the
  user their own value, and `needsManualFix`, which marks a cause no retry can
  clear.
* **The handshake has four outcomes, not three.** `granted`, `denied`, and
  `asked` are 4.7's; `blocked` was added for "could not even ask", which is
  what a missing host permission means. Folding it into `denied` would have
  told the user Anki refused them when Anki was never contacted.
* **Confidence lives on the probe's result, not on the error.** `AnkiConnection`
  carries `confident` and `alternatives`; the transport passes them up
  internally on an adapter-local `AnkiFailure`, and every other operation
  narrows them away. Only the probe has anything to say about them.
* **`allowDuplicate` is `true`, and M3's fake was corrected to match.** 4.4
  makes a duplicate a warning rather than a block, and `AnkiClient.addNote`
  takes no override — so a request that refused duplicates would turn the
  warning into a block with no way past it. `canAddNote` is what reports the
  duplicate; the add that follows the user's decision goes through.
  `createFakeAnkiClient` refused duplicates from `addNote`, which would have
  had M6 build a block against the fake and then find the real adapter
  disagreed; it now records the note and leaves `failWith` as the way to drive
  the refusing path.
* **The adapter injects nothing into the fields** (the source field policy).
  It sends the note type's own fields verbatim and nothing else. The source URL
  and title are provenance the model keeps alongside the fields (3.6); writing
  them into a field the user did not fill is the editor's decision, not this
  layer's. Cloze braces are passed through untouched.
* **No request headers at all.** A `Content-Type: application/json` would make
  every call a preflighted one and add the add-on's OPTIONS handling to the
  list of things that can go wrong. Without headers the call is a CORS-simple
  request, and AnkiConnect parses the body as JSON regardless of what the
  browser labels it.
* **The envelope's version is pinned at `6`; the *reported* version is read.**
  4.9's rule is honoured where it can be: the add-on rejects an envelope naming
  a version it does not know, so the request has to name one, and `version` and
  the handshake reply are what supply the number the adapter reports.
* **`modelTemplates` is the action behind 4.6**, with M3's name heuristic as
  the fallback when it cannot be read — an unreadable template list costs the
  flavour of one note type rather than the whole list. `noteTypes()` therefore
  makes `1 + 2N` requests. On loopback that is cheap, and it is the price of
  not guessing.
* **The two things the adapter needs from the browser are injected as plain
  values**: `origin` as a string from `OriginPort.extensionOrigin()`, and
  `hasHostPermission` as a function over `PermissionsPort`. No `browser.*` or
  Svelte import appears anywhere in `src/anki/`, and ESLint now enforces that
  for the directory.
* **`empty-cloze` is settled from the draft, not only from the message.** Anki
  refuses a cloze note with no deletions using the same "it is empty" it uses
  for a blank first field. `classifyAddNoteError` takes the draft, so when the
  note type is cloze-flavoured and its primary field parses to zero deletions,
  the cause is `empty-cloze` — which is the case 4.3 exists for, since the two
  need different fixes.

### The manual pass, and what it changed

Run against a real Anki on a real Firefox profile after the adapter was
written, using `src/anki/dev-harness.ts`. Anki **25.09.4**, AnkiConnect from
AnkiWeb last modified **2025-11-09** (its `meta.json` declares no version
string; `mod` is `1762717231`). Three of the plan's assumptions did not
survive it.

**`origin-rejected` did not reproduce, and looks unreachable.** The plan calls
it "the single most likely first-run state". It is not a state this extension
reaches. With the loopback host permission granted, a background-page request
carrying `Origin: moz-extension://<uuid>` — an origin absent from
`webCorsOriginList` — was served normally: `version` answered 6, `addNote`
added. So the add-on does not enforce the allowlist server-side; it sets CORS
response headers and leaves the enforcing to the browser, and a granted host
permission exempts the extension from that. Without the permission the adapter
returns `permission-missing` before any request goes out. There is no third
path, so no call site reaches `origin-rejected`.

Two things follow. `webCorsOriginList` constrains web pages and not this
extension — which is also the sharpest argument against ever suggesting `"*"`,
since web pages are the one class it does constrain. And **P9 is reopened** in
the plan index: the `requestPermission` handshake may be solving a problem the
extension does not have.

**So `origin-rejected` and the `no-cors` probe are gone**, and the confidence
flag with them. The flag existed to express the ambiguity between a rejected
origin and a dead port; with one of the two removed, every cause the probe can
report is determinate, and a flag that is always `true` says nothing. That
takes `AnkiConnection` down to `connected | unavailable`, deletes the
adapter-local `AnkiFailure`, and removes deliverable 4.3's "plus a confidence
flag" along with the plan's error-taxonomy entry for `origin-rejected` and its
test 4. A guard for a case no call site can reach is a claim the code cannot
keep, and the second request per failure was real cost paid for it.

**The `requestPermission` handshake went too**, and with it `permission-denied`,
`AnkiHandshake`, and `AnkiError`'s `origin` and `needsManualFix` fields, which
had no other user. It was kept for one commit on the grounds that P9 was pinned
and M9 owned the decision. That was the wrong call: an unused path kept pending
a decision is one nobody later dares delete, and the evidence against it was
already in hand. **P9 is reversed in the plan index**, which is where a pinned
decision has to change. Restoring it is one action and one reply shape, both in
git, if a different AnkiConnect ever turns out to need it.

What remains between the extension and Anki is the loopback host permission,
which Firefox MV3 makes the user grant at runtime (2.7). That is the whole of
onboarding now, and it is M9's.

**`empty-cloze` did not reproduce, and has been removed.** Anki accepted a
cloze note whose only field held no deletions — twice, returning a note id
rather than an error. The cause was designed as a backstop for M3's validation
and Anki disagreeing; they do not disagree, because Anki has no opinion.
`classifyAddNoteError` only ran on an error, so the whole path was unreachable
and test 12 passed against a refusal that does not happen.

So the taxonomy no longer carries `empty-cloze`, `classifyAddNoteError` and the
harness's `emptyCloze` sample are gone, and `addNote` classifies its errors
like every other operation. A branch no call site can reach is not a safety
net; it is a claim the code makes and cannot keep. This is a departure from the
plan's error taxonomy and from its test 12, decided on the evidence.

The consequence belongs to M6: `validateDraft`'s `cloze-no-deletions` is the
**only** thing standing between a user and a cloze note that generates
nothing, so the editor has to enforce it rather than treat it as advisory.

**What did hold.** The probe reports `connected` with the API version read
from the add-on (4.9). `deckNames`, `modelNames`, `modelFieldNames` and
`modelTemplates` all validated with no failures. `anki-not-running` is
reported correctly with Anki shut down. `addNote` returned real note ids for a
basic and a cloze draft.

4.6 held in the strongest available form, and by luck rather than design: the
survey reported `["Cloze", "Image Occlusion"]` as cloze-flavoured. Anki's
built-in **Image Occlusion** is cloze-based and its name matches nothing in
M3's `/cloze/i` heuristic, so the template read caught a note type the
fallback would have missed — the custom-note-type check the plan asks for,
satisfied by a note type every Anki ships.

### Still unverified

* `api-key-required` against an add-on with `apiKey` set.
* Whether any of this holds on a different AnkiConnect. The pass covers one
  build, and "does it enforce the allowlist" is exactly the kind of thing that
  varies — the canonical repository has moved to SourceHut and the GitHub tree
  may lag.
* Chrome. The reasoning behind the removal — a granted host permission exempts
  the request from CORS — should hold for an MV3 service worker too, but it
  was not tested there (P5 defers Chrome).

### Decisions pinned beyond the table below

| # | Decision | Note |
|---|----------|------|
| 4.10 | The adapter sends the note type's own fields and injects nothing | Source stays provenance on the draft; a note type with a `Source` field is filled by the editor, not here. |
| 4.11 | Requests carry no headers, keeping every call a CORS-simple request | No preflight, so the add-on's OPTIONS handling is never in the path. |
| 4.12 | `addNote` sends `allowDuplicate: true` | The only way 4.4's warning stays a warning, given `addNote(draft)` takes no override. |
| 4.13 | `empty-cloze` is **not** in the taxonomy | Removed after the manual pass: Anki accepts a deletion-less cloze note, so nothing could ever raise it. M3's validation is the guard. |
| 4.14 | `origin-rejected` is **not** in the taxonomy, and the probe reports no confidence | Removed after the manual pass: the add-on does not enforce its allowlist server-side, and a granted host permission exempts the extension from the browser's CORS check, so no call site reaches it. With it gone every remaining cause is determinate. |
| 4.15 | The `requestPermission` handshake is **not** implemented, reversing P9 | Nothing is left for it to unblock. `permission-denied`, `AnkiHandshake`, and `AnkiError`'s `origin` and `needsManualFix` go with it. The host permission is the whole of onboarding, and it is M9's. |

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
