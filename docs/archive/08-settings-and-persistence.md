# M8 — Settings and persistence

## As built

Settings exist, are versioned from the first release, are validated on every
read, and reach the three places that needed them: what a capture starts from,
what the AnkiConnect adapter connects to, and what the user can change. All six
decisions hold and the eleven tests below exist. What differs from the text
that follows, and why:

**The default note type is stored as a descriptor, not a name.** The plan says
"default note type", and a name is the obvious reading. It does not work:
fields are the draft's keys (3.1), so generating a card needs the field list,
and the background would have to ask Anki for it *inside a capture gesture* —
a network round trip and a new failure mode in front of every capture, on a
path that must reach `sidebar.open` before it awaits anything. So the setting
holds `NoteType` as Anki described it when the user chose it. The options page
is where that descriptor comes from, and M7's reconciliation on open
(`refreshNoteType`) is what heals it when the note type is edited in Anki
afterwards. `readSettings` rebuilds it through `createNoteType` rather than
casting, so a stored `kind` that disagrees with the stored fields cannot
survive a read.

**`sourceUrlStyle` has two values, not three.** "Source-URL behaviour" and
"field mappings" are listed as separate deliverables, and the first draft made
them separate knobs — `omit | plain | link` alongside a field name. They can
veto each other: a mapping naming a field and a style saying `omit` is a state
no user can read off a form. The mapping decides **whether** the URL is written
(an unmapped field is the off switch) and the style decides **how**. A test
caught this rather than a review: generation with a mapping set and the style
defaulted wrote nothing.

**There is a fourth port, `RememberedStore`.** 8.5 requires the last-used deck
to be kept apart from the settings, and "apart" has to mean something
mechanical or it decays into a comment. It is its own port, its own storage
key, and its own in-memory fake. `DraftStoreError` and `SettingsStoreError`
collapsed into one `StoreError` shape at the same time — they were always
identical, and a third copy of it was the point at which that stopped being
worth maintaining.

**`SettingsStore` gained `reset()`.** 8.5 talks about "reset settings" as
something that exists, and the M3 port had no such operation; a caller writing
`DEFAULT_SETTINGS` itself would be a second place that knows what a reset
means. Reset writes the defaults over **this version's keys only** — a key a
newer version owns survives it, and so does the remembered deck. Both are
pinned by tests.

**The v0 → v1 migration is a version stamp and nothing else, and says so.**
There is no released v0 *shape*: M8 is the first version that stores settings
at all, so an unversioned payload is a hand edit or a pre-release build. Giving
it invented work would have been worse than admitting it has none — the point
of 8.1 is that the machinery has run before anything depends on it. The
**runner** stamps the version rather than each migration, because an invariant
every future author has to remember is one that eventually gets forgotten. A
payload from a *newer* version is left exactly as it is; there is no
downgrade, and `readSettings` takes what it recognises.

**Settings are resolved per gesture, and the adapter is rebuilt per call.**
Neither is cached. The background is unloaded when idle, so there is nothing
to cache a resolved default *in*; and the options page can change the endpoint
or the API key while the sidebar is open, so a client captured at mount would
go on talking to the old address until the panel was reopened.
`createSettingsAnkiClient` reads the settings and builds an `AnkiClient` on
every call — closures and one `storage.local` get, in front of an HTTP round
trip that costs more.

**`loadSettingsOrDefaults` is the read most callers want.** A capture still has
to make a card and the adapter still needs an endpoint, so a storage failure
degrades to the shipped defaults (8.2). The options page is the one caller that
uses `load` directly, because it is about to write over whatever could not be
read and that is worth saying out loud.

**The deck is remembered on the add, not on the dropdown.** A deck someone
scrolled past is not evidence of anything; a deck a card is actually in is. A
failed write there costs the next capture its starting deck and nothing else,
so it does not join the errors the user is asked to act on.

**The options page opens in a tab.** Firefox embeds `options_ui` inside
`about:addons` by default, a few hundred pixels tall; this form is four groups
of controls. `manifest.open_in_tab` in the entrypoint's HTML, pinned by
`tests/manifest/generated-manifest.test.ts` along with the fact that the page
costs no new permission.

**No diagnostics view — that is M9.** Test 11 says "diagnostics output and
error payloads never contain the key", and what exists to assert against is
M4's `describeAnkiConnection` and the adapter's own error payloads. Both are
covered. The user-facing diagnostics screen is 9.3.

**The mapping is restrained three ways.** It skips a field the note type does
not have (the mapping outlives any one note type, and `unknown-field` at submit
is three layers from where it could be explained), it never overwrites a field
that already has content, and it returns the draft unchanged when there is
nothing to write. The `link` style escapes what it wraps: Anki stores fields as
HTML and a page title is page content.

---

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
