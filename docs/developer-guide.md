# Developer guide

Anklipper is a browser extension that turns text you select on a web page
into an Anki card, using the AnkiConnect add-on to talk to a local Anki.

For what the extension does and how to use it, see the
[README](../README.md).

## Where things stand

M5 has landed. The toolchain and CI are green (M1), the extension has its
skeleton (M2) — three contexts talking over a typed message channel, every
`browser.*` call behind a port in `src/platform/`, the MVP permission set and
the pinned extension identity in the manifest — `src/core/` holds the card
model (M3), `src/anki/` holds the AnkiConnect adapter and its error taxonomy
(M4), and selecting text now produces a stored draft: the **Create Anki
Card** context-menu entry and its `Alt+Shift+A` shortcut, on-demand injection
of the content script, and extraction of the selection, its surrounding
block, the nearest heading, and the page's title and URL.

The sidebar shows what was captured; it cannot yet be edited or added. The
editor is M6, and M7 joins the capture to the adapter.

`docs/initial-context.md` is the authoritative description of that
architecture. Read it before changing a layer boundary, a message shape, or a
permission.

`docs/plans/00-plan.md` is the index: pinned decisions, the milestone list,
and which subplan covers each. Read the subplan for the milestone you are
picking up — and revise it against what earlier milestones actually built
before writing code. A subplan written in advance is a proposal, not a spec.

## Prerequisites

- **Node.js** and **pnpm** — exact versions are pinned in `.nvmrc` and in
  `package.json`'s `packageManager` and `engines` fields. Those files are the
  source of truth; this guide does not repeat the numbers.
- **Firefox** for development. Firefox is the primary target; Chrome builds
  are kept compiling but not exercised until after the first release.
- **Anki** with the **AnkiConnect** add-on, for anything that talks to a real
  collection. Unit tests do not need either — AnkiConnect is mocked.

## Getting started

