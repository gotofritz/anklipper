# Initial context

The authoritative description of Anklipper's architecture: what the layers
are, where their boundaries run, how the extension's contexts talk to each
other, and which permissions it holds. `AGENTS.md` requires this file to be
updated in the same change as anything it describes.

For what the extension does, see the [README](../README.md). For how to build
and test it, see the [developer guide](developer-guide.md). For what is being
built next, see [the plan index](plans/00-plan.md).

Written at M2, which created the extension skeleton, extended at M3 with the
card model and the ports, and at M4 with the AnkiConnect adapter behind the
first of them. Where a layer named below does not exist yet, this file says
so.

## What the extension is

A browser extension that turns text selected on a web page into an Anki card,
by talking to the AnkiConnect add-on on a local Anki. Firefox is the target
that ships; Chrome is kept compiling and is not exercised until after the
first release (P5).

## Layers

Card generation and the UI depend on interfaces — ports — and never on
AnkiConnect or `browser.*` directly (P3). Every port has a real
implementation and an in-memory fake, and tests run against the fake.

| Layer | Directory | Depends on | Exists |
|-------|-----------|------------|--------|
| Result type | `src/core/` | nothing | M2 |
| Card model, card generation | `src/core/` | nothing | M3 |
| Ports and their fakes | `src/core/ports/` | the card model | M3 |
| Typed messaging | `src/messaging/` | ports | M2 |
| Platform wrappers (ports + adapters) | `src/platform/` | `browser.*` | M2 |
| Manifest constants | `src/manifest/` | nothing | M2 |
| Background context | `src/background/` | ports, messaging | M2 |
| Page context | `src/content/` | ports, messaging | M2 |
| Sidebar UI | `src/sidebar/` | ports, messaging | M2 |
| AnkiConnect adapter | `src/anki/` | the card model, `fetch` | M4 |
| Entrypoints | `src/entrypoints/` | everything | M1 |

The dependency rule is one-directional: `platform` knows about the browser,
`messaging` knows about `platform`'s ports, and the three contexts know about
both. Nothing below knows about anything above. ESLint enforces the bottom of
that stack — `src/core/`, `src/manifest/`, and `src/messaging/` may not import
`wxt/browser`, `webextension-polyfill`, or Svelte.

### `src/platform/` — the only place `browser.*` is reached

Decision 2.3. Each module is one port interface plus its real implementation,
so the surface a fake has to cover stays small.

| Module | Port | Wraps |
|--------|------|-------|
| `storage.ts` | `StoragePort` | `browser.storage.local` |
| `runtime-messaging.ts` | `RuntimeMessagingPort` | `runtime.sendMessage`, `runtime.onMessage`, `tabs.sendMessage` |
| `tabs.ts` | `TabsPort` | `browser.tabs.query` |
| `context-menus.ts` | `ContextMenusPort` | `browser.contextMenus` |
| `permissions.ts` | `PermissionsPort` | `browser.permissions` |
| `origin.ts` | `OriginPort` | `runtime.getURL` |
| `sidebar.ts` | `SidebarPort` | `sidebarAction` **or** `sidePanel` |

In-memory fakes live in `src/platform/fakes/`.

### The sidebar wrapper

P2 puts the UI in the sidebar, and the two browsers spell it differently:
Firefox has `sidebarAction`, Chrome has `sidePanel`. `SidebarPort` is one
interface over both, with a single method — `open(fromGesture)`.

It promises only what both browsers can do. It does **not** promise per-tab
scoping: Chrome's panel is scoped to a tab or a window, while Firefox's
sidebar is per window and survives tab navigation. The wrapper passes the
gesture's tab to Chrome and nothing at all to Firefox.

Both browsers require `open` inside the gesture's own task, so the wrapper
reaches the browser API before it awaits anything. That is asserted by a
test, because an `await` added in front of it later would break the context
menu in a way no type checks.

## Messaging between contexts

The extension has three contexts — background, content script, sidebar — and
one channel between them.

