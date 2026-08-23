# M2 — Extension skeleton

Index: `00-plan.md`. Depends on: M1. Blocks: M3–M12.

## As built

Archived on completion. Where the milestone landed differently from the plan
below:

* **`Result` came first, and lives in `src/core/`.** 2.2 requires every reply
  to be Result-shaped, so the type had to exist before the message channel
  did. `isResult` is part of it: a reply arriving over the channel is
  `unknown` until proven otherwise, and that check is what produces
  `malformed-reply`.
* **The transport and the typed layer have separate error types.**
  `RuntimeMessagingPort` returns `TransportError` (`no-receiver`,
  `transport-failed`); `MessagingError` is those two kinds plus
  `unknown-message`, `handler-failed`, and `malformed-reply`. Otherwise
  `src/platform/` would have had to import from `src/messaging/`, which
  depends on it — the dependency stays one-directional instead.
* **`onMessage` uses `return true` plus `sendResponse`, not a returned
  promise.** Firefox accepts both; Chrome MV3 accepts only this one, and so
  does the fake browser. A returned promise would have passed tests on
  neither.
* **The message union is a single member, `ping`.** It is what the sidebar
  uses to learn the background is up, and what proves the round trip in a
  real browser. `ResponseMap` carries the reply types alongside it, so adding
  a message is one member plus one entry.
* **The registry refuses a second handler for a type**, rather than letting
  the later registration win silently. Two contexts wiring the same type is a
  bug, and the silent version is the expensive kind to find.
* **`src/manifest/manifest.ts` holds the permission ceiling and the pinned
  identity**, and `wxt.config.ts` imports it. Test 6 is therefore two tests:
  one on what this repository declares, one on the manifest WXT actually
  emits for each target. The second exists because WXT adds Chrome's
  `sidePanel` permission itself, from the sidepanel entrypoint — a permission
  can be widened from either side.
* **Test 6 builds both targets inside Vitest**, through WXT's programmatic
  `build()`. About a second per target, against the artefact that ships.
* **The Chrome `key` is committed without its private half.** It fixes the id
  an unpacked build loads under, which is what a developer's AnkiConnect
  allowlist entry is written against — that is what 2.4 asks of it. The
  Chrome Web Store issues its own key at publish, so a store build drops the
  field; there is no CRX signing key to keep.
* **The sidebar wrapper takes its backing APIs as a parameter.**
  `sidebarAction` is Firefox-only and absent from the shared typings, so
  `createSidebar(backings)` is structural and `createBrowserSidebar()` is the
  one place that asserts the browser has that shape. Test 9 runs the same
  contract against a fake of each API.
* **`SidebarPort.open` is not `async`.** Both browsers require the call
  inside the gesture's own task, so the wrapper reaches the backing API
  before it awaits anything, and a test asserts it — an `await` added in
  front of it later would break M5's context menu in a way no type checks.
* **The sidebar panel shows its connection state.** `src/sidebar/Panel.svelte`
  takes a `connect` function rather than building a messenger, so it stays
  free of `browser.*` and every state is testable. It is what makes the
  round trip observable in a real browser, which the done-when asks for.
* **ESLint's boundary rule now covers `src/manifest/` and `src/messaging/`**
  as well as `src/core/`. `src/manifest/` is loaded by WXT at build time,
  outside any browser, so an accidental `wxt/browser` import there would break
  the build rather than a test.
* **Verified in headless Chromium, not Firefox** — the environment that built
  this has no Firefox, as at M1. The Chrome build loads under the pinned id
  `ljhmjineomhkgcghppjplainocnjnfli`, the sidebar's ping round trip completes
  (`Connected to the background.`), the origin helper returns
  `chrome-extension://ljhmjineomhkgcghppjplainocnjnfli`, and there are no
  extension errors. The Firefox half of the done-when — including pasting the
  `moz-extension://` origin into `webCorsOriginList` and reaching AnkiConnect
  — is still outstanding and needs a machine with Firefox and Anki.
* **The context menu is not created.** Only its wrapper exists; the menu
  itself arrives in M5 with the code that handles a click, as the non-goals
  say.

## Goal

The three extension contexts exist, can talk to each other over a typed
message channel, and every `browser.*` call sits behind a wrapper thin enough
to fake. No feature behaviour yet — this milestone is the substrate the rest
of the plan is built on.

## Non-goals

