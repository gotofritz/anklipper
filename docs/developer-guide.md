# Developer guide

Anklipper is a browser extension that turns text you select on a web page
into an Anki card, using the AnkiConnect add-on to talk to a local Anki.

For what the extension does and how to use it, see the
[README](../README.md).

## Where things stand

M10 has landed. The flow works end to end — select text, choose **Create Anki
Card**, edit the card in the sidebar, add it, and it is in Anki — and what it
starts from is now the user's, not a constant.

Underneath: the toolchain and CI are green (M1), the extension has its
skeleton (M2) — three contexts talking over a typed message channel, every
`browser.*` call behind a port in `src/platform/`, the MVP permission set and
the pinned extension identity in the manifest — `src/core/` holds the card
model (M3), `src/anki/` holds the AnkiConnect adapter and its error taxonomy
(M4), `src/background/capture.ts` turns a gesture into a stored draft (M5),
and `src/sidebar/` is the editor built on all of it (M6).

M7 added what makes it usable rather than demonstrable: the draft is written
to storage from the moment it exists and on every edit, a failed add keeps
the card and offers a retry, a successful one clears the slot and says so,
and a second selection made while a card is open waits and asks rather than
overwriting it.

M8 added settings. `src/core/settings.ts` is the schema — versioned from the
first release, validated on every read, degrading key by key so a bad stored
value cannot stop the extension starting; `src/core/settings-migrations.ts` is
the runner that goes in front of it; `src/platform/settings-store.ts` and
`remembered-store.ts` put both over `storage.local` under separate keys; and
`src/options/` is the form, built on M6's view-model pattern and reusing its
components. The AnkiConnect endpoint, timeout, and optional API key come from
there too, and the deck a card went into is remembered for the next capture.

M10 made the sidebar a real Anki note editor rather than a two-field
approximation. Fields hold HTML, as Anki's own do, and are edited in a
`contenteditable` with Anki's formatting toolbar and Anki's shortcuts; each
one has an HTML source view and a sticky pin. `src/core/field-html.ts` is the
one module that decides what a field's HTML may contain — an allowlist applied
by rebuilding rather than filtering — and the runs it parses into are also the
coordinate system that lets `src/core/field-cloze.ts` splice cloze braces into
markup without the model changing at all. Deck and note-type pickers filter,
tags complete from the collection, and a duplicate is shown on the first field
rather than as a banner.

M10a followed it, on the same branch, from the first real use: changing note
type looked like it threw the selected text away. It did not — 3.2 stashes
what a switch cannot carry — but Basic and Cloze share no field name, so the
switch emptied every field and nothing said why. `CardDraft.scratch` is the
answer: the selected text, plain, outside the field map, rendered as a
landing area above the note type and never touched by a note-type change.
Fields are filled from it by `sendToField`, and the stash is now named rather
than silent.

The skin came after it, from `docs/archive/13-add-css.md`: one stylesheet
scoped to `#app`, riding selectors the markup already had, so no component
`<style>` block changed and no `!important` appears anywhere. Its two
typefaces are vendored under `public/fonts/` — see *Fonts* — and the two
places CSS could not reach became real elements rather than `content:`
strings: the status strip's marker, which now says which of the three
connection states the panel actually found, and the colophon, which now
carries the running extension's own version.

That branch also closed the gap that would have met a first-time user.
Firefox MV3 grants no host permission at install, so a new install shows
`permission-missing` — and the only button under it was **Try again**, which
could never have succeeded. It is now **Allow access to Anki**, which asks the
browser from the click, and the retry is withheld for that one cause (9.7).

**1.0.0 is what this ships as.** See *Releases* for how one is cut and why an
unsigned build is not a release.

Still open from M9, and deliberately not in 1.0.0: the diagnostics view, and
the manual fallback screen that names the exact `webCorsOriginList` JSON for a
user whose AnkiConnect refuses the extension's origin. Neither blocks a
working install — the error copy in `src/sidebar/error-copy.ts` gives every M4
cause its own fix — but both are what a user with an unusual AnkiConnect setup
would want. M11 (media) and M12 (AI generation) are features on top of a
working extension, not gaps in it.

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
UI depend on interfaces — `AnkiClient`, `DraftStore`, `SettingsStore`,
`RememberedStore` — never on concrete AnkiConnect calls or `browser.*`. Every
port ships an in-memory fake, and that is what tests run against.

