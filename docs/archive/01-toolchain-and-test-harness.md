# M1 — Toolchain and test harness

Index: `00-plan.md`. Depends on: nothing. Blocks: everything.

## As built

Archived on completion. Where the milestone landed differently from the plan
below:

* **Test fixtures live in `src/fixtures/`, not `tests/fixtures/`.** `@/`
  resolves to `srcDir`, so a fixture outside it cannot prove the alias. Both
  the alias probe and the Svelte fixture component sit there; the TDD gate
  already exempts `fixtures/`.
* **The Node and pnpm versions are stated in the developer guide, not the
  README.** `AGENTS.md` reserves the README for people who use the extension
  and do not write software — no build steps. The guide points at `.nvmrc`
  and `packageManager` rather than repeating the numbers, per the same rule.
* **MV3 is pinned explicitly.** WXT defaults Firefox to MV2; without
  `manifestVersion: 3` the Firefox build was MV2 while Chrome was MV3.
  Confirmed alongside the risk below: Firefox gets `background.scripts` (an
  event page), Chrome a service worker.
* **`browser_specific_settings` is emitted for Firefox only**, and carries
  `data_collection_permissions: { required: ["none"] }`, which AMO now
  requires of new extensions.
* **The content script registers at runtime.** A manifest-declared one needs
  match patterns, and those become install-time host permissions the MVP
  ceiling disallows.
* **`pre-commit install --install-hooks --hook-type commit-msg`, as
  documented, installed only the commit-msg hook** — naming a type overrides
  `default_install_hook_types`, so the commit-time gate never ran. Fixed in
  `AGENTS.md` and the developer guide.
* **Prettier, ESLint, and Vitest had to join the pre-commit config in the
  same commit as the toolchain**, because pre-commit refuses to run while its
  own config is unstaged.
* **Test 5 is complete.** Run 32651929991 turned both CI jobs red on the
  deliberate assertion — the build job's `pnpm test`, and the lint job's
  Vitest pre-commit hook — and run 32652022046 was green once corrected.
* **The first release exposed two further problems**, both fixed after this
  plan was archived. release-please read a `feat` against a `0.0.0` manifest
  as 1.0.0, so `initial-version` and `bump-minor-pre-major` now hold the
  series at 0.x. And the `milestone` commit type this plan relied on could
  not survive a squash merge; milestones now reach the changelog as their
  pull request title, with the scope naming the archived plan.
* **The extension has not been loaded in Firefox.** No Firefox in the
  environment that built this; the Chrome build was smoke-loaded in headless
  Chromium with no extension or manifest errors.

## Goal

A repository where `pnpm test`, `pnpm check`, `pnpm lint`, and `pnpm build`
all run — locally and in CI — against a Svelte + TypeScript MV3 extension
that loads in Firefox and does nothing yet.

The deliverable is the **loop**, not the config: a failing test must fail in
CI and pass once corrected. Config that has never rejected anything is
unproven.

`AGENTS.md` mandates TDD without exception, so no feature work starts until
this milestone is green.

## Non-goals

No card logic, no AnkiConnect calls, no real UI, and no context menu.
Entrypoints are stubs that prove the build wiring and nothing else. Resist
filling them — an entrypoint is exempt from the TDD gate, and logic parked
there escapes testing.

## Decisions this milestone pins

Recorded here so later milestones inherit them rather than re-choosing.

| # | Decision | Note |
|---|----------|------|
| 1.1 | **WXT** as the extension framework | Pinned as P1 in the index. Alternatives considered: Plasmo (heavier conventions, weaker Svelte story), CRXJS + Vite (thinner, but manifest and cross-browser work becomes ours), `vite-plugin-web-extension` (same trade). WXT generates the MV3 manifest, targets Chrome and Firefox from one source, and ships a fake `browser` for tests. |
| 1.2 | **Vitest** as the runner | Shares Vite's transform pipeline with WXT, so one config governs build and test. |
| 1.3 | **`@webext-core/fake-browser`** for extension APIs | In-memory `browser.*` implementation; no hand-rolled mocks, no real browser in unit tests. |
| 1.4 | **Two Vitest projects**: `node` for domain logic, `jsdom` for Svelte | Keeps pure layers honest — domain tests fail loudly if something reaches for a DOM. |
| 1.5 | **`@testing-library/svelte`** for component tests | Observable behaviour, per `AGENTS.md`. |
| 1.6 | ESLint flat config + Prettier, `svelte-check` for types | |
| 1.7 | Conventional Commits enforced at commit time | Already in place via `pre-commit`. |
| 1.11 | **`pre-commit`** (the Python framework) for local hooks, not husky | Already in place and green. Language-agnostic, so shell, Markdown, and TypeScript hooks live in one config, and CI runs the identical hooks — a clean commit means a clean CI run. |
| 1.12 | The CI `build` job activates via **`hashFiles('package.json')`** | Already in place. A job naming `pnpm lint` before the project has scripts fails on every push; the guard lets the workflow be written once and start working when M1 lands. |
| 1.13 | **release-please** cuts releases from Conventional Commits on `main` | Merging its release PR is what releases, so the act stays deliberate while the version and notes are derived rather than typed. |
| 1.14 | **One changelog.** release-please owns `CHANGELOG.md`; milestone summaries reach it through `milestone`-typed commits, which have their own section | Two lists of changes in one repository is worse than one imperfect list — a reader should never have to ask which changelog is current. |
| 1.8 | Node and pnpm versions pinned in-repo | `packageManager`, `engines`, and `.nvmrc`, so CI and local agree. |
| 1.9 | **Firefox is the default build target** (P5); Chrome builds are produced but not exercised until after the first release | WXT switches targets with a flag, so keeping the Chrome build compiling costs one CI job and prevents the port becoming a rewrite. |
| 1.10 | `wxt dev` runs Firefox against a **persistent profile** via `web-ext` | A temporary install in a fresh profile draws a new `moz-extension://` UUID each time, which would break the developer's own AnkiConnect allowlist entry on every reload (index, *AnkiConnect reachability*). |

