# Anklipper — Top-Level Plan

Turn text selected on a web page into an Anki card, via AnkiConnect.

**Target flow:** select text → *Create Anki Card* → preview → edit → add →
confirmation.

This file is the **index**: what the milestones are, what order they go in,
and which decisions are settled. Detail lives in the subplans — read the one
you are about to start, not all of them.

## Pinned decisions

Settled; each names where it is worked out. Re-opening one means editing that
subplan and saying so here, per `AGENTS.md`.

| # | Decision | Detail | Reversal cost |
|---|----------|--------|---------------|
| P1 | **WXT** as extension toolchain (Vite + Svelte + TS) | M1 | High — rewires build, manifest, tests |
| P2 | **Sidebar** as the UI surface — `sidebarAction` on Firefox, `sidePanel` on Chrome; survives focus loss, so a draft is not lost to a stray click | M2 | Medium — sits behind an adapter |
| P3 | **Ports-and-adapters**: UI and generation depend on interfaces, never on AnkiConnect or `browser.*` | M3 | Low if honoured from M3; high if retrofitted |
| P4 | **`CardDraft` is the only contract** between generation, editor, and AnkiConnect | M3 | High — touches every layer |
| P5 | **Firefox first, Chrome structurally allowed.** Firefox is the stricter target, so Chrome stays additive | M1, M9 | Low, given P1 and P3 |
| P6 | **Deterministic generation only** through M11; no AI, no egress beyond loopback | M12 | Low — additive |
| P7 | **Cloze is in the MVP**, as a note-type flavour. The markup is pure string work; only *choosing* what to hide needs AI | M3 | Low — but the model must know from M3 |
| P8 | **The extension's own origin is read at runtime, never hardcoded.** Firefox's `moz-extension://<uuid>` is per installation | M2, M9 | Low, but no constant is correct for two users |
| P9 | **Onboarding uses AnkiConnect's `requestPermission` handshake**; hand-editing `config.json` is the fallback | M4, M9 | Low — the fallback is written anyway |
| P10 | **Rich text editing arrives in M10**, superseding M6's plain textarea. Capture stays plain text | M10 | Medium — changes the input element under M6's tests |

## Constraints

**Permissions ceiling.** `contextMenus`, `storage`, `activeTab`, `scripting`,
the target browser's sidebar permission, and the host permission
`http://127.0.0.1:8765/*`. Never `<all_urls>` — `activeTab` + `scripting` on a
user gesture covers extraction. Anything beyond this list needs a justification
in the subplan that adds it. On Firefox MV3 a declared host permission is not
granted at install; check and request it at runtime (M2).

**AnkiConnect.** Its default config allowlists no extension origin, so the
first-run state is always rejected. The add-on's `requestPermission` handshake
is the way out (P9). Reachability, the error taxonomy, and the config details
are worked out in M4; the user-facing flow in M9.

**Privacy.** Selected page text and captured screenshots are potentially
sensitive. Through M11 they go only to loopback. Nothing is logged in
production builds. A screenshot catches whatever else was on screen, so the
user sees it before it is attached (11.5).

**Not in the MVP.** AI generation, media, batch creation, sync/history. Cloze
*is* in (P7); Anki-editor fidelity is M10 and media is M11, both after the
MVP ships.

**Never in this project.** LaTeX and MathJax. Not deferred — not planned. No
buttons, no parsing, no rendering.

## Milestones

Ordering rule: **the contract precedes its consumers**, and anything that
cannot be tested cannot be built — so the harness comes first, and the
AnkiConnect interface precedes the editor that renders its data.

| # | Milestone | Depends on | Subplan |
|---|-----------|------------|---------|
| M1 | Toolchain, test harness, CI — green before any feature work | — | done: `docs/archive/2026-08-23-1209-bde0b89-01-toolchain-and-test-harness.md` |
| M2 | Extension skeleton: manifest, permissions, typed messaging, platform wrappers | M1 | `02-extension-skeleton.md` |
| M3 | `CardDraft`, validation, cloze markup, deterministic generation, port interfaces and fakes | M2 | `03-card-draft-model-and-ports.md` |
| M4 | AnkiConnect adapter and its error taxonomy, against mocked HTTP | M3 | `04-ankiconnect-adapter.md` |
| M5 | Selection and page-context extraction; context menu and shortcut | M2, M3 | `05-selection-and-page-context.md` |
| M6 | Sidebar editor, built against the fake adapter | M3, M4 | `06-svelte-editor.md` |
| M7 | End-to-end MVP, with the draft persisted from the moment it exists | M4, M5, M6 | `07-end-to-end-mvp.md` |
| M8 | Settings, storage, and schema migration | M7 | `08-settings-and-persistence.md` |
| M9 | Onboarding, connection diagnostics, repeat-capture polish | M8 | `09-onboarding-and-diagnostics.md` |
| M10 | Card editor parity: every note type, its own fields in order, formatting, sticky fields, tags | M9 | `10-card-editor-parity.md` |
| M11 | Media: region screenshots, page images, paste and drop | M10 | `11-media-and-screenshots.md` |
| M12 | AI-assisted generation — **blocked** on its own design doc | M11 | `12-ai-generation.md` |

## Resolved questions

Each settled in the subplan named; reversing one means editing that subplan.

| Question | Resolution | Where |
|----------|------------|-------|
| Note-type switch: drop, remap, or positional? | Remap by field name; unmatched content stashed and restorable | M3, 3.2 |
| Duplicate detection in the MVP? | Yes, via `canAddNotes`, non-blocking | M4, 4.4 |
| How much surrounding context? | Nearest block ancestor, capped at 1 000 chars; selection capped at 10 000 | M5, 5.3 |
| Rich text or plain? | Plain on capture; rich in the editor from M10 | M5 5.2, M10 10.3 |
| Which browser first? | Firefox; Chrome after the first release | P5, M9 9.5 |

## Deferred

Full-page and scroll-and-stitch capture, audio and video, image occlusion,
highlighted source excerpts, automatic tagging, batch creation, several cards
from one selection, card templates, history of recent cards, offline queue of
failed adds, Chrome and other browsers.

Each becomes its own plan file when picked up. Nothing here justifies
architecture built in advance.