- **Card model** — `CardDraft` and its transitions, in `src/core/`. Pure
  TypeScript, no browser, no network. Cloze markup lives here too: deletions
  are `{{c1::…}}` text, so producing and parsing them is string work, not UI
  work. So is field HTML: what a field may contain, what formatting a range
  carries, and what a paste is reduced to are all pure functions in
  `field-html.ts`, never a call to a browser editing command.
- **Card generation** — selected text plus page context to a `CardDraft`.
- **Content/page layer** — selection and page-context extraction.
- **Extension/background layer** — lifecycle, messaging, browser APIs.
- **Svelte UI** — the sidebar editor: one view-model over the ports, and
  components that render it and hand back intents. No AnkiConnect protocol
  logic, and no `browser.*`.
- **AnkiConnect adapter** — the only place that knows the wire format.
- **Settings/storage** — the schema and its migrations in `src/core/`, the
  stores in `src/platform/`, the options page in `src/options/`. Validated on
  read and degraded key by key: a settings bug must not brick the extension.

On disk:

- `src/entrypoints/` — background, content script, the sidebar, and the options
  page. WXT reads this directory to generate the manifest. Entrypoints stay
  thin: they build the adapters and hand them to a module under `src/`, because
  entrypoints are exempt from the TDD gate and logic parked there escapes
  testing.
- `src/platform/` — the only place `browser.*` is reached. One module per
  port: an interface plus its real implementation. In-memory fakes live in
  `src/platform/fakes/`.
- `src/messaging/` — the message union, the typed sender, and the handler
  registry. Depends on ports, never on the browser.
- `src/background/`, `src/content/`, `src/sidebar/` — what each context does,
  outside the entrypoint that starts it.
- `src/core/` — framework-independent domain code: the `Result` type, the card
  model — `note-type.ts`, `draft.ts`, `cloze.ts`, `field-html.ts`,
  `field-cloze.ts`, `sticky.ts`, `validate.ts`, `capture.ts`, `generate.ts`,
  `source-fields.ts` — and the settings schema,
  `settings.ts` with `settings-migrations.ts`. `src/core/ports/` declares the
  `AnkiClient`, `DraftStore`, `SettingsStore`, and `RememberedStore`
  interfaces, with an in-memory fake for each under `ports/fakes/`. The fakes
  can be told to fail, so a consumer can test its error path as well as its
  happy one.
- `src/options/` — the settings page: one view-model over the ports and the
  form that renders it, reusing `src/sidebar/`'s `TagEditor` and `error-copy`.
- `src/manifest/` — the permission ceiling and the pinned extension identity,
  imported by `wxt.config.ts` and pinned by a test.
- `src/` is the alias root. `@/…` resolves to it identically in the build, in
  tests, and in `tsc`.
- `tests/` — the harness setup files, the tests that assert the harness itself
  works, the test that holds the generated manifest to the permission ceiling,
  and `tests/integration/`, which drives the whole flow — gesture, capture,
  panel, add — with only AnkiConnect mocked.
- `public/` — copied verbatim to the bundle root, so an absolute `/fonts/…`
  in CSS resolves at runtime. Holds the vendored fonts; see *Fonts* below.
- `preview/` — the sidebar rendered outside the browser, for looking at.
  See *Looking at the sidebar*.

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

## Fonts

MV3's content security policy blocks `fonts.googleapis.com`, so the sidebar
skin's typefaces ship inside the extension. They sit in `public/fonts/` and are
referenced from `src/entrypoints/sidepanel/tdr.css` by absolute path.