No card model, no selection extraction, no AnkiConnect, no UI beyond an empty
panel. The context menu arrives in M5 with the code that handles it.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 2.1 | Messages are a **discriminated union** on a `type` field, defined in one module both sides import | A shared type is the only thing preventing the background and panel from drifting apart. |
| 2.2 | Every message returns a **`Result`-shaped reply**, never a bare value or a thrown error | `AGENTS.md` requires explicit messaging-failure handling; a union return makes ignoring failure a type error. |
| 2.3 | `browser.*` is reached only through `src/platform/` | Keeps domain code testable and the fake surface small. |
| 2.4 | Extension identity is pinned now: `browser_specific_settings.gecko.id` for Firefox, `key` for Chrome | The origin must be stable before anyone adds it to AnkiConnect's `webCorsOriginList` (see index, *AnkiConnect reachability*). |
| 2.6 | A **runtime origin helper** in `src/platform/`, built on `runtime.getURL("")` | P8. Firefox's `moz-extension://<uuid>` is per installation, so the origin cannot be a constant anywhere in the codebase. |
| 2.7 | The loopback host permission is **checked at runtime and requested from a gesture** | Firefox MV3 does not grant declared host permissions at install. Chrome does, so the check is a no-op there — which is the point: one code path, correct on both. |
| 2.5 | Permissions land here, at the index's MVP ceiling, and no wider | |

## Deliverables

* Background, content-script, and sidebar entrypoints, each a thin shell
  delegating to tested modules outside `entrypoints/`.
* `src/messaging/`: message union, a typed `send`, and a typed handler
  registry. Unknown message types are rejected explicitly, not ignored.
* `src/platform/`: wrappers for storage, runtime messaging, tabs, context
  menus, permissions, the extension origin, and the sidebar. Each is an
  interface plus a real implementation.
* The sidebar wrapper reconciles `sidebarAction` and `sidePanel` behind one
  interface — `open(fromGesture)` and nothing more. This is the first place
  P3 earns its keep, so it is written now rather than when Chrome arrives.
* Manifest: `contextMenus`, `storage`, `activeTab`, `scripting`, the target
  browser's sidebar permission, host permission `http://127.0.0.1:8765/*`,
  and the pinned identity from 2.4.
* Populate `docs/initial-context.md` — architecture, layer boundaries,
  message shapes, permission rationale. `AGENTS.md` names it required
  reading, and it is a stub until this milestone.

## Failure cases that are normal, not exceptional

The content script is absent on privileged pages (`about:` on Firefox,
`chrome://` on Chrome), the browser's own add-on listing, the PDF viewer, and
any tab loaded before the extension. The sidebar may be closed when the
background wants to talk to it. Both must produce a typed failure
the caller can act on — never an unhandled rejection.

## Tests to write first

1. A registered handler receives a message and its reply reaches the sender.
2. An unknown message type yields a typed failure, not a crash or a silent
   drop.
3. Sending to a context with no listener yields the "no receiver" failure.
4. Each platform wrapper round-trips against the fake browser.
5. A handler that throws is converted to a failure reply; the exception does
   not escape.
6. The generated manifest contains exactly the permission set above — a test
   that fails when someone widens permissions casually.
7. The origin helper returns the running extension's origin with no trailing
   slash, and is never compared against a hardcoded string.
8. With the host permission absent, the permission wrapper reports it as
   missing rather than failing a request later.
9. The sidebar wrapper's interface is satisfiable by both backing APIs —
   asserted against a fake for each, so the Chrome path cannot rot
   unnoticed.

## Done when

* The extension loads in Firefox; background, content script, and sidebar all
  start with no console errors.
* Opening the sidebar and round-tripping a message works in a real Firefox,
  and the same path is covered by tests against the fake.
* The origin helper's output, read from a real Firefox, is the value that
  would actually go into `webCorsOriginList` — verified by pasting it in and
  reaching AnkiConnect, even though M4 owns the client.
* `docs/initial-context.md` describes what was actually built.
* `pnpm lint check test build` all green.

## Risks

* **Background termination.** Firefox's event page and Chrome's service
  worker are both unloaded when idle, so no state may live in module scope.
  State belongs in `storage` from the start — retrofitting this after M7
  means rewriting the draft flow.
* **Sidebar open requires a user gesture** on both browsers, called
  synchronously in the gesture handler. This constrains M5's context-menu
  code; prove the path here with a stub before feature work depends on it.
* **The two sidebar APIs differ in lifecycle**, not just in name: Firefox's
  sidebar is per-window and survives tab navigation, Chrome's panel is
  scoped per tab or globally. The wrapper must not promise behaviour only
  one of them has.
* **Permission creep.** Test 6 exists because the ceiling is easy to widen
  and hard to narrow after a store submission.
