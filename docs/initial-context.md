# Initial context

The authoritative description of Anklipper's architecture: what the layers
are, where their boundaries run, how the extension's contexts talk to each
other, and which permissions it holds. `AGENTS.md` requires this file to be
updated in the same change as anything it describes.

For what the extension does, see the [README](../README.md). For how to build
and test it, see the [developer guide](developer-guide.md). For what is being
built next, see [the plan index](plans/00-plan.md).

Written at M2, which created the extension skeleton, extended at M3 with the
card model and the ports, at M4 with the AnkiConnect adapter behind the first
of them, at M5 with selection capture — the context menu, the shortcut, and
the extraction that fills a draft — and at M6 with the sidebar editor built
on all of it. Where a layer named below does not exist yet, this file says
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
| Capture value (`PageCapture`) | `src/core/capture.ts` | nothing | M5 |
| Ports and their fakes | `src/core/ports/` | the card model | M3 |
| Typed messaging | `src/messaging/` | ports | M2 |
| Platform wrappers (ports + adapters) | `src/platform/` | `browser.*` | M2 |
| Manifest constants | `src/manifest/` | nothing | M2 |
| Background context | `src/background/` | ports, messaging | M2 |
| Page context | `src/content/` | ports, messaging | M2 |
| Sidebar UI | `src/sidebar/` | ports, messaging | M2 |
| Sidebar editor: view-model and components | `src/sidebar/` | ports, the card model | M6 |
| Page extraction | `src/content/extract.dom.ts` | `PageCapture`, a document | M5 |
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
| `scripting.ts` | `ScriptingPort` | `browser.scripting.executeScript` |
| `commands.ts` | `CommandsPort` | `browser.commands.onCommand` |
| `draft-store.ts` | `DraftStore` (the M3 port) | `StoragePort` |

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

The union has three members: `ping`, `capture-selection` (background to a
content script, M5), and `get-draft` (sidebar to the background, M5).

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
| `capture.ts` | `PageCapture`, `CaptureWarning`, and the extraction caps |
| `generate.ts` | `generateBasicCard`, `generateFromCapture` — selection plus page context to a draft |
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
selection exactly as captured, plus the surrounding context, URL, and title —
and, from M5, the nearest heading and the selection's original HTML (5.2).
`draft.generation` names the generator and its version, so a later AI
generator is distinguishable from this one, and carries the capture's
warnings so the editor can say what could not be read (5.4).

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

## Capture

One user gesture — the **Create Anki Card** context-menu entry or its
keyboard shortcut — becomes a stored draft. `src/background/capture.ts` is
the whole path, and it is one path however the gesture arrived.

**The page is read by a content script, not by the menu event** (5.1). The
event's `selectionText` is truncated by the browser and carries no
surroundings, so it cannot supply the block or heading the card model asks
for. It is kept as the fallback for a page no content script can run in.

**Fields carry plain text; the original markup is kept beside them** (5.2).
Line breaks survive; the HTML fragment goes to `source.html` for a later
milestone to offer rich capture from, without re-extracting. This governs
capture, not editing.

**The bounds are structural, not arithmetic** (5.3). The selection is capped
at 10 000 characters and the surrounding context at 1 000; the context itself
is the nearest block-level ancestor's text, and the heading is the nearest
preceding `h1`–`h6`. A block ancestor respects the document's structure
instead of slicing mid-sentence, and a wrapper with no text of its own is
climbed past, bounded.

**Blind spots fail loudly and specifically** (5.4). `getSelection()` does not
reach into a shadow root, a cross-origin frame is a separate context, and the
built-in PDF viewer runs no content script at all. Each becomes a named
`CaptureWarning` on the capture, carried into `draft.generation.warnings` and
shown in the sidebar. Where the menu event carried text, a degraded draft is
still made: a degraded card beats no card, provided the degradation is
visible.

**The sidebar is opened first, inside the gesture's own task — and then not
waited for.** Both browsers require the call inside the gesture, so
`captureFromGesture` is not `async` and reaches `sidebar.open()` before it
awaits anything. Nothing else waits on that promise: Firefox's sidebar is
already open for every capture after the first, and what `sidebarAction.open()`
does then is not this extension's to rely on. The capture reads the page and
stores the draft first, and only then gives the sidebar a bounded moment to
answer, timing out into `open-timed-out`. A sidebar the user can open
themselves is a far smaller problem than a capture that produced nothing.