Run `pnpm install` — its `postinstall` runs `wxt prepare`, which generates
`.wxt/` (the TypeScript config the root `tsconfig.json` extends, plus the
types for WXT's auto-imported globals). Nothing typechecks or lints before
that has run.

From there, use the project's own scripts for dev, test, lint, typecheck, and
build. `package.json` is the source of truth for their names; this guide does
not duplicate them.

Development runs against **Firefox** and a **persistent profile**, kept under
`.wxt/firefox-data` and configured in `wxt.config.ts`. A temporary install in
a fresh profile gets a new `moz-extension://` UUID each time, and since
AnkiConnect allowlists extensions by origin, a changing UUID would break your
own AnkiConnect permission on every reload.

Firefox is the target that ships; the Chrome build only has to keep
compiling, and has its own dev and build scripts.

## How the code is organised

Boundaries are enforced by ports and adapters. Card generation and the Svelte
UI depend on interfaces — `AnkiClient`, `DraftStore`, `SettingsStore` — never
on concrete AnkiConnect calls or `browser.*`. Every port ships an in-memory
fake, and that is what tests run against.

- **Card model** — `CardDraft` and its transitions, in `src/core/`. Pure
  TypeScript, no browser, no network. Cloze markup lives here too: deletions
  are `{{c1::…}}` text, so producing and parsing them is string work, not UI
  work.
- **Card generation** — selected text plus page context to a `CardDraft`.
- **Content/page layer** — selection and page-context extraction.
- **Extension/background layer** — lifecycle, messaging, browser APIs.
- **Svelte UI** — the sidebar editor. No AnkiConnect protocol logic.
- **AnkiConnect adapter** — the only place that knows the wire format.
- **Settings/storage** — configuration and persistence.

On disk:

- `src/entrypoints/` — background, content script, and the sidebar. WXT reads
  this directory to generate the manifest. Entrypoints stay thin: they build
  the adapters and hand them to a module under `src/`, because entrypoints are
  exempt from the TDD gate and logic parked there escapes testing.
- `src/platform/` — the only place `browser.*` is reached. One module per
  port: an interface plus its real implementation. In-memory fakes live in
  `src/platform/fakes/`.
- `src/messaging/` — the message union, the typed sender, and the handler
  registry. Depends on ports, never on the browser.
- `src/background/`, `src/content/`, `src/sidebar/` — what each context does,
  outside the entrypoint that starts it.
- `src/core/` — framework-independent domain code: the `Result` type, and the
  card model — `note-type.ts`, `draft.ts`, `cloze.ts`, `validate.ts`,
  `capture.ts`, `generate.ts`. `src/core/ports/` declares the `AnkiClient`, `DraftStore`,
  and `SettingsStore` interfaces, with an in-memory fake for each under
  `ports/fakes/`. The fakes can be told to fail, so a consumer can test its
  error path as well as its happy one.
- `src/manifest/` — the permission ceiling and the pinned extension identity,
  imported by `wxt.config.ts` and pinned by a test.
- `src/` is the alias root. `@/…` resolves to it identically in the build, in
  tests, and in `tsc`.
- `tests/` — the harness setup files, the tests that assert the harness itself
  works, and the test that holds the generated manifest to the permission
  ceiling.

Tests sit beside the module they cover. ESLint enforces the bottom of the
dependency stack: `src/core/`, `src/manifest/`, and `src/messaging/` may not
import `wxt/browser`, `webextension-polyfill`, or Svelte.

The manifest is generated, not written: `wxt.config.ts` holds the parts that
are ours — from `src/manifest/manifest.ts` — and `.output/<target>/manifest.json`
is the result. Two tests pin it: one on what this repository declares, one on
what WXT emits for each target, since WXT adds Chrome's `sidePanel` permission
by itself. Widening permissions therefore breaks a test. The ceiling is in
`AGENTS.md` and the reasoning is in `docs/initial-context.md`.

Update `docs/initial-context.md` in the same change as anything it describes:
architecture, layer boundaries, messaging, the card model, AnkiConnect
integration, or permissions.

## Commit and CI gates

Install the commit hooks once after cloning:

```bash
pre-commit install --install-hooks
```

They check whitespace and file hygiene, shell scripts, Markdown, Prettier
formatting, ESLint, the test suite, and that the commit message follows
Conventional Commits. CI runs the same hooks, so a commit that passes locally
passes there. Vendored content under `.claude/skills/` and `.claude/plugins/`
is excluded, as are the files release-please rewrites on every release —
`CHANGELOG.md` from markdownlint, `.release-please-manifest.json` from
Prettier.

CI additionally typechecks, tests, and builds both targets. Both jobs are
required status checks on `main`: a red run blocks merge.

## Releases

Releases come from Conventional Commits. release-please keeps a release pull
request open on `main` summarising everything since the last release;
merging it tags the version, publishes a GitHub Release, and attaches the
built extension. Nothing is released until someone merges that PR.

`CHANGELOG.md` is generated — never edit it by hand. One list, so there is
never a question of which changelog to read.

Pull requests are **squash-merged**, so the pull request title is the only
commit that reaches `main` — and the only thing release-please renders. Write
it as a Conventional Commit; a malformed title is dropped from the changelog
silently, and the commit-msg hook cannot catch it, because that hook runs on
the local commits the squash discards.

A milestone's pull request is titled `feat(mN): <what shipped>`. The scope is
the link to its plan: `m3` resolves to `docs/archive/03-*.md`, which is why
archived plans keep their number and carry no date or SHA in the filename.
Open the pull request description with an absolute link to that plan, so it
reaches the squash commit body:

```text
Plan: https://github.com/gotofritz/anklipper/blob/main/docs/archive/03-card-draft-model-and-ports.md
```

`AGENTS.md` has the full rules under *Releases*.

## Testing

Test-driven development is mandatory here, not aspirational: write the
failing test, watch it fail, then write the minimum that passes it.

Tests run under Vitest, in two projects:

- **node** — everything by default. There is no DOM here, so a domain module
  that reaches for one fails loudly rather than passing by accident.
- **jsdom** — Svelte components and anything else that needs a document.

A test opts into jsdom by its filename: `*.svelte.test.ts` or `*.dom.test.ts`.
Everything else runs in node.

A **module** that needs a document is named `*.dom.ts` for the same reason —
`src/content/extract.dom.ts` is the one — so that its stem-matching test
(`extract.dom.test.ts`) lands in the jsdom project and the TDD hook still
finds it. The suffix is the marker: anything without it must run in node.

Extension APIs are not mocked by hand. `browser.*` resolves to
`@webext-core/fake-browser` in both projects, and its state is reset before
every case — storage leaking between tests is the usual way an extension
suite goes quietly wrong. Component tests use `@testing-library/svelte` with
jest-dom's matchers, and unmount automatically between cases.

Coverage is reported but has no threshold. One arrives when there is enough
behaviour for it to mean something.

A local hook, `.claude/hooks/check-tdd.sh`, blocks writing a TypeScript or
Svelte module that no test covers. A module is satisfied by a stem-matching
test — `draft.ts` by `draft.test.ts` — as a sibling, in a sibling
`__tests__/`, or in a mirrored `tests/` tree. Config, type-only modules,
barrels, and entrypoints are exempt; keep logic out of them rather than using
them to dodge the gate. `SKIP_TDD_HOOK=1` bypasses it, for prototypes and
generated code only.

The hook has its own tests: `.claude/hooks/test-check-tdd.sh`.

## Checking it in Firefox

The automated suite runs against a fake browser, which is the right trade for
speed but cannot prove the handful of things only a real browser knows: the
extension's actual origin, whether the sidebar API behaves, and whether a
declared host permission was granted. Check those by hand in Firefox.

Run the dev script (`package.json` names it). It builds, then opens Firefox
with the persistent profile described under *Getting started*.

### 1. The contexts start

Open `about:debugging#/runtime/this-firefox`, find **Anklipper**, and click
**Inspect**. That console is the background — an event page, unloaded when
idle. It should be free of errors.

### 2. A message crosses between contexts

Open the sidebar: **View → Sidebar → Anklipper**. The panel should read
**"Connected to the background."** That is the sidebar sending `ping`, the
background answering, and the reply arriving — the whole channel, over the
real API rather than the fake.

"Not connected" followed by an error kind means the round trip failed, and
the kind names which half: `no-receiver` is a background that never answered.

### 3. The origin helper returns something usable

AnkiConnect allowlists this extension by origin, so this string is what a
user ends up pasting into its config. Read it either way:

- `about:debugging` shows an **Internal UUID** on the Anklipper card. The
  origin is `moz-extension://<that-uuid>`, with no trailing slash.
- Or right-click inside the sidebar → **Inspect**, and in that console run
  `browser.runtime.getURL("")`, dropping the trailing slash.

The two must agree, and the value must survive a reload — that is what the
pinned extension id and the persistent profile are for. Deleting
`.wxt/firefox-data` mints a new UUID and invalidates any allowlist entry
written against the old one.

### 4. AnkiConnect is reachable from that origin

Needs Anki running with the AnkiConnect add-on installed.

1. In Anki, open **Tools → Add-ons → AnkiConnect → Config** and add your
   origin to `webCorsOriginList`:

   ```json
   { "webCorsOriginList": ["http://localhost", "moz-extension://<your-uuid>"] }
   ```

   Save, then restart Anki.

2. Grant the host permission. Firefox MV3 does **not** grant a declared host
   permission at install, so open `about:addons` → Anklipper → **Permissions**
   and enable access to the AnkiConnect host. Skipping this step first time
   is a useful thing to see fail: the request below is refused, which is the
   behaviour the runtime permission check exists for.

3. In the sidebar's console:

   ```js
   await (await fetch("http://127.0.0.1:8765", {
     method: "POST",
     body: JSON.stringify({ action: "version", version: 6 }),
   })).json()
   ```

   `{ result: 6, error: null }` means the origin, the permission, and the
   add-on all line up.

### 5. The adapter, against a real Anki

Everything above proves the stack lines up. This proves the AnkiConnect
adapter reads it correctly — the questions its automated tests cannot answer,
because they run against a stubbed `fetch`.

Development builds expose a harness on the background console's global,
wired in `src/entrypoints/background.ts` behind `import.meta.env.DEV` and
implemented in `src/anki/dev-harness.ts`. The guard is what keeps it out of a
release: `wxt build` folds it away, and the harness is absent from the
production bundle. Confirming that yourself needs `rm -rf .output` first —
a stale directory will happily answer the question with a previous build's
output. Open the background console as in step 1, and:

```js
await anklipper.survey()
```

`survey()` reads only — it never adds a note — and what it returns is safe to
paste into an issue: it carries the origin, and never the API key.

On the evidence so far the allowlist makes no difference to this extension, so
step 4's config edit is not a prerequisite for any of these. Keep it out of
`webCorsOriginList` anyway if you want to re-confirm that on your own Anki —
that is the finding the whole section rests on.

#### 5.1 A dead port

Quit Anki completely and `await anklipper.probe()`. Expect
`cause.kind === "anki-not-running"`.

There is deliberately nothing to distinguish it from. The plan expected a
rejected origin to look identical here and had the adapter separate the two
with a `no-cors` probe; the manual pass found AnkiConnect serving a
non-allowlisted origin, so `origin-rejected` was removed. See the archived M4
plan.

#### 5.2 A missing host permission is caught before the network

Turn the host permission back off in `about:addons`, open the Network tab,
and probe. Expect `permission-missing` and **no request at all**.

#### 5.3 Note types, including a custom cloze one

Connected, `survey()` should list every deck and note type. The interesting
field is `clozeNoteTypes`.

In Anki, **Tools → Manage Note Types → Add**, clone `Cloze`, and name it
something with no "cloze" in it. It must still appear in `clozeNoteTypes` —
that is the check that the flavour is read from the templates rather than
guessed from the name, and the one the name heuristic fails.

#### 5.4 Adding a note

These write to your collection. Every sample is tagged
`anklipper-manual-check`, so the run is one search away in Anki's browser
afterwards.

```js
const nts = await anklipper.client.noteTypes()
const basic = nts.value.find((n) => n.name === "Basic")
const cloze = nts.value.find((n) => n.name === "Cloze")

await anklipper.client.addNote(anklipper.drafts.basic("Default", basic))
await anklipper.client.addNote(anklipper.drafts.cloze("Default", cloze))
```

Both should return `{ ok: true, value: <note id> }`. Open the cloze one in
Anki and confirm its `{{c1::…}}` arrived intact rather than escaped.

Note that Anki accepts a cloze note with **no** deletions rather than
refusing it, so nothing downstream catches one. `validateDraft`'s
`cloze-no-deletions` is the only guard there is.

#### 5.5 An API key, if you use one

Set `apiKey` in AnkiConnect's config, restart Anki, and probe with no key
configured. Expect `api-key-required`.

#### What to record

Note the AnkiConnect version you tested against. Its canonical repository has
moved to SourceHut and the GitHub tree may lag, so "which version" is part of
the result. The outstanding items are listed under **Not done, and why** in
`docs/archive/04-ankiconnect-adapter.md`; that is the file to update as they
are confirmed.

### 6. Capturing a selection

This is M5's path end to end, and it needs a real browser: the automated
suite drives the extraction against jsdom fixtures and the gesture against
fakes, but neither can prove that the browser hands over the gesture or that
injection reaches the page.

1. Open the background console first: `about:debugging#/runtime/this-firefox`
   → **Anklipper** → **Inspect**. Development builds log every capture that
   failed or hit a blind spot there, as `anklipper: capture`. That log is
   what a capture doing nothing looks like from the inside.
2. Open any ordinary article. Select a sentence inside a paragraph,
   right-click, and choose **Create Anki Card**.
3. The sidebar opens — or is already open, which is the common case after the
   first card — and shows the selected text, the page title, and its address.
   It watches the stored draft, so a second capture replaces what it shows
   without being reopened.
4. `Alt+Shift+A` does the same thing without the menu. Firefox lists it under
   `about:addons` → the gear → **Manage Extension Shortcuts**, where it can
   be rebound.

If the panel stays on its first-run message, read the console log, and then
check the store directly from that same console:

```js
await browser.storage.local.get("draft")
```

A draft there with an unchanged panel is a watching problem; an empty store
is a capture that failed, and the log says why.

Then check the blind spots, each of which should name itself in the sidebar
rather than producing an empty card:

- **A page with no content script.** Open a PDF in Firefox's built-in viewer,
  select a line, and use the menu. Nothing can be injected there, so the
  draft is built from the menu event's own text — shorter, and with no
  surrounding context.
- **A shadow root.** Any page built on web components will do. The selection
  cannot be read, and the sidebar says so.
- **A cross-origin frame.** Select text inside an embedded video's or
  comment widget's frame.

The extraction itself — the block ancestor, the heading, the caps, the
whitespace handling — is covered by `src/content/extract.dom.test.ts` and
does not need a browser.

## Plans and documentation

- `docs/plans/00-plan.md` — the index. Changes only when scope, ordering, or
  a pinned decision changes.
- `docs/plans/NN-<name>.md` — one subplan per milestone.
- `docs/archive/` — completed plans, archived in the same pull request that
  completes them, keeping their number: `NN-<original-name>.md`.
- `CHANGELOG.md` — generated. A milestone appears as the entry its pull
  request title becomes, and its scope names the archived plan.
- `README.md` — for people using the extension, not building it. Keep it in
  plain language.

`AGENTS.md` carries the full working rules: architecture constraints, the
AnkiConnect rules, permission ceiling, commit conventions, and the failure
policy. Read it before contributing.

## Branches and commits

Branches are `feature/<name>` or `fix/<name>`. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/): `feat(anki):
add notes through AnkiConnect`. Keep them small and atomic.

Before opening a pull request, run the project's formatting, linting, type
checking, tests, and build. All of them must pass.