**Every message is a member of one discriminated union** on a `type` field,
declared in `src/messaging/types.ts` (2.1). All three contexts import that
module; the shared import is what stops them drifting apart. Its companion,
`ResponseMap`, says what each message is answered with.

**Every message is answered with a `Result`** (2.2), never a bare value and
never a thrown error:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

A caller that forgets the failure branch is a type error rather than an
unhandled rejection in production.

The pieces:

- `createRegistry()` — a context registers a handler per message type.
  `dispatch` turns an incoming, untrusted value into a reply and never
  throws. An unrecognised type is rejected as `unknown-message` rather than
  dropped; a handler that throws becomes `handler-failed`, and the exception
  does not escape the context it happened in.
- `createMessenger(port)` — typed sending, over a `RuntimeMessagingPort`.
  `send` reaches the background or the sidebar; `sendToTab` reaches a content
  script.

### Failures that are normal, not exceptional

`MessagingError` names five:

| Kind | Means |
|------|-------|
| `no-receiver` | Nothing was listening. The sidebar is closed, the page is privileged, or the tab predates the extension. |
| `transport-failed` | The channel itself failed for another reason. |
| `unknown-message` | No handler is registered for that type — or it was not a message at all. |
| `handler-failed` | A handler threw at the far end. |
| `malformed-reply` | Something answered without a `Result`. |

`no-receiver` is the common one and is not an error condition: the content
script is genuinely absent on `about:` and `chrome://` pages, on the
browser's own add-on listing, in the PDF viewer, and in every tab that was
already open when the extension was installed.

### No state in module scope

Firefox's background is an event page and Chrome's is a service worker.
**Both are unloaded when idle**, so module-scope state disappears without
warning and `startBackground` runs again on the next wake-up. Anything
durable goes through `StoragePort` from the moment it exists — retrofitting
this later means rewriting the draft flow.

## Card model

`CardDraft` is the only contract between generation, the editor, and
AnkiConnect (P4). It is a plain immutable value (3.3) in `src/core/`, with no
dependency on Svelte, on AnkiConnect, or on `browser.*` — every transition is
a pure function returning a new draft.

| Module | Holds |
|--------|-------|
| `note-type.ts` | `NoteType`: name, field names in Anki's order, `kind`, required fields |
| `draft.ts` | `CardDraft`, `DraftIssue`, and every transition |
| `cloze.ts` | The `{{cN::…}}` parser and the string transforms over it |
| `validate.ts` | `validateDraft` — the issue list |
| `generate.ts` | `generateBasicCard` — selection plus page context to a draft |
| `ports/` | `AnkiClient`, `DraftStore`, `SettingsStore`, and their fakes |

**Fields are keyed by the note type's real field names** (3.1). A positional
array breaks the moment a note type is edited in Anki.

**Changing note type remaps by name; unmatched content is stashed, never
dropped** (3.2). Fields whose names exist in both carry over. The rest move to
`draft.stash`, keyed by the note type they came from, and are restored — into
blank fields only — if the user switches back. The stash is bounded two ways:
restoring consumes it, and clearing a field clears that name out of every
stash, because content the user deliberately emptied must not reappear.

**Validation returns a list of typed issues, not a boolean** (3.4), so the
editor can name the field and say why. It reports every issue rather than
stopping at the first.

**Provenance is kept verbatim and separately** (3.6). `draft.source` holds the
selection exactly as captured, plus the surrounding context, URL, and title,
while the fields are edited freely. `draft.generation` names the generator and
its version, so a later AI generator is distinguishable from this one.

### Cloze

Cloze is a note-type flavour rather than a separate model (P7, 3.7):
`NoteType.kind` is `"standard"` or `"cloze"`, read off the note type rather
than chosen by the user, and `noteTypeKindOf(draft)` is how the rest of the
code asks.

Deletions live as `{{cN::answer::hint}}` markup **inside the field text**
(3.8) — Anki's own representation is the single source of truth, so there is
no parallel list of ranges to drift out of sync. `cloze.ts` parses on demand.

