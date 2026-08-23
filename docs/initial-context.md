# Initial context

The authoritative description of Anklipper's architecture: what the layers
are, where their boundaries run, how the extension's contexts talk to each
other, and which permissions it holds. `AGENTS.md` requires this file to be
updated in the same change as anything it describes.

For what the extension does, see the [README](../README.md). For how to build
and test it, see the [developer guide](developer-guide.md). For what is being
built next, see [the plan index](plans/00-plan.md).

Written at M2, which is the milestone that created the extension skeleton.
Where a layer named below does not exist yet, this file says so.

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
| Typed messaging | `src/messaging/` | ports | M2 |
| Platform wrappers (ports + adapters) | `src/platform/` | `browser.*` | M2 |
| Manifest constants | `src/manifest/` | nothing | M2 |
| Background context | `src/background/` | ports, messaging | M2 |
| Page context | `src/content/` | ports, messaging | M2 |
| Sidebar UI | `src/sidebar/` | ports, messaging | M2 |
| AnkiConnect adapter | `src/anki/` | `fetch` | M4 |
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

Not built yet; M3 owns it. `CardDraft` is the only contract between
generation, the editor, and AnkiConnect (P4), and it stays independent of
Svelte and of AnkiConnect. Cloze is a note-type flavour rather than a
separate model (P7): deletions are `{{cN::…}}` markup inside a field, so
producing and parsing them is string work belonging to the card model.

## AnkiConnect

Not built yet; M4 owns the client and its error taxonomy, M9 the user-facing
onboarding. Two constraints already shape the skeleton:

**The extension's origin is read at runtime, never hardcoded** (P8, 2.6).
AnkiConnect rejects any request whose `Origin` is absent from its
`webCorsOriginList`, and the extension's origin is not allowlisted by
default. Firefox mints a fresh `moz-extension://<uuid>` per installation, so
no constant is correct for two users. `OriginPort.extensionOrigin()` reads it
from `runtime.getURL("")` and strips the trailing slash an `Origin` header
never carries.

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
production builds. AnkiConnect's optional `apiKey`, once M4 supports it,
never appears in a log or in diagnostics.
