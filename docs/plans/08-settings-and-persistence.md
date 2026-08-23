# M8 — Settings and persistence

Index: `00-plan.md`. Depends on: M7. Blocks: M9.

## Goal

Replace M7's hardcoded defaults with stored, editable settings — and make
stored data survive schema changes, which is the part that is easy to skip
and expensive to add later.

## Non-goals

No onboarding or diagnostics (M9), no sync across devices, no per-site
settings.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 8.1 | Settings carry a **schema version from the first release** | Adding versioning after users have stored data means guessing what they have. |
| 8.2 | Unknown or malformed stored values **degrade to defaults**; startup never fails on them | A settings bug must not brick the extension. |
| 8.3 | Settings are **validated on read**, not trusted | Storage is shared mutable state; another version of the extension may have written it. |
| 8.4 | Storage area is `storage.local`, not `sync` | Deck and note-type names are machine-specific, and `sync` adds quota and conflict rules for no MVP benefit. |
| 8.5a | The API key is stored like any other setting, but **never logged, never shown in diagnostics, and never included in an error payload** | It is a credential for a service that can delete the user's collection. |
| 8.5 | Last-used deck is **remembered state, not a setting** | Kept apart from user-chosen defaults so "reset settings" does not erase it, and changing it does not feel like editing configuration. |

## Deliverables

* `SettingsStore` implemented on extension storage against the M3 port.
* Settings: default deck, default note type, default tags, field mappings
  (where the source URL and title go), source-URL behaviour, AnkiConnect
  endpoint and timeout, and an optional AnkiConnect **API key**.
* The endpoint is configurable because the add-on's own `webBindAddress` and
  `webBindPort` are.
* Migration runner: versioned, ordered, idempotent, with a v0→v1 migration
  present from the start so the machinery has been exercised at least once.
* Options page reusing M6's components and view-model layer.
* Last-used deck tracked separately and applied to new drafts.

## Tests to write first

1. Defaults are returned when nothing is stored.
2. A saved setting round-trips.
3. A malformed stored value falls back to the default and the rest of the
   settings still load.
4. An unknown key is preserved, not deleted — a newer version may own it.
5. A v0 payload migrates to v1; running the migration twice changes nothing.
6. Migrations run in order across two versions.
7. A new draft picks up default deck, note type, and tags.
8. Last-used deck overrides the default for the next draft, and survives a
   settings reset.
9. Field mapping puts the source URL in the configured field.
10. A configured API key reaches the adapter's requests.
11. Diagnostics output and error payloads never contain the key.

## Done when

* Settings survive a browser restart.
* Corrupt stored data cannot prevent the extension from starting — asserted,
  not assumed.
* The options page is keyboard-accessible and validated.
* The endpoint setting is actually honoured by the M4 adapter.

## Risks

* **Migration drift.** A migration that reads current defaults instead of the
  shape it was written for breaks silently later. Migrations must be pure
  functions of their input payload.
* **Settings as a dumping ground.** Each new key needs a reason and a test;
  otherwise this becomes a compatibility surface nobody can change.
