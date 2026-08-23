# Developer guide

Anklipper is a browser extension that turns text you select on a web page
into an Anki card, using the AnkiConnect add-on to talk to a local Anki.

For what the extension does and how to use it, see the
[README](../README.md).

## Where things stand

M1 has landed: the toolchain, the test harness, and CI are green, and the
extension builds for Firefox and Chrome while doing nothing yet. Feature work
starts at M2.

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

- **Card model** — `CardDraft` and its transitions. Pure TypeScript, no
  browser, no network. Cloze markup lives here too: deletions are
  `{{c1::…}}` text, so producing and parsing them is string work, not UI
  work.
- **Card generation** — selected text plus page context to a `CardDraft`.
- **Content/page layer** — selection and page-context extraction.
- **Extension/background layer** — lifecycle, messaging, browser APIs.
- **Svelte UI** — the sidebar editor. No AnkiConnect protocol logic.
- **AnkiConnect adapter** — the only place that knows the wire format.
- **Settings/storage** — configuration and persistence.

On disk:

- `src/entrypoints/` — background, content script, and the sidebar. WXT reads
  this directory to generate the manifest. Entrypoints stay thin: they are
  exempt from the TDD gate, so logic parked there escapes testing.
- `src/` is the alias root. `@/…` resolves to it identically in the build, in
  tests, and in `tsc`.
- `tests/` — the harness setup files and the tests that assert the harness
  itself works.

The manifest is generated, not written: `wxt.config.ts` holds the parts that
are ours, and `.output/<target>/manifest.json` is the result. M1 declares no
permissions at all; each one arrives with the code that needs it, and the
ceiling is in `AGENTS.md`.

`docs/initial-context.md` is the authoritative description of architecture,
messaging, and boundaries once M2 populates it. Update it in the same change
that alters any of them.

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