None of the index's open questions are resolved here; they belong to M3, M5,
and M9.

## Deliverables

### Project scaffold

* WXT + Svelte + TypeScript, `strict: true`, with `noUncheckedIndexedAccess`.
* Stub entrypoints: background (event page on Firefox), content script,
  sidebar.
* Manifest: the M2 permission set is *not* added yet — M1 requests nothing
  it does not use. The pinned extension identity and host permission arrive
  with the code that needs them.
* Path alias (`@/…`) resolving identically in build, test, and typecheck.
* `.nvmrc` — the CI `build` job reads `node-version-file` from it.
* ESLint, Prettier, and `vitest` added to `.pre-commit-config.yaml` as local
  hooks, so the commit-time gate covers TypeScript and Svelte rather than
  only shell and Markdown.
* release-please switched from `simple` to the `node` release type, and a
  first release cut end to end: the release PR opens, merging it tags, and
  the built extension is attached to the GitHub Release.

### Scripts

`dev`, `build`, `test`, `test:watch`, `check` (`svelte-check` + `tsc
--noEmit`), `lint`, `format`. `check` and `lint` stay separate so a type
error is never mistaken for a style failure.

### Test harness

* Vitest projects per 1.4, with a setup file that installs the fake browser
  and **resets its state between tests** — leaked storage between cases is
  the standard way an extension suite goes quietly wrong.
* `@testing-library/svelte` plus jest-dom matchers, with automatic cleanup.
* Coverage reporting configured but **no threshold yet**: a threshold on an
  empty suite measures nothing.

### Boundary lint rule (scaffold)

`no-restricted-imports` wired up so the domain layer cannot import
`webextension-polyfill`, `wxt/browser`, or Svelte. Populated properly in M3
when those directories exist; here it just has to run.

### CI

One workflow on push and PR: install with a frozen lockfile, then `lint`,
`check`, `test`, `build`. Cache the pnpm store. CI runs the same scripts a
contributor runs — no CI-only invocations.

## Tests to write first

Infrastructure still gets tests first; these assert the harness works, and
each one must be seen failing before the config that satisfies it exists.

1. **Fake browser is installed and isolated** — write a value to
   `browser.storage.local`, read it back. A second test asserts the store is
   empty, proving the reset between cases.
2. **jsdom project renders a Svelte component** — a fixture component under
   `tests/fixtures/` renders and its text is queryable.
3. **Node project has no DOM** — asserting `typeof document === "undefined"`
   fails if the environments are misconfigured.
4. **Path alias resolves under test** — import a fixture via `@/…`.
5. **The loop proof** — a test asserting a deliberate falsehood, confirmed
   red locally *and in CI*, then corrected in the same PR. The red CI run is
   the artefact; without it, nothing has been demonstrated.

## Done when

* `pnpm install --frozen-lockfile` succeeds from a clean checkout.
* All four scripts pass locally and in CI.
* The extension loads in Firefox with no console errors, and the Chrome
  build compiles.
* Tests 1–4 pass; test 5 has been observed failing in CI and then passing.
* `.claude/hooks/test-check-tdd.sh` still passes — the TDD gate's exemptions
  match the layout this milestone creates.
* `README.md` states the Node and pnpm versions and how to run the four
  scripts.

## Risks

* **Svelte 5 and WXT version drift.** Pin exact versions; a lockfile in the
  first commit is part of the deliverable.
* **Sidebar typings across two APIs.** `sidebarAction` and `sidePanel` are
  different shapes; the wrapper in M2 is what reconciles them. Keep any
  ambient declaration in `*.d.ts` — which the TDD gate exempts, and which
  therefore must not accumulate logic.
* **Firefox MV3 background form.** WXT emits an event page rather than a
  service worker for Firefox. Confirm which it produces here, because M2's
  no-state-in-module-scope rule depends on knowing the background can be
  unloaded either way.
* **jsdom gaps.** Svelte 5 may exercise APIs jsdom lacks. If so, evaluate
  happy-dom rather than adding shims one at a time.
* **Over-scoping.** The temptation is to add the whole permission set and
  real entrypoints now. Both belong to M2, where tests can cover them.
* **Release type drift.** The release-please config starts at `simple`
  because there is no `package.json` to version. Switching it to `node` is
  part of this milestone; leaving it lets the manifest version and the
  package version drift apart silently.
* **AMO signing is not wired up.** Releases attach a built artifact to the
  GitHub Release. Publishing to addons.mozilla.org needs API credentials as
  repository secrets and is its own step, after the first release works.
