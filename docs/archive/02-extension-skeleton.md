# M2 — Extension skeleton

Index: `00-plan.md`. Depends on: M1. Blocks: M3–M12.

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
