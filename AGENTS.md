# AGENTS.md

## Read First

- `README.md` — project overview
- `docs/initial-context.md` — architecture, extension structure, and constraints
- `docs/plans/*.md` — active implementation plans

## Project Rules

- Use `gh` for GitHub operations when available; in environments without it
  (e.g. remote agent sessions), use the GitHub MCP tools instead
- Use the project's package manager and scripts for development workflows
- Run commands from the project root
- Keep browser-extension code compatible with the supported browsers and
  extension manifest version defined by the project

## Plans

- Active: `docs/plans/`
- Archive: `docs/archive/`
- Archive completed plans in the same PR
- Archived filename format:
  `YYYY-MM-DD-HHMM-<shortsha>-<original-name>.md`
  where date/time and SHA are from the commit that archives the plan
  Example:
  `2026-05-24-2013-8a8c2cf-002-svelte-extension.md`

## Architecture

The extension is a browser extension for creating Anki cards from text
selected on the current page.

Core boundaries:

- **Content/page layer** — selection and page-context extraction
- **Extension/background layer** — extension lifecycle, messaging, and
  browser APIs
- **Svelte UI** — card preview/editing and user interaction
- **Card model** — framework-independent representation of a card draft
- **Card generation** — converts selected text/context into a `CardDraft`
- **AnkiConnect adapter** — communicates with the local AnkiConnect API
- **Settings/storage** — persists extension configuration

Keep these boundaries explicit. The Svelte UI should not contain AnkiConnect
protocol logic, and AnkiConnect should not depend on Svelte components.

Update `docs/initial-context.md` before merging changes affecting:

- architecture
- boundaries
- messaging between extension components
- card model
- AnkiConnect integration patterns
- browser-extension permissions or capabilities

## Workflow

**MANDATORY TDD — no exceptions.**

Follow this discipline for behavior changes:

1. Write failing tests FIRST
2. Run the relevant test suite and confirm the expected failure
3. Write the minimal implementation to make the tests pass
4. Refactor with tests green
5. Run the full project checks before creating a PR

Tests should cover behavior rather than implementation details.

For UI work, prefer testing observable component behavior and user
interactions rather than internal Svelte implementation details.

Never write implementation code before the corresponding test exists when
the behavior is reasonably testable.

## Development Workflow

Before starting substantial work:

1. Read the relevant documentation and active plan.
2. Inspect existing architecture and patterns.
3. Identify the smallest coherent change.
4. Write/update tests first.
5. Implement the change.
6. Run formatting, linting, type checking, and tests.
7. Update documentation when architecture or user-visible behavior changes.

Prefer the project's existing pnpm/pnpm/bun scripts over invoking tools
directly.

## Decision Order

Prioritize:

1. Correctness
2. Passing tests
3. Simplicity
4. Existing project patterns
5. Minimal dependencies
6. Minimal diffs

## Commits & Branches

### Commits

- Use **Conventional Commits**:
  `<type>(<scope>): <subject>`
- Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`,
  `ci`, `chore`
- Keep commits small and atomic.
- Use imperative present tense.
- Keep commit subjects concise.
- Reference issues when relevant.

Examples:

```text
feat(selection): capture page context
feat(anki): add notes through AnkiConnect
feat(editor): add card preview
test(card): cover draft validation
fix(anki): handle connection failures
```

### Branches

* `feature/<name>`
* `fix/<name>`

**At session start**, work on the branch the user specifies. If their prompt
already names one, use it without asking; otherwise ask which branch to work
on before doing anything else.

Before creating a branch, check for an existing open PR (`gh` when available,
otherwise GitHub MCP tools). If an open PR covers the same area, commit
directly to that branch instead of creating a new one.

## Pull Requests

* Keep PRs focused.
* Avoid unrelated refactors.
* Include tests for behavior changes.
* Update relevant documentation.
* Ensure formatting, linting, type checking, and tests pass.
* Describe user-visible behavior changes in the PR.

## Code Standards

### TypeScript

* Use strict TypeScript configuration.
* Prefer explicit types at module boundaries.
* Avoid `any`; use `unknown` when the type is genuinely unknown.
* Keep browser API interactions behind small abstractions where practical.
* Prefer immutable data where it improves clarity.
* Avoid unnecessary global state.
* Keep pure card-generation and transformation logic separate from browser APIs.

### Svelte

* Use Svelte components for UI concerns.
* Keep components small and focused.
* Avoid putting business logic directly into large components.
* Keep AnkiConnect calls out of Svelte components.
* Prefer derived state over duplicated state.
* Use accessible HTML controls and labels.
* Test user-visible behavior rather than component implementation details.

### Browser APIs

* Use the WebExtension/browser APIs consistently with the project's
  supported browsers.
* Keep content-script, background/service-worker, and UI responsibilities
  separate.
* Minimize requested permissions.
* Do not introduce broad host permissions without a clear requirement.
* Handle extension messaging failures explicitly.

### AnkiConnect

* Treat AnkiConnect as an external/local service.
* Keep all AnkiConnect protocol details in the adapter/service layer.
* Handle Anki not running, AnkiConnect unavailable, malformed responses, and
  API errors explicitly.
* Do not couple the card editor to a specific AnkiConnect request format.
* Use the framework-independent `CardDraft` model between generation/UI and
  AnkiConnect.

### Card Model

The core card representation should remain independent of Svelte and
AnkiConnect.

A `CardDraft` should conceptually contain:

* deck
* note type
* fields
* tags
* selected/source text
* source URL
* source title
* any additional generation metadata required by the application

Avoid putting UI state or browser-specific objects into the card model.

## Testing

Test at the appropriate layer.

### Unit Tests

Prioritize unit tests for:

* card generation
* `CardDraft` validation/transformation
* AnkiConnect request/response handling
* page-context extraction
* settings serialization
* duplicate detection, if implemented

### Svelte Tests

Test:

* rendering of card fields
* editing fields
* deck/note-type selection
* validation
* loading states
* successful submission
* error states
* user interactions

Avoid testing Svelte implementation details unless necessary.

### Integration Tests

Where practical, test the complete flow:

```text
selected text
  → card draft
  → preview/edit
  → AnkiConnect request
  → successful card creation
```

Mock AnkiConnect rather than requiring a running Anki instance for normal
automated tests.

## QA

Run the project's complete check command before every PR.

Use the commands defined in `package.json` / project documentation, typically
including:

```bash
pnpm test
pnpm run check
pnpm run lint
pnpm run build
```

Do not assume these exact commands exist; use the project's actual scripts as
the source of truth.

## Environment

The project uses:

* TypeScript
* Svelte
* a browser-extension build toolchain
* pnpm
* AnkiConnect for communication with a local Anki installation

The required Node.js/package-manager versions should be taken from the
repository configuration and `README.md`.

## Security & Privacy

* Request the minimum browser permissions required.
* Do not transmit selected page text externally unless the user explicitly
  enables a feature that requires it.
* Treat selected page content as potentially sensitive.
* AI-assisted card generation must clearly define what data leaves the
  browser.
* Never expose AnkiConnect credentials or local service details unnecessarily.
* Do not log page content, selected text, or generated cards in production
  unless explicitly required.

## Failure Policy

* Never ignore failing tests.
* Never disable tests to make CI pass.
* Never bypass TypeScript, lint, or build failures without explanation.
* Never silently swallow AnkiConnect errors.
* Never merge a broken extension build.
* Surface blockers clearly.

## Agent Constraints

* Prefer minimal diffs.
* Preserve existing architecture unless intentionally changing it.
* Reuse existing patterns.
* Avoid unnecessary dependencies.
* Avoid introducing a UI framework beyond Svelte.
* Keep AnkiConnect integration isolated.
* Keep browser APIs isolated from domain logic where practical.
* Avoid premature AI integration.
* Avoid rewriting working code without a clear reason.
* Keep changes reviewable and focused.

## Enforcement

The repository's local hooks and CI are the final enforcement mechanism for:

* formatting
* linting
* TypeScript checking
* tests
* build
* Conventional Commit validation

All checks must pass before merge.

