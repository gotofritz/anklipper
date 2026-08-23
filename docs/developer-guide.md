# Developer guide

Anklipper is a browser extension that turns text you select on a web page
into an Anki card, using the AnkiConnect add-on to talk to a local Anki.

For what the extension does and how to use it, see the
[README](../README.md).

## Where things stand

Planning is done; the code is not started. `docs/plans/00-plan.md` is the
index: pinned decisions, the milestone list, and which subplan covers each.
Read the subplan for the milestone you are picking up — and revise it against
what earlier milestones actually built before writing code. A subplan written
in advance is a proposal, not a spec.

The first milestone (M1) sets up the toolchain and test harness. Until it
lands there is nothing to install or run.

## Prerequisites

- **Node.js** and **pnpm** — exact versions are pinned in the repository
  (`.nvmrc`, `packageManager`) once M1 lands.
- **Firefox** for development. Firefox is the primary target; Chrome builds
  are kept compiling but not exercised until after the first release.
- **Anki** with the **AnkiConnect** add-on, for anything that talks to a real
  collection. Unit tests do not need either — AnkiConnect is mocked.

## Getting started

Once M1 lands, the loop is `pnpm install`, then the project's own scripts for
dev, test, lint, typecheck, and build. `package.json` is the source of truth
for their names; this guide does not duplicate them.

Run the extension against a **persistent Firefox profile**. A temporary
install in a fresh profile gets a new `moz-extension://` UUID each time, and
since AnkiConnect allowlists extensions by origin, a changing UUID breaks
your own AnkiConnect permission on every reload.

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

`docs/initial-context.md` is the authoritative description of architecture,
messaging, and boundaries once M2 populates it. Update it in the same change
that alters any of them.

## Commit and CI gates

Install the commit hooks once after cloning:

```bash
pre-commit install --install-hooks --hook-type commit-msg
```

They check whitespace and file hygiene, shell scripts, Markdown, and that
the commit message follows Conventional Commits. CI runs the same hooks, so
a commit that passes locally passes there. Vendored content under
`.claude/skills/` and `.claude/plugins/` is excluded.

CI additionally typechecks, tests, and builds once M1 lands `package.json`.
Both jobs are required status checks on `main`: a red run blocks merge.

## Releases

Releases come from Conventional Commits. release-please keeps a release pull
request open on `main` summarising everything since the last release;
merging it tags the version, publishes a GitHub Release, and attaches the
built extension. Nothing is released until someone merges that PR.

`CHANGELOG.md` is generated — never edit it by hand. Milestone summaries get
in through the commit that archives a plan, typed `milestone` and naming the
archived file:

```text
milestone(m3): CardDraft, cloze markup, and the port interfaces
(docs/archive/2026-05-24-2013-8a8c2cf-03-card-draft-model-and-ports.md)
```

One list, so there is never a question of which changelog to read.

## Testing

Test-driven development is mandatory here, not aspirational: write the
failing test, watch it fail, then write the minimum that passes it.

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
  completes them, named
  `YYYY-MM-DD-HHMM-<shortsha>-<original-name>.md`.
- `CHANGELOG.md` — generated. Archive a plan with a `milestone`-typed commit
  and the summary appears there.
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