- A new deletion takes `max(ordinal) + 1`; passing an ordinal explicitly
  reuses it, which is how several spans are grouped under one `cN` (3.9).
- Overlapping deletions are rejected. Ordinal **gaps are left alone** —
  renumbering happens only when asked for (3.10).
- Markup is round-trip validated rather than escaped (3.11): captured web text
  may contain braces, so `addDeletion` re-parses what it produced and refuses
  when the result would not mean what was intended. Anything beginning `{{c`
  that the parser cannot account for becomes a typed issue, never a silent
  reinterpretation.
- Basic ↔ Cloze share no field name, so switching stashes everything per 3.2.
  `convertToCloze` / `convertFromCloze` additionally carry the primary field
  across — `Front` into `Text` and back, stripped of markup — and are an
  explicit user action, never automatic (3.12).

Character ranges are read against the text as given and used immediately: a
transition takes text plus a range and returns new text, and never holds an
offset across an edit.

## Ports

The domain layer talks to interfaces, never to AnkiConnect or `browser.*`
(P3). `src/core/ports/types.ts` declares three; the adapters that implement
them arrive later, and each ships an in-memory fake in
`src/core/ports/fakes/` that tests run against.

| Port | Answers with | Real implementation |
|------|--------------|---------------------|
| `AnkiClient` | `Result<…, AnkiError>`, `AnkiConnection`, `AnkiHandshake` | `src/anki/`, M4 |
| `DraftStore` | `Result<…, DraftStoreError>` | over `StoragePort`, M7 |
| `SettingsStore` | `Result<…, SettingsStoreError>` | over `StoragePort`, M8 |

Every fake can be driven into failure with `failWith(error)`, because each
consumer has to be able to test its own error path. A fake that only ever
succeeds would hide exactly the cases the error taxonomy exists for.

## AnkiConnect

`src/anki/` is the only place in the codebase that knows AnkiConnect's wire
format (M4). Everything above it depends on the `AnkiClient` port and takes
this as one implementation of it; M9 owns the user-facing onboarding built on
the causes it reports.

| Module | Holds |
|--------|-------|
| `protocol.ts` | The request envelope, and one validator per reply shape. |
| `transport.ts` | `fetch`, the timeout, and the classification of everything that fails before a reply is parsed. |
| `errors.ts` | AnkiConnect's error strings, turned into typed causes. |
| `mapping.ts` | `CardDraft` → note params, and note-type descriptors. |
| `client.ts` | The port implementation, the probe, and the handshake. |
| `dev-harness.ts` | A development-only harness for the manual checks, absent from every build. |

**Nothing here imports `browser.*` or Svelte,** and ESLint enforces it for the
directory. The two things the adapter needs from the browser are injected as
plain values: the extension's own origin as a string, and whether the loopback
host permission has been granted as a function. So the whole layer is testable
against a stubbed `fetch`, and no test needs a running Anki.

### "Unavailable" is not one thing

The probe answers with a **cause**, never a boolean (4.3), because each has a
different fix: Anki not running, the add-on not installed, the origin rejected,
the host permission not granted, an API key required, the handshake declined, a
timeout, a malformed reply, or an API-level error. `AnkiError` carries the
add-on's own words, plus `origin` on `origin-rejected` — so M9 can show the
user the value to paste — and `needsManualFix` on a cause no retry will clear.

A rejected origin and a dead port are indistinguishable from the browser's
side: the add-on answers a non-allowlisted origin with
`Access-Control-Allow-Origin: http://localhost`, so the extension cannot read
even the 403 it sends, and both surface as a failed `fetch`. The transport
separates them with a `no-cors` request, which resolves opaque when something
is listening and rejects when nothing is — evidence, not proof, so the probe
reports `confident: false` and names the alternatives it could not rule out.
**This technique has not yet been confirmed on a real Firefox profile.**

### Onboarding is a handshake, not a config edit