The draft is stored, and the sidebar reads it back out with `get-draft` — the
two finish in no fixed order, and the background is unloaded when idle, so
nothing is held in memory between them.

**The sidebar re-reads on every capture, not only on mount.** Firefox's
sidebar persists per window, so after the first card it is already open when
the next gesture happens. It watches the draft key through
`StoragePort.onChanged` and pulls again; reading once on mount would leave it
showing the previous card. Pushing a draft into a live sidebar is still 7.4's.

**A capture reports what it did.** `describeCapture` reduces the result to
kinds, our own messages, and the sidebar's error — never the draft, the
selection, or the page — and the background hands that to an optional
reporter. A failed capture stores nothing, so without it the failure reaches
the user as a sidebar that appears to do nothing. Development builds log it;
production wires no reporter.

**Nothing is injected at page load.** The content script is registered with no
match patterns; a tab with none answers `no-receiver`, which buys exactly one
`scripting.executeScript` and one retry.

## Ports

The domain layer talks to interfaces, never to AnkiConnect or `browser.*`
(P3). `src/core/ports/types.ts` declares three; the adapters that implement
them arrive later, and each ships an in-memory fake in
`src/core/ports/fakes/` that tests run against.

| Port | Answers with | Real implementation |
|------|--------------|---------------------|
| `AnkiClient` | `Result<…, AnkiError>`, `AnkiConnection`, `AnkiHandshake` | `src/anki/`, M4 |
| `DraftStore` | `Result<…, DraftStoreError>` | `src/platform/draft-store.ts`, over `StoragePort`, M5 |
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
| `client.ts` | The port implementation and the probe. |
| `dev-harness.ts` | A development-only harness for the manual checks, absent from every build. |

**Nothing here imports `browser.*` or Svelte,** and ESLint enforces it for the
directory. The two things the adapter needs from the browser are injected as
plain values: the extension's own origin as a string, and whether the loopback
host permission has been granted as a function. So the whole layer is testable
against a stubbed `fetch`, and no test needs a running Anki.

### "Unavailable" is not one thing

The probe answers with a **cause**, never a boolean (4.3), because each has a
different fix: Anki not running, the add-on not installed, the origin rejected,
the host permission not granted, an API key required, a timeout, a malformed
reply, or an API-level error. `AnkiError` carries the
add-on's own words, plus `origin` on `origin-rejected` — so M9 can show the
user the value to paste — and `needsManualFix` on a cause no retry will clear.

The plan expected a fourth cause, `origin-rejected`, and expected it to be
indistinguishable from a dead port — both surfacing as a failed `fetch`, to be
separated by a `no-cors` probe. **It is not in the taxonomy**: M4's manual pass
found the add-on serving a background-page request whose `Origin` was absent
from `webCorsOriginList`. AnkiConnect does not enforce its allowlist
server-side; it sets CORS response headers and leaves the enforcing to the
browser, and a granted host permission exempts the extension from that.
Without the permission the adapter answers `permission-missing` before any
request goes out. There is no third path, so no call site could reach it.

With that gone every remaining cause is determinate, which is why the probe
reports no confidence flag: one that is always `true` says nothing.

### Onboarding is the host permission, and nothing else

The plan pinned onboarding on the add-on's `requestPermission` handshake (P9),
which prompts inside Anki and appends the extension's origin to
`webCorsOriginList` on approval. **P9 is reversed** and the handshake is not
implemented: there is nothing for it to unblock, since the add-on serves this
extension whether or not it is allowlisted. Restoring it is one action and one
reply shape if a different AnkiConnect version ever needs it.

What is left is the loopback host permission, which Firefox MV3 does not grant
at install — the user grants it at runtime, from a user gesture (2.7). Until
they do, every operation answers `permission-missing` before touching the
network. That is the whole of onboarding, and M9 owns the flow.

`"*"` in `webCorsOriginList` is never suggested. Web pages are the one class
CORS does constrain, so widening the list is precisely how a site the user
visits would get to drive their collection. Nothing about the allowlist gates a
client that is not subject to CORS — curl, a native app, or an extension
holding the host permission — so the extension must not describe it as
protection against itself.

### What the adapter does and does not decide

- **Duplicates are a warning, not a block** (4.4). `canAddNote` reports one
  through `canAddNotes`; `addNote` sends `allowDuplicate: true`, so a user who
  is told and goes ahead anyway is not stopped.
- **The fields go out verbatim, and nothing is injected.** Source URL and title
  are provenance on the draft (3.6); a note type with a field for them is
  filled by the editor. Cloze braces are passed through untouched — parsing
  them belongs to the card model.