| File | Axes / weight | Source |
| --- | --- | --- |
| `Archivo-Variable.woff2` | `wght` 100–900, `wdth` 62–125 | [`google/fonts`, `ofl/archivo`](https://github.com/google/fonts/tree/main/ofl/archivo) |
| `IBMPlexMono-Regular.woff2` | 400 | [`IBM/plex`, `packages/plex-mono`](https://github.com/IBM/plex/tree/master/packages/plex-mono) |
| `IBMPlexMono-SemiBold.woff2` | 600 | same |

The `wdth` axis is the point of the variable file, not a bonus: the masthead is
extended rather than merely bold, which is what the `font-stretch: 62% 125%`
descriptor in the `@font-face` block unlocks for `font-stretch: 125%` on `h1`.
A static Archivo, or the `wght`-only variable subset some font CDNs ship, would
load without error and render the masthead at normal width.

Google Fonts hands you the same variable font as
`Archivo-VariableFont_wdth,wght.ttf` in its download zip — right font, wrong
container and name. Convert and rename it rather than hunting for a `.woff2`
that Google does not publish:

```bash
pip install fonttools brotli
python3 -c "
from fontTools.ttLib import TTFont
f = TTFont('Archivo-VariableFont_wdth,wght.ttf')
f.flavor = 'woff2'
f.save('public/fonts/Archivo-Variable.woff2')
"
```

The Plex files are already WOFF2 upstream and are the complete, unsubsetted
faces — a card can hold whatever the user selected, so subsetting to Latin
would leave clipped Cyrillic or Greek rendering in a fallback face.

Both families are SIL Open Font License 1.1, and the licence travels with the
font: `Archivo-OFL.txt` and `IBMPlex-OFL.txt` sit next to them in
`public/fonts/` and ship in the bundle. Do not reformat them.

`tests/assets/font-assets.test.ts` pins the three references in the stylesheet
to real WOFF2 files. Without it a missing font is silent — there is no failing
request to notice, just `font-display: swap` settling on Helvetica.

## Looking at the sidebar

```bash
pnpm run preview
```

That serves the real `Panel` — the same component the extension mounts —
against the in-memory port fakes, with the skin and the vendored fonts
loaded. Nothing is stubbed and no extension host is faked, because the
sidebar does not need one: P3 keeps every `browser.*` call behind a port, so
what is left compiles and mounts like any other Svelte component. If that
ever stops being true, this page is the first thing that breaks, which is a
second reason to keep it.

Scenes are URLs, and the links across the top switch between them:

| Scene | What it is for |
| --- | --- |
| `?scene=card` | The ordinary case: a captured card, mid-edit |
| `?scene=empty` | First run — the sidebar open before anything is captured |
| `?scene=cloze` | Cloze markup, its ordinal controls, and **Mark selection** |
| `?scene=long` | A note type with four fields, in the collection's order |
| `?scene=waiting` | A second selection waiting behind an open card (7.4) |
| `?scene=permission` | The host permission never granted — **Allow access to Anki** |
| `?scene=offline` | The background not answering: `RT/NO`, and a retry |

Add one in `preview/scenes.ts` when a CSS change turns on a state none of
these reach. Keep them to states that *render* differently — a scene that
differs only in wording proves nothing a component test does not already
hold, and `preview/` is exempt from the TDD gate precisely because it is a
viewer, not behaviour. Anything with logic in it belongs in `src/` with a
test.

`pnpm run preview:build` writes the same page to `.output/preview/` if you
want to serve it somewhere. The README's screenshot is the `card` scene with
the scene picker removed.

Two things it cannot show you, because they are the browser's: the sidebar's
real width in Firefox's own chrome, and anything that depends on a live
AnkiConnect. *Checking it in Firefox* is still what signs work off.

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

### What a release contains

`pnpm build` produces two archives in `.output/`:

- `anklipper-<version>-firefox.zip` — the extension itself.
- `anklipper-<version>-sources.zip` — the sources AMO reviewers need,
  because the shipped code is bundled. `wxt.config.ts` keeps `docs/` and
  `.claude/` out of it.

`.github/workflows/release.yml` attaches both to the GitHub Release, and —
when the repository holds AMO credentials — a signed `.xpi` beside them.

### Signing, and why an unsigned build is not a release

Firefox will not install an unsigned add-on permanently. A zip from the
release page is therefore a build, not something a user can run: loading it
through `about:debugging` works, but only until the browser restarts, and a
temporary install draws a **new `moz-extension://` UUID every time** — which
breaks the user's own AnkiConnect allowlist entry on every restart, for the
reason `wxt.config.ts` pins a persistent dev profile.

So distribution means signing. Mozilla signs through AMO's API, and
`web-ext` — already a dev dependency — drives it:

```bash
pnpm run sign
```

That builds, zips, and submits the build to AMO on the **unlisted** channel,
which signs it and hands back a `.xpi` without listing it in the public
gallery. It needs an API key and secret from
[addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/en-US/developers/addon/api/key/),
in the environment:

```bash
export WEB_EXT_API_KEY=user:12345678:123
export WEB_EXT_API_SECRET=…
```

Put the same two values in the repository's Actions secrets as
`AMO_API_KEY` and `AMO_API_SECRET`, and every release signs itself. Without
them the signing step is skipped rather than failed — the zips still attach,
and the release simply has no `.xpi`.

Signing depends on the extension identity staying fixed. `GECKO_ID` in
`src/manifest/manifest.ts` is what AMO keys the add-on to; changing it
creates a different add-on, and every existing install stops updating.

### Cutting the first stable release

`release-please-config.json` currently carries `"release-as": "1.0.0"`.
That is a one-release instruction, not a setting: **delete it once 1.0.0 has
been tagged**, or every subsequent release PR will propose 1.0.0 again.
`"bump-minor-pre-major": false` beside it is permanent — past 1.0.0 a
breaking change should bump the major, which is what it turns back on.

### The order of a release

1. Merge the work. CI green on `main`.
2. release-please opens or updates its release pull request. Read the
   changelog entry it wrote — it is the pull request titles, and nothing else.
3. Merge that pull request. It tags, publishes the release, builds, signs if
   it can, and attaches the archives.
4. Check the release page has an `.xpi`. If it does not, the credentials are
   missing — sign locally with `pnpm run sign` and upload the result.
5. Install that `.xpi` in a clean Firefox profile and add one real card
   before telling anyone. The README's install instructions are the steps to
   follow.

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
`src/content/extract.dom.ts` and `src/sidebar/selection.dom.ts` are the two —
so that its stem-matching test (`extract.dom.test.ts`) lands in the jsdom
project and the TDD hook still finds it. The suffix is the marker: anything
without it must run in node.

That split is also a design rule, not only a plumbing one. `selection.dom.ts`
measures a `contenteditable`'s selection and hands back text offsets;
everything done *with* those offsets — formatting, cloze marking, pasting — is
pure and lives in `src/core/`, tested in node. So a rich editor built on the
least pleasant API in the browser still has almost all of its behaviour
provable without one.

A **module that uses runes** is named `*.svelte.ts` —
`src/sidebar/editor-model.svelte.ts` is the one — because `$state` outside a
component needs the Svelte compiler, which only the jsdom project has. Its
stem-matching test is `editor-model.svelte.test.ts`, which lands there too.
It needs the compiler rather than a document; here those are the same
project.

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

### 7. The editor

Capture something first — the sidebar shows *Select some text on a page…*
until a draft exists. The editor then replaces it.

Without the host permission from step 2, every AnkiConnect call answers
`permission-missing` before touching the network: the deck and note-type
selectors hold only the draft's own values, and the editor says what is
wrong and offers **Try again**. Editing, tagging, and cloze marking all work
in that state; adding does not. Grant the permission and press **Try again**,
and the lists fill.

Four things need eyes rather than a test:

- **The layout at a narrow width.** jsdom has no layout engine, so nothing in
  the suite can see a horizontal scrollbar. Drag the sidebar as narrow as
  Firefox allows and check that nothing overflows sideways — the toolbar and
  the per-field buttons are the new pressure on this.
- **The whole flow from the keyboard.** Tab through every control, mark a
  cloze deletion with `Ctrl+Shift+C`, and add the card with `Ctrl+Enter`.
  Nothing discards the card from the keyboard: **Discard card** is a button,
  because emptying the slot has no undo.
- **The chords the browser also wants.** `Ctrl+B` is Firefox's bookmarks
  sidebar and `Ctrl+U` is view-source; both are claimed with `preventDefault`
  and neither should reach the browser from inside a field. `Ctrl+R` is
  deliberately *not* claimed, so it still reloads.
- **Typing and pasting in a real `contenteditable`.** jsdom does no editing of
  its own, so the suite drives the element rather than the browser. Type into
  a field with the caret mid-word, paste a formatted excerpt from a real page,
  and check that what lands in Anki is the formatting and nothing else.

### 8. The whole flow, against a real Anki

M7's done-when criteria. The integration test drives all of this with
AnkiConnect mocked (`tests/integration/mvp-flow.svelte.test.ts`); what a real
Anki adds is whether the note it receives is one it can actually use.

Anki running, AnkiConnect installed, and the host permission granted — steps 4
and 5 above.

1. **A real card.** Select a sentence, **Create Anki Card**, fill in `Back`,
   press **Add card**. Expect *Added to Anki.* and the card in the collection.
   The deck and note type are whatever the settings say — `Default` and
   `Basic` on a fresh profile.
2. **A real cloze card.** Capture again and press **Convert to cloze**, which
   moves the selection into `Text`. Select a word, press `Ctrl+Shift+C`,
   select another, press it again. Add the card, then open it in Anki's
   browser: there must be **one card per ordinal**, `c1` and `c2`. That is the
   only check that proves the markup is valid rather than merely well-formed —
   Anki accepts a cloze note with no deletions at all rather than refusing it.
3. **Anki closed loses nothing.** Capture something, edit it, quit Anki, and
   press **Add card**. Expect *Anki is not running* and a **Try again**
   button, with every field exactly as it was. Confirm the draft is on disk:

   ```js
   await browser.storage.local.get("draft")
   ```

   Start Anki, press **Try again**, and expect the card to land with the edits
   intact.
4. **Closing the sidebar loses nothing.** Type into a field, close the
   sidebar, reopen it. The card comes back with what was typed.
5. **A second selection asks.** With a card open and edited, select something
   else and capture it. Expect *A newer selection is waiting* above the
   editor. **Keep this card** drops the new one; **Use the new selection**
   replaces the card being edited. Both are one click and neither happens on
   its own.

### 9. Settings

M8's done-when criteria. The automated suite covers the schema, the
migrations, the stores, the form, and the whole flow with AnkiConnect mocked;
what a real browser adds is whether the storage survives a restart and whether
the permission prompt behaves.

Open the settings from the sidebar's **Settings** button, or from
`about:addons` → Anklipper → the gear → **Preferences**. It opens in a tab.

1. **They survive a browser restart.** Change the deck and add a default tag,
   save, quit Firefox entirely, and start it again with the same profile.
   Capture something: the card starts on the deck you chose, with the tag.
   (`.wxt/firefox-data` is the profile — deleting it resets everything,
   including the extension's UUID.)
2. **The last-used deck beats the default, and survives a reset.** Add a card
   to a different deck than the configured one. Capture again: the new card
   starts on the deck you just used. Press **Reset to defaults** and capture
   once more — still that deck, because it is remembered rather than
   configured (8.5). Check it directly if you like:

   ```js
   await browser.storage.local.get(["settings", "remembered"])
   ```

3. **Corrupt settings cannot stop a capture.** From the background console:

   ```js
   await browser.storage.local.set({ settings: "wiped" })
   ```

   Then capture. The card is made, on `Default` and `Basic`. This is 8.2, and
   it is the one failure mode that would otherwise reach a user as an
   extension that does nothing.
4. **A key nothing here owns survives a save.** Write one, save the form, and
   read it back:

   ```js
   await browser.storage.local.set({
     settings: { ...(await browser.storage.local.get("settings")).settings,
                 futureThing: "keep me" },
   })
   ```

   It is still there afterwards, alongside a bumped `version`.
5. **The endpoint, and the permission it needs.** In AnkiConnect's config set
   `webBindPort` to something else, restart Anki, and put the matching address
   in the settings. Saving should raise Firefox's permission prompt for that
   origin — the manifest declares only the default port and offers the rest of
   loopback as optional. Accept it and the deck list fills; decline it and the
   form says the browser has not allowed it, the setting is still saved, and
   pressing **Save settings** again asks once more. With the permission
   missing, the sidebar reports *Anklipper has not been allowed to reach
   Anki*, not *Anki is not running*.
6. **The address is refused if it is not local.** Type
   `http://anki.example.test:8765` and save. Nothing is stored and the form
   says why. This is the setting half of the promise the README makes.
7. **The API key never leaves the store.** Set one, then check that nothing
   writes it out:

   ```js
   anklipper.diagnostics()   // apiKeyConfigured: true, and no key
   await anklipper.survey()  // same
   ```

   The field itself is a password input, so it is not on screen either.
8. **The form from the keyboard.** Tab through every control, including the
   tag box, and save with Enter. jsdom has no layout engine, so the narrow
   width is worth an eye too — the page is capped at 40rem and should not
   scroll sideways.

The development harness is built from the settings as of the background's last
start, so change an endpoint and reload the extension before using
`anklipper.survey()` against it.

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