The add-on's `requestPermission` action reaches it even from a non-allowlisted
origin and prompts inside Anki; on approval it appends the origin and saves the
config (P9). Its reply is unreadable from a rejected origin, so the adapter
treats it as fire-and-then-re-probe: `asked` means the dialog is up and only a
following probe establishes what the user did. A readable refusal is
`permission-denied` with `needsManualFix`, because an origin in the add-on's
`ignoreOriginList` never sees the dialog again and only a config edit clears
it. Hand-editing `config.json` stays the documented fallback. `"*"` in
`webCorsOriginList` is never suggested: it is honoured, and would let any site
the user visits drive their collection.

### What the adapter does and does not decide

* **Duplicates are a warning, not a block** (4.4). `canAddNote` reports one
  through `canAddNotes`; `addNote` sends `allowDuplicate: true`, so a user who
  is told and goes ahead anyway is not stopped.
* **The fields go out verbatim, and nothing is injected.** Source URL and title
  are provenance on the draft (3.6); a note type with a field for them is
  filled by the editor. Cloze braces are passed through untouched — parsing
  them belongs to the card model.
* **Cloze flavour is read from the note type's templates**, via
  `modelTemplates`, and falls back to M3's name heuristic only when the
  templates cannot be read (4.6). The descriptor carries it, so no layer above
  re-derives it.
* **Every reply is validated, never cast** (4.5), and a reply that does not
  validate is `malformed-response` rather than a crash three layers away.
* **Every call has a timeout**, because Anki can accept a connection and never
  answer.
* Requests carry **no headers**, which keeps every call a CORS-simple request
  and takes the add-on's preflight handling out of the path.

**The extension's origin is read at runtime, never hardcoded** (P8, 2.6).
AnkiConnect rejects any request whose `Origin` is absent from its
`webCorsOriginList`, and the extension's origin is not allowlisted by default.
Firefox mints a fresh `moz-extension://<uuid>` per installation, so no constant
is correct for two users. `OriginPort.extensionOrigin()` reads it from
`runtime.getURL("")` and strips the trailing slash an `Origin` header never
carries.

**The extension's identity is pinned** (2.4), so that origin survives a
reload — otherwise the user's own allowlist entry would break every time.
Firefox: `browser_specific_settings.gecko.id`. Chrome: `key`, which fixes the
id an unpacked build loads under. Both live in `src/manifest/manifest.ts`.

## Permissions

The MVP ceiling, from the plan index. Anything beyond it needs a written
justification in the subplan that adds it.

| Permission | Why |
|------------|-----|
| `activeTab` | Reach the page the user invoked the extension on. |
| `scripting` | Inject the content script there, on that gesture. |
| `contextMenus` | The **Create Anki Card** entry (M5). |
| `storage` | Settings and the draft, since the background is unloaded when idle. |
| `sidePanel` | Chrome's sidebar. Firefox needs no permission for its own. |
| `http://127.0.0.1:8765/*` | The local AnkiConnect. The only host contacted. |

**Never `<all_urls>`.** `activeTab` plus `scripting` on a user gesture covers
the extraction this extension needs.

The content script is therefore registered at runtime with no match patterns.
A manifest-declared content script needs match patterns, and those become
install-time host permissions the ceiling does not allow.

`src/manifest/manifest.ts` holds the declared set and is pinned by
`manifest.test.ts`; WXT adds Chrome's `sidePanel` permission itself, from the
sidepanel entrypoint, and `tests/manifest/generated-manifest.test.ts` holds
the emitted manifest for both targets to the table above. Widening
permissions breaks a test rather than slipping through a diff.

**On Firefox MV3 a declared host permission is not granted at install**
(2.7). The extension checks `PermissionsPort.has()` at runtime and requests
it from a user gesture. Chrome grants it at install, so the check is a no-op
there — which is the point: one code path, correct on both.

## Privacy

Selected page text and page context are potentially sensitive. Through M11
they travel only to loopback. Nothing that carries page content is logged in
production builds. AnkiConnect's optional `apiKey` is carried on every action
except the handshake and appears in no log and no diagnostic: the adapter's
`describeAnkiConnection()` reports whether one is configured, never its
value.