- **Cloze flavour is read from the note type's templates**, via
  `modelTemplates`, and falls back to M3's name heuristic only when the
  templates cannot be read (4.6). The descriptor carries it, so no layer above
  re-derives it.
- **Every reply is validated, never cast** (4.5), and a reply that does not
  validate is `malformed-response` rather than a crash three layers away.
- **Every call has a timeout**, because Anki can accept a connection and never
  answer.
- Requests carry **no headers**, which keeps every call a CORS-simple request
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

## The sidebar editor

`src/sidebar/` is the whole UI (M6). It is handed an `AnkiClient` and renders
a `CardDraft`. It holds no protocol knowledge and reaches no `browser.*` API,
so its tests run against M3's in-memory fake rather than a running Anki.

| Module | Holds |
|--------|-------|
| `Panel.svelte` | The shell: connection status, and the editor once there is a client to build it against. |
| `editor-model.svelte.ts` | The view-model — the draft, the asynchronous state, and every intent. |
| `CardEditor.svelte` | The form: deck, note type, fields, source, warnings, actions. |
| `ClozeControls.svelte` | The deletion list, and the two things done to it. |
| `TagEditor.svelte` | Tags in, intents out. |
| `error-copy.ts` | Every sentence the editor says about a failure. |
| `connect.ts` | The two reads the panel makes over the message channel (M5). |

**One view-model between the components and the ports** (6.2). Loading and
error state lives there instead of being scattered across components, which
hold nothing of their own beyond the text in a tag box and which ordinal a
dropdown is on. `editor-model.svelte.ts` is a Svelte rune module: the
`.svelte.ts` suffix is what gets it compiled, which is what makes `$state`
work outside a component. The draft it holds is `$state.raw`, since a draft is
an immutable value replaced whole on every transition (3.3).

**Components emit intents; every transition goes through the card model's pure
functions** (6.1). No component computes a new draft, writes cloze markup, or
decides what a note-type change does to the fields. Those rules are M3's, and
a second copy of one in a dropdown handler is how the UI and the model start
disagreeing.

**Every asynchronous read is idle, loading, ready, or failed** (6.3). A
silently empty deck list is indistinguishable from Anki being closed.

**Failures render as a cause and a next action** (6.4), from M4's taxonomy,
in one module — which M9's onboarding reuses. Every cause has an entry, and
each table is keyed by its own union, so a cause added below without copy here
is a type error rather than a default "something went wrong". The same holds
for M3's `DraftIssue` and `ClozeIssue`, which are what a field error and a
refused mark actually say.

**Native controls with real labels** (6.5): `select`, `textarea`, `input`,
`button`, `details`. A custom listbox would be an accessibility liability
bought for nothing.

**Cloze editing is a plain `<textarea>` and its `selectionStart` /
`selectionEnd`** (6.6) — superseded deliberately by M10's rich editor (P10).
Marking is "wrap this range", which a textarea gives for free. The component
reads the range, hands it to the card model, renders what comes back, and
puts the caret past the markup that was written; otherwise a second mark
lands wherever the value update left the cursor. `Ctrl+Shift+C` is Anki's own
shortcut for it.

**The cloze controls appear for cloze note types only** (6.7), read from
`NoteType.kind` — the adapter's descriptor (4.6) — never by matching the note
type's name in the UI.

**The duplicate warning does not block** (4.4). It appears when `canAddNote`
reports that Anki already holds the first field, and it stops appearing the
moment that field changes: a warning about text the user has already replaced
is worse than no warning.

**The sidebar entrypoint composes the adapter.** `App.svelte` builds
`createAnkiClient` over the runtime origin (P8) and the host-permission check
and hands it to `Panel`, which requires it — a missing one is a `svelte-check`
error, so the editor cannot be left unmounted. Until the user grants the
loopback host permission, every call answers `permission-missing` before
touching the network, and the editor says so and offers to retry; the fields,
tags, and cloze controls work regardless. Persisting the draft, retry, and
deck and note-type defaults are still M7's.

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
install-time host permissions the ceiling does not allow. M5 injects it by
file path on the gesture, and a test pins that path against the built output.

`commands` — the keyboard shortcut, `Alt+Shift+A` — is a manifest key rather
than a permission, so it widens nothing.

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
and appears in no log and no diagnostic: the adapter's
`describeAnkiConnection()` reports whether one is configured, never its
value.
