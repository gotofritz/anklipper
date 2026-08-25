# Initial context

The authoritative description of Anklipper's architecture: what the layers
are, where their boundaries run, how the extension's contexts talk to each
other, and which permissions it holds. `AGENTS.md` requires this file to be
updated in the same change as anything it describes.

For what the extension does, see the [README](../README.md). For how to build
and test it, see the [developer guide](developer-guide.md). For what is being
built next, see [the plan index](plans/00-plan.md).

Written at M2, which created the extension skeleton, extended at M3 with the
card model and the ports, at M4 with the AnkiConnect adapter behind the first
of them, at M5 with selection capture — the context menu, the shortcut, and
the extraction that fills a draft — at M6 with the sidebar editor built on
all of it, at M7 with the two joined: the real adapter under the real editor,
and the draft made durable from the moment it exists — and at M8 with
settings: a versioned, validated store behind the last port, an options page
over it, and the constants M7 captured with replaced by what the user chose.
Where a layer named below does not exist yet, this file says so.

## What the extension is

A browser extension that turns text selected on a web page into an Anki card,
by talking to the AnkiConnect add-on on a local Anki. Firefox is the target
that ships; Chrome is kept compiling and is not exercised until after the
first release (P5).

## Layers

Card generation and the UI depend on interfaces — ports — and never on
AnkiConnect or `browser.*` directly (P3). Every port has a real
implementation and an in-memory fake, and tests run against the fake.

| Layer | Directory | Depends on | Exists |
|-------|-----------|------------|--------|
| Result type | `src/core/` | nothing | M2 |
| Card model, card generation | `src/core/` | nothing | M3 |
| Capture value (`PageCapture`) | `src/core/capture.ts` | nothing | M5 |
| Settings schema and its migrations | `src/core/settings*.ts` | the card model, `src/manifest/` | M8 |
| Ports and their fakes | `src/core/ports/` | the card model | M3 |
| Typed messaging | `src/messaging/` | ports | M2 |
| Platform wrappers (ports + adapters) | `src/platform/` | `browser.*` | M2 |
| Manifest constants | `src/manifest/` | nothing | M2 |
| Background context | `src/background/` | ports, messaging | M2 |
| Page context | `src/content/` | ports, messaging | M2 |
| Sidebar UI | `src/sidebar/` | ports, messaging | M2 |
| Sidebar editor: view-model and components | `src/sidebar/` | ports, the card model | M6 |
| Options page: view-model and form | `src/options/` | ports, the settings schema | M8 |
| The draft in flight: the two slots and the moves on them | `src/sidebar/session.ts` | ports | M7 |
| Page extraction | `src/content/extract.dom.ts` | `PageCapture`, a document | M5 |
| AnkiConnect adapter | `src/anki/` | the card model, `fetch` | M4 |
| Entrypoints | `src/entrypoints/` | everything | M1 |

The dependency rule is one-directional: `platform` knows about the browser,
`messaging` knows about `platform`'s ports, and the three contexts know about
both. Nothing below knows about anything above. ESLint enforces the bottom of
that stack — `src/core/`, `src/manifest/`, and `src/messaging/` may not import
`wxt/browser`, `webextension-polyfill`, or Svelte.

### `src/platform/` — the only place `browser.*` is reached

Decision 2.3. Each module is one port interface plus its real implementation,
so the surface a fake has to cover stays small.

| Module | Port | Wraps |
|--------|------|-------|
| `storage.ts` | `StoragePort` | `browser.storage.local` |
| `runtime-messaging.ts` | `RuntimeMessagingPort` | `runtime.sendMessage`, `runtime.onMessage`, `tabs.sendMessage` |
| `tabs.ts` | `TabsPort` | `browser.tabs.query` |
| `context-menus.ts` | `ContextMenusPort` | `browser.contextMenus` |
| `permissions.ts` | `PermissionsPort` | `browser.permissions` |
| `origin.ts` | `OriginPort` | `runtime.getURL` |
| `sidebar.ts` | `SidebarPort` | `sidebarAction` **or** `sidePanel` |
| `scripting.ts` | `ScriptingPort` | `browser.scripting.executeScript` |
| `commands.ts` | `CommandsPort` | `browser.commands.onCommand` |
| `options.ts` | `OptionsPort` | `runtime.openOptionsPage` |
| `draft-store.ts` | `DraftStore` (the M3 port) | `StoragePort` |
| `settings-store.ts` | `SettingsStore` (the M3 port) | `StoragePort` |
| `remembered-store.ts` | `RememberedStore` | `StoragePort` |

`createStoredDrafts(storage, key)` is one draft under one key. There are two
keys — `draft` and `pending-draft` — because one card is edited at a time and
a capture made while another is open has to wait somewhere (7.4). Both
contexts hold one store per slot; neither holds a wider interface with the
slot baked into the method names.

In-memory fakes live in `src/platform/fakes/`.

### The sidebar wrapper

P2 puts the UI in the sidebar, and the two browsers spell it differently:
Firefox has `sidebarAction`, Chrome has `sidePanel`. `SidebarPort` is one
interface over both, with a single method — `open(fromGesture)`.

It promises only what both browsers can do. It does **not** promise per-tab
scoping: Chrome's panel is scoped to a tab or a window, while Firefox's
sidebar is per window and survives tab navigation. The wrapper passes the
gesture's tab to Chrome and nothing at all to Firefox.

Both browsers require `open` inside the gesture's own task, so the wrapper
reaches the browser API before it awaits anything. That is asserted by a
test, because an `await` added in front of it later would break the context
menu in a way no type checks.

## Messaging between contexts

The extension has three contexts — background, content script, sidebar — and
one channel between them.

The union has three members: `ping`, `capture-selection` (background to a
content script, M5), and `get-draft` (sidebar to the background, M5). From M7
`get-draft` answers with **both** slots — the draft being edited and the
capture waiting behind it — because the sidebar cannot ask which card the
user meant unless it is told there are two.

Reads of the draft go over the channel; **writes do not**. The sidebar writes
its edits (7.1) and hands the slot over (7.3, 7.4) through `DraftStore`
directly, against the same storage keys the background writes captures to. A
write routed through the background would have to survive an event page that
is unloaded when idle, to reach the same storage in the end.

**Every message is a member of one discriminated union** on a `type` field,
declared in `src/messaging/types.ts` (2.1). All three contexts import that
module; the shared import is what stops them drifting apart. Its companion,
`ResponseMap`, says what each message is answered with.

**Every message is answered with a `Result`** (2.2), never a bare value and
never a thrown error:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

A caller that forgets the failure branch is a type error rather than an
unhandled rejection in production.

The pieces:

- `createRegistry()` — a context registers a handler per message type.
  `dispatch` turns an incoming, untrusted value into a reply and never
  throws. An unrecognised type is rejected as `unknown-message` rather than
  dropped; a handler that throws becomes `handler-failed`, and the exception
  does not escape the context it happened in.
- `createMessenger(port)` — typed sending, over a `RuntimeMessagingPort`.
  `send` reaches the background or the sidebar; `sendToTab` reaches a content
  script.

### Failures that are normal, not exceptional

`MessagingError` names five:

| Kind | Means |
|------|-------|
| `no-receiver` | Nothing was listening. The sidebar is closed, the page is privileged, or the tab predates the extension. |
| `transport-failed` | The channel itself failed for another reason. |
| `unknown-message` | No handler is registered for that type — or it was not a message at all. |
| `handler-failed` | A handler threw at the far end. |
| `malformed-reply` | Something answered without a `Result`. |

`no-receiver` is the common one and is not an error condition: the content
script is genuinely absent on `about:` and `chrome://` pages, on the
browser's own add-on listing, in the PDF viewer, and in every tab that was
already open when the extension was installed.

### No state in module scope

Firefox's background is an event page and Chrome's is a service worker.
**Both are unloaded when idle**, so module-scope state disappears without
warning and `startBackground` runs again on the next wake-up. Anything
durable goes through `StoragePort` from the moment it exists — retrofitting
this later means rewriting the draft flow.

## Card model

`CardDraft` is the only contract between generation, the editor, and
AnkiConnect (P4). It is a plain immutable value (3.3) in `src/core/`, with no
dependency on Svelte, on AnkiConnect, or on `browser.*` — every transition is
a pure function returning a new draft.

| Module | Holds |
|--------|-------|
| `note-type.ts` | `NoteType`: name, field names in Anki's order, `kind`, required fields |
| `draft.ts` | `CardDraft`, `DraftIssue`, and every transition |
| `cloze.ts` | The `{{cN::…}}` parser and the string transforms over it |
| `field-html.ts` | What a field's HTML may contain, and the runs it parses into (M10) |
| `field-cloze.ts` | Cloze markup against a field that holds HTML (M10) |
| `sticky.ts` | Which fields are pinned, and what they carry to the next card (M10) |
| `validate.ts` | `validateDraft` — the issue list |
| `capture.ts` | `PageCapture`, `CaptureWarning`, and the extraction caps |
| `generate.ts` | `generateBasicCard`, `generateFromCapture` — selection plus page context to a draft |
| `source-fields.ts` | Where the source URL and title are written into fields, and in what form (M8) |
| `settings.ts` | `Settings`, its defaults, the read that degrades, and the write that is refused (M8) |
| `settings-migrations.ts` | The versioned, ordered, idempotent migration runner (M8) |
| `ports/` | `AnkiClient`, `DraftStore`, `SettingsStore`, `RememberedStore`, and their fakes |

**Fields are keyed by the note type's real field names** (3.1). A positional
array breaks the moment a note type is edited in Anki.

**Fields hold HTML** (10.2), because Anki's own fields do. `field-html.ts` is
the only module that decides what that HTML may be, and it decides by
*rebuilding* rather than filtering: markup is parsed into runs of text
carrying inline marks — `b`, `i`, `u`, `sub`, `sup`, and a `<br>` read as a
newline — and serialised back with the text escaped, the tags emitted from
that allowlist in one canonical order, and **no attributes at all** (10.5).
Nothing survives the round trip that this module did not write, which is what
keeps a page's script, handler, style, or embed out of a user's collection.
The same round trip makes the transform idempotent, so a value that has been
through the editor once is unchanged by going through again.

Two consequences worth naming. "Empty" is about what a field *says*, so
`isFieldEmpty` reads its text — a `contenteditable` the user emptied is left
holding a `<br>`, and the required-field rule must not pass on markup nobody
can see. And everything written into a field is escaped on the way in: the
capture (5.2, 10.3) and the source URL and title (M8) are all plain text, and
a page whose title contains a tag must not put one into the collection.

**Runs are also the coordinate system.** Concatenating a field's runs gives
exactly the text `cloze.ts` works in, so a range chosen in the rendered field
is already a range the model understands. That is what makes the editor's
mapping (below) a measurement rather than a translation.

**A field can be pinned** (10.6). `sticky.ts` holds which, keyed by note type
and then by field, because a field belongs to its note type (3.1). Presence in
the map is the pin and the value is what it last held, so a field can be
pinned while empty. Only *empty* fields are filled on the next card: a pin is
a convenience and must never overwrite what the user just selected.

**The landing area is the copy a note-type change cannot move** (10a.1).
`draft.scratch` holds the selected text, as plain text, outside the field map
entirely. The reason is 3.2 seen from the outside: Basic and Cloze share no
field name, so switching between them carries nothing, stashes everything, and
renders a form of empty fields — recoverable, and indistinguishable from data
loss. So the selection also lives somewhere that is not a field, the editor
renders it as a `<textarea>` above the note type, and fields are filled *from*
it by `sendToField` (10a.2), which escapes what it sends because a field is
HTML and a page's text is not. It is never sent to Anki: it is the material a
card is made from, not part of the note, and it is what M12's generation will
read. A draft stored before it existed has its landing area filled from the
capture on read, degrading rather than refusing (8.2's rule).

**Changing note type remaps by name; unmatched content is stashed, never
dropped** (3.2). Fields whose names exist in both carry over. The rest move to
`draft.stash`, keyed by the note type they came from, and are restored — into
blank fields only — if the user switches back. The stash is bounded two ways:
restoring consumes it, and clearing a field clears that name out of every
stash, because content the user deliberately emptied must not reappear. The
editor now *says* which note type's content is in the stash — silence about it
was the other half of what made a note-type change look destructive.

**Validation returns a list of typed issues, not a boolean** (3.4), so the
editor can name the field and say why. It reports every issue rather than
stopping at the first.

**Provenance is kept verbatim and separately** (3.6). `draft.source` holds the
selection exactly as captured, plus the surrounding context, URL, and title —
and, from M5, the nearest heading and the selection's original HTML (5.2).
`draft.generation` names the generator and its version, so a later AI
generator is distinguishable from this one, and carries the capture's
warnings so the editor can say what could not be read (5.4).

### Cloze

Cloze is a note-type flavour rather than a separate model (P7, 3.7):
`NoteType.kind` is `"standard"` or `"cloze"`, read off the note type rather
than chosen by the user, and `noteTypeKindOf(draft)` is how the rest of the
code asks.

Deletions live as `{{cN::answer::hint}}` markup **inside the field text**
(3.8) — Anki's own representation is the single source of truth, so there is
no parallel list of ranges to drift out of sync. `cloze.ts` parses on demand.

- A new deletion takes `max(ordinal) + 1`; passing an ordinal explicitly
  reuses it, which is how several spans are grouped under one `cN` (3.9).
- Overlapping deletions are rejected. Ordinal **gaps are left alone** —
  renumbering happens only when asked for (3.10).
- Markup is round-trip validated rather than escaped (3.11): captured web text
  may contain braces, so `addDeletion` re-parses what it produced and refuses
  when the result would not mean what was intended. Anything beginning `{{c`
  that the parser cannot account for becomes a typed issue, never a silent
  reinterpretation.
- Basic ↔ Cloze share no field name, so switching stashes everything per 3.2.
  `convertToCloze` / `convertFromCloze` additionally carry the primary field
  across — `Front` into `Text` and back, stripped of markup — and are an
  explicit user action, never automatic (3.12).

Character ranges are read against the text as given and used immediately: a
transition takes text plus a range and returns new text, and never holds an
offset across an edit.

`field-cloze.ts` is the bridge to a field that holds markup (M10). The model
is unchanged — it is still asked first, and its verdict on the range, the
ordinal, the overlap, and the braces is authoritative — and only once it has
said yes are the braces spliced into the markup, as *unmarked* text, so bold
`Paris` becomes `{{c1::<b>Paris</b>}}` rather than `<b>{{c1::Paris}}</b>`.
The result is then checked against what the model produced: if the field's
text and the model's text ever disagree, that is `cloze-markup-unstable`
rather than markup whose meaning nobody can predict. Unwrapping cuts out the
braces and leaves the formatting inside them where it was.

## Capture

One user gesture — the **Create Anki Card** context-menu entry or its
keyboard shortcut — becomes a stored draft. `src/background/capture.ts` is
the whole path, and it is one path however the gesture arrived.

**The page is read by a content script, not by the menu event** (5.1). The
event's `selectionText` is truncated by the browser and carries no
surroundings, so it cannot supply the block or heading the card model asks
for. It is kept as the fallback for a page no content script can run in.

**Fields carry plain text; the original markup is kept beside them** (5.2).
Line breaks survive; the HTML fragment goes to `source.html` for a later
milestone to offer rich capture from, without re-extracting. This governs
capture, not editing.

**The bounds are structural, not arithmetic** (5.3). The selection is capped
at 10 000 characters and the surrounding context at 1 000; the context itself
is the nearest block-level ancestor's text, and the heading is the nearest
preceding `h1`–`h6`. A block ancestor respects the document's structure
instead of slicing mid-sentence, and a wrapper with no text of its own is
climbed past, bounded.

**Blind spots fail loudly and specifically** (5.4). `getSelection()` does not
reach into a shadow root, a cross-origin frame is a separate context, and the
built-in PDF viewer runs no content script at all. Each becomes a named
`CaptureWarning` on the capture, carried into `draft.generation.warnings` and
shown in the sidebar. Where the menu event carried text, a degraded draft is
still made: a degraded card beats no card, provided the degradation is
visible.

**The sidebar is opened first, inside the gesture's own task — and then not
waited for.** Both browsers require the call inside the gesture, so
`captureFromGesture` is not `async` and reaches `sidebar.open()` before it
awaits anything. Nothing else waits on that promise: Firefox's sidebar is
already open for every capture after the first, and what `sidebarAction.open()`
does then is not this extension's to rely on. The capture reads the page and
stores the draft first, and only then gives the sidebar a bounded moment to
answer, timing out into `open-timed-out`. A sidebar the user can open
themselves is a far smaller problem than a capture that produced nothing.

The draft is stored, and the sidebar reads it back out with `get-draft` — the
two finish in no fixed order, and the background is unloaded when idle, so
nothing is held in memory between them.

**A capture never overwrites a card that is open** (7.4). The capture reads
the draft slot first: empty, and it takes it; occupied, and the new draft
goes to the waiting slot instead, for the sidebar to ask about. A value the
store cannot read is not a card anyone is editing, so it is replaced rather
than protected — and whatever was already waiting is replaced freely, since
nothing edits the waiting slot and so there is nothing in it to lose. The
capture reports which slot it used, and `describeCapture` carries that
through.

**Defaults come from the settings, resolved per gesture** (M8).
`src/background/defaults.ts` reads the `SettingsStore` and the
`RememberedStore` and hands `captureFromGesture` a `GenerationDefaults`. It is
resolved per capture rather than held, because the background is unloaded when
idle and has nowhere to hold it, and because the options page can change it
between two captures. It is resolved *after* `sidebar.open`, so it cannot cost
the gesture — a test pins that.

Neither read can fail a capture. A settings read that failed, or a stored value
this version cannot make sense of, degrades to the shipped defaults (8.2):
`FALLBACK_DEFAULTS` in `src/background/capture.ts`, which is Anki's own
`Default` deck and its own `Basic`, so a capture is addable without an edit.
The note type there is the name heuristic's guess (3.7); the sidebar replaces
it with Anki's own descriptor as soon as it can reach one.

**The last-used deck beats the configured one** (8.5). The deck a card actually
went into is more recent evidence of what the user is doing than the deck they
configured once, so `resolveDefaults` prefers it. It is *remembered* rather
than configured, which is a distinction with a mechanism: a different storage
key, a different port, and a settings reset that leaves it alone.

**The sidebar re-reads on every capture, not only on mount.** Firefox's
sidebar persists per window, so after the first card it is already open when
the next gesture happens. It watches the draft key through
`StoragePort.onChanged` and pulls again; reading once on mount would leave it
showing the previous card. Pushing a draft into a live sidebar is still 7.4's.

**A capture reports what it did.** `describeCapture` reduces the result to
kinds, our own messages, and the sidebar's error — never the draft, the
selection, or the page — and the background hands that to an optional
reporter. A failed capture stores nothing, so without it the failure reaches
the user as a sidebar that appears to do nothing. Development builds log it;
production wires no reporter.

**Nothing is injected at page load.** The content script is registered with no
match patterns; a tab with none answers `no-receiver`, which buys exactly one
`scripting.executeScript` and one retry.

## The draft in flight

M7's subject, and the first place in this extension where a user's own work
can be lost.

**The draft is durable from the moment it exists, edits included** (7.1). The
capture stores it before anything renders it; the sidebar writes every edit
back as it is made. Neither context may hold it in memory alone: Firefox's
event page and Chrome's service worker are unloaded when idle, and Firefox's
sidebar goes with the window it belongs to.

The write is **debounced** — `SAVE_DEBOUNCE_MS`, in the view-model — because
both of the obvious policies are wrong. On every keystroke is wasteful; on
blur loses the last field. So it is flushed on two events besides the timer:
before a submit, and on `pagehide`, which is the last thing either browser
delivers to a sidebar that is closing.

**A write happens only while the slot still holds that capture.** The
debounce means an edit can be outstanding when the slot changes hands, and
the flush the editor makes as it unmounts is exactly when that happens — so
the write reads the slot first and does nothing unless it still holds the
capture it belongs to. Otherwise a keystroke made just before **Use the new
selection** would write the replaced card back over the one the user chose.

**Discarding is a named button and nothing else.** It empties the slot, there
is no undo, and a keyboard shortcut for that in a milestone about not losing
work would be a mistake.

**A failed add changes nothing** (7.2). The draft stands as edited, the error
names its cause and its next action, and **Try again** sends the same draft.
Retry is manual (7.5): an automatic queue needs ordering and conflict rules
that are not worth designing before there is evidence about which failures
actually recur.

**Success hands the slot over** (7.3). The card is in Anki, so the draft is no
longer in flight: the panel promotes whatever was waiting behind it, or
empties the slot, and says **Added to Anki.** in place of the first-run text.
The editor stops writing at that point — a debounced write landing afterwards
would put the card that was just added straight back into the slot.

`src/sidebar/session.ts` holds the two moves on the slots. They are one
operation with two triggers: the card was added, or the user said they meant
the newer selection. Nothing is destroyed before its replacement is known,
since the waiting capture is the only copy of itself.

## Settings

M8's subject. `src/core/settings.ts` owns the schema, `settings-migrations.ts`
owns what runs before it, and `src/platform/settings-store.ts` is the adapter
that puts them over `storage.local`.

`Settings` carries the default deck, the default note type, the default tags,
where the source URL and title are written and in what form, the AnkiConnect
endpoint and timeout, and the add-on's optional API key. `Remembered` carries
one thing: the deck the last card went into.

**The area is `storage.local`, never `sync`** (8.4). Deck and note-type names
are machine-specific, and `sync` adds quota and conflict rules for no benefit
this side of a feature nobody has asked for.

**Settings carry a schema version from the first release** (8.1). Adding
versioning once users have stored data means guessing what they have. The
shipped set of migrations reaches v1 and no further; a `v0 → v1` migration
exists so the runner has been exercised before anything depends on it, and it
does exactly one thing — stamp the version — because there is no released v0
*shape* to convert from.

**The runner is versioned, ordered, and idempotent.** Migrations are sorted by
the version they produce and only those above the stored one run; the runner
stamps the version afterwards, so no migration author has to remember to. A
payload written by a **newer** version is left exactly as it is — there is no
downgrade. Every migration must be a **pure function of its input payload**:
one that reads today's defaults produces a different answer next year, which
is a bug that only appears for users who skipped a version.

**Everything is validated on read, and a value that fails degrades** (8.2,
8.3). Storage is shared mutable state — another version of the extension may
have written it, and the user may have edited it by hand — so nothing is
trusted. Each key is validated on its own, and a bad one falls back to its own
default while the rest still load. A payload that is not an object at all
yields the defaults whole. The store reports only storage itself refusing,
because a value it cannot read is a value it has a default for. **Corrupt
stored data cannot stop a capture**, and that is asserted rather than assumed —
in `src/background/capture.test.ts` and again end to end in
`tests/integration/mvp-flow.svelte.test.ts`.

**A key this version does not own is preserved, not deleted.** A newer version
of the extension may have written it, and replacing the payload wholesale
would throw the user's choice away silently. Writes are read-modify-write, and
`reset()` — which is the defaults over this version's keys — preserves them
too.

**The note type is stored as a descriptor, not a name.** Fields are the
draft's keys (3.1), so generating a card needs the field list, and the
background cannot ask Anki for one inside a capture gesture. The options page
reads note types from Anki and stores what Anki described; M7's reconciliation
on open heals it when the note type is edited afterwards. `readSettings`
rebuilds it through `createNoteType` rather than casting it back.

**The source mapping decides whether; the style decides how.** An unmapped
field is the off switch for writing the URL into a field, and
`sourceUrlStyle` — `plain` or `link` — is only about its form. Two knobs that
could each veto the other is a state no user can read off a form.
`applySourceFields` skips a field the note type does not have, never overwrites
a field that already has content, and escapes what the `link` style wraps,
because Anki stores fields as HTML and a page title is page content.

**The API key is stored like any other setting and treated like no other**
(8.5a, 4.8). It is never logged, never in diagnostics, and never in an error
payload: `describeAnkiConnection` reports whether one is configured and never
its value, and the settings form shows it as a password field. It is a
credential for a service that can delete a collection.

**The endpoint may name only this machine.** `readSettings` degrades anything
else to the default and `validateSettings` refuses it, because the manifest
offers optional host permissions for loopback and nothing else — so an endpoint
elsewhere is one the browser would refuse anyway, and refusing it here is the
difference between naming the mistake and a failure nobody can diagnose. It is
also where P6's "nothing leaves this machine" stops being a promise about
intentions: no setting can point this extension at a remote server.

**A configured port needs a permission, and it is asked for from the Save
press.** The manifest declares `http://127.0.0.1:8765/*` — the add-on's own
default — and offers the other loopback ports as **optional** host
permissions, granted at install on neither browser.
`hostPermissionFor(endpoint)` in `src/platform/permissions.ts` turns the
endpoint into the pattern to ask about, and it is used two ways: the adapter
checks it before every call, so a port the extension cannot reach answers
`permission-missing` rather than `anki-not-running` — a cause with a fix
rather than one that sends the user to start an Anki that is already running —
and the options page *requests* it. The request is made synchronously inside
the Save press, before anything is awaited, because Firefox refuses one made
outside a user input handler; it is unconditional for the same reason, since
checking first would put an await in front of asking. Already granted resolves
without a prompt. A refusal does not throw the setting away — it is the user's
choice — but the form says the browser has not allowed it yet. **The first-run
permission flow itself is M9's** (9.6); this is only the options page keeping
its own setting honest.

**The adapter is configured from the settings on every call.**
`src/anki/from-settings.ts` turns a `Settings` into an `AnkiClientConfig` and
builds an `AnkiClient` per call, so the endpoint, the timeout, and the key the
options page just changed take effect without reopening the sidebar. Building
one is closures and one `storage.local` read, in front of an HTTP round trip
that costs more.

## The options page

`src/options/` is the settings form (M8), built the way M6 built the editor:
handed the **ports**, one view-model between it and them (6.2), `Resource` for
every asynchronous read (6.3), and native labelled controls throughout (6.5).
It reuses M6's `TagEditor` — default tags are tags — and M6's `error-copy`,
so a failure says the same thing here as it does in the sidebar.
`settingsIssueCopy` is that module's fourth table, keyed by the union, so a
validation code added without copy is a type error.

The deck and note-type lists come from Anki, which makes the form a choice
rather than two text boxes to mistype; when Anki cannot be reached it says so
and the rest of the form still works. **Saving is stricter than reading**: the
read path degrades quietly because the alternative is an extension that will
not start, while this is a user in front of a form who can be told what is
wrong. Nothing is saved while anything is invalid.

The page is reached from a **Settings** button in the sidebar, through
`OptionsPort` over `runtime.openOptionsPage()`, and opens in a tab rather than
the panel Firefox embeds in `about:addons` — that panel is a few hundred pixels
tall and this form is four groups of controls.

## Ports

The domain layer talks to interfaces, never to AnkiConnect or `browser.*`
(P3). `src/core/ports/types.ts` declares three; the adapters that implement
them arrive later, and each ships an in-memory fake in
`src/core/ports/fakes/` that tests run against.

| Port | Answers with | Real implementation |
|------|--------------|---------------------|
| `AnkiClient` | `Result<…, AnkiError>`, `AnkiConnection` | `src/anki/`, M4 |
| `DraftStore` | `Result<…, DraftStoreError>` | `src/platform/draft-store.ts`, over `StoragePort`, M5 |
| `SettingsStore` | `Result<…, SettingsStoreError>` | `src/platform/settings-store.ts`, over `StoragePort`, M8 |
| `RememberedStore` | `Result<…, RememberedStoreError>` | `src/platform/remembered-store.ts`, over `StoragePort`, M8 |

`Remembered` carries two things now: the deck the last card went into (8.5)
and the sticky pins (10.6). Both live under one storage key, so everything
that writes it goes through `updateRemembered` in `src/sidebar/session.ts` —
a write that replaced the whole value would silently drop whichever half the
other caller had just made.

`RememberedStore` is a fourth port rather than three more keys on `Settings`,
because 8.5 requires what the extension *noticed* to be kept apart from what
the user *chose* — and "apart" has to be mechanical or it decays into a
comment. All three stores report the same `StoreError` shape: they fail for
the same three reasons, and three copies of one interface is three things to
keep in step.

Every fake can be driven into failure with `failWith(error)`, because each
consumer has to be able to test its own error path. A fake that only ever
succeeds would hide exactly the cases the error taxonomy exists for.

## AnkiConnect

`src/anki/` is the only place in the codebase that knows AnkiConnect's wire
format (M4). Everything above it depends on the `AnkiClient` port and takes
this as one implementation of it; M9 owns the user-facing onboarding built on
the causes it reports.

| Module | Holds |
|--------|-------|
| `protocol.ts` | The request envelope, and one validator per reply shape. |
| `transport.ts` | `fetch`, the timeout, and the classification of everything that fails before a reply is parsed. |
| `errors.ts` | AnkiConnect's error strings, turned into typed causes. |
| `mapping.ts` | `CardDraft` → note params, and note-type descriptors. |
| `client.ts` | The port implementation and the probe. |
| `dev-harness.ts` | A development-only harness for the manual checks, absent from every build. |

**Nothing here imports `browser.*` or Svelte,** and ESLint enforces it for the
directory. The two things the adapter needs from the browser are injected as
plain values: the extension's own origin as a string, and whether the loopback
host permission has been granted as a function. So the whole layer is testable
against a stubbed `fetch`, and no test needs a running Anki.

### "Unavailable" is not one thing

The probe answers with a **cause**, never a boolean (4.3), because each has a
different fix: Anki not running, the add-on not installed, the origin rejected,
the host permission not granted, an API key required, a timeout, a malformed
reply, or an API-level error. `AnkiError` carries the
add-on's own words, plus `origin` on `origin-rejected` — so M9 can show the
user the value to paste — and `needsManualFix` on a cause no retry will clear.

The plan expected a fourth cause, `origin-rejected`, and expected it to be
indistinguishable from a dead port — both surfacing as a failed `fetch`, to be
separated by a `no-cors` probe. **It is not in the taxonomy**: M4's manual pass
found the add-on serving a background-page request whose `Origin` was absent
from `webCorsOriginList`. AnkiConnect does not enforce its allowlist
server-side; it sets CORS response headers and leaves the enforcing to the
browser, and a granted host permission exempts the extension from that.
Without the permission the adapter answers `permission-missing` before any
request goes out. There is no third path, so no call site could reach it.

With that gone every remaining cause is determinate, which is why the probe
reports no confidence flag: one that is always `true` says nothing.

### Onboarding is the host permission, and nothing else

The plan pinned onboarding on the add-on's `requestPermission` handshake (P9),
which prompts inside Anki and appends the extension's origin to
`webCorsOriginList` on approval. **P9 is reversed** and the handshake is not
implemented: there is nothing for it to unblock, since the add-on serves this
extension whether or not it is allowlisted. Restoring it is one action and one
reply shape if a different AnkiConnect version ever needs it.

What is left is the loopback host permission, which Firefox MV3 does not grant
at install — the user grants it at runtime, from a user gesture (2.7). Until
they do, every operation answers `permission-missing` before touching the
network. That is the whole of onboarding, and M9 owns the flow.

`"*"` in `webCorsOriginList` is never suggested. Web pages are the one class
CORS does constrain, so widening the list is precisely how a site the user
visits would get to drive their collection. Nothing about the allowlist gates a
client that is not subject to CORS — curl, a native app, or an extension
holding the host permission — so the extension must not describe it as
protection against itself.

### What the adapter does and does not decide

- **Duplicates are a warning, not a block** (4.4). `canAddNote` reports one
  through `canAddNotes`; `addNote` sends `allowDuplicate: true`, so a user who
  is told and goes ahead anyway is not stopped.
- **The collection's existing tags are readable**, through `getTags` (10.9).
  It feeds the tag editor's completion and nothing else, so a collection that
  will not report them costs the completion and never the card.
- **Field order is the collection's** (10.1). `modelFieldNames` answers in
  Anki's own order and nothing between it and the rendered editor sorts or
  re-keys the list — which is the whole of what that decision costs, and why
  a test holds it against a note type whose order is not alphabetical.
- **The fields go out verbatim, and nothing is injected.** Source URL and title
  are provenance on the draft (3.6); a note type with a field for them is
  filled by the editor. Cloze braces are passed through untouched — parsing
  them belongs to the card model.
- **Cloze flavour is read from the note type's templates**, via
  `modelTemplates`, and falls back to M3's name heuristic only when the
  templates cannot be read (4.6). The descriptor carries it, so no layer above
  re-derives it.
- **Every reply is validated, never cast** (4.5), and a reply that does not
  validate is `malformed-response` rather than a crash three layers away.
- **Every call has a timeout**, because Anki can accept a connection and never
  answer.
- Requests carry **no headers**, which keeps every call a CORS-simple request
  and takes the add-on's preflight handling out of the path.

**The extension's origin is read at runtime, never hardcoded** (P8, 2.6).
AnkiConnect rejects any request whose `Origin` is absent from its
`webCorsOriginList`, and the extension's origin is not allowlisted by default.
Firefox mints a fresh `moz-extension://<uuid>` per installation, so no constant
is correct for two users. `OriginPort.extensionOrigin()` reads it from
`runtime.getURL("")` and strips the trailing slash an `Origin` header never
carries.

**The extension's identity is pinned** (2.4), so that origin survives a
reload — otherwise the user's own allowlist entry would break every time.
Firefox: `browser_specific_settings.gecko.id`. Chrome: `key`, which fixes the
id an unpacked build loads under. Both live in `src/manifest/manifest.ts`.

## The sidebar editor

`src/sidebar/` is the whole UI (M6, rebuilt to Anki's own shape in M10). It is
handed an `AnkiClient` and renders a `CardDraft`. It holds no protocol
knowledge and reaches no `browser.*` API, so its tests run against M3's
in-memory fake rather than a running Anki.

| Module | Holds |
|--------|-------|
| `Panel.svelte` | The shell: connection status, and the editor once there is a client to build it against. |
| `editor-model.svelte.ts` | The view-model — the draft, the asynchronous state, and every intent. |
| `CardEditor.svelte` | The form: landing area, pickers, toolbar, fields, tags, source, warnings, actions. |
| `LandingArea.svelte` | The captured text, and the buttons that send runs of it into fields (10a). |
| `Picker.svelte` | A name chosen out of a list, with a filter over it (M10). |
| `FieldEditor.svelte` | One field: the rich input, its HTML source view, and its pin (M10). |
| `FormatToolbar.svelte` | Anki's formatting buttons, and the cloze controls with them (M10). |
| `ClozeControls.svelte` | The deletion list, and the two things done to it. |
| `TagEditor.svelte` | Tags in, intents out, with completion from the collection. |
| `selection.dom.ts` | A `contenteditable`'s selection as text offsets, and back (M10). |
| `shortcuts.ts` | Which keystroke means which command (M10). |
| `types.ts` | `FieldApi` — what a field lets the toolbar do to it. |
| `error-copy.ts` | Every sentence the editor says about a failure. |
| `connect.ts` | The two reads the panel makes over the message channel (M5). |
| `session.ts` | The moves on the draft slots (M7), and every write to what is remembered. |

**One view-model between the components and the ports** (6.2). Loading and
error state lives there instead of being scattered across components, which
hold nothing of their own beyond the text in a tag box and which ordinal a
dropdown is on. `editor-model.svelte.ts` is a Svelte rune module: the
`.svelte.ts` suffix is what gets it compiled, which is what makes `$state`
work outside a component. The draft it holds is `$state.raw`, since a draft is
an immutable value replaced whole on every transition (3.3).

**Components emit intents; every transition goes through the card model's pure
functions** (6.1). No component computes a new draft, writes cloze markup, or
decides what a note-type change does to the fields. Those rules are M3's, and
a second copy of one in a dropdown handler is how the UI and the model start
disagreeing.

**Every asynchronous read is idle, loading, ready, or failed** (6.3). A
silently empty deck list is indistinguishable from Anki being closed.

**Failures render as a cause and a next action** (6.4), from M4's taxonomy,
in one module — which M9's onboarding reuses. Every cause has an entry, and
each table is keyed by its own union, so a cause added below without copy here
is a type error rather than a default "something went wrong". The same holds
for M3's `DraftIssue` and `ClozeIssue`, which are what a field error and a
refused mark actually say.

**Native controls with real labels** (6.5): `select`, `textarea`, `input`,
`button`, `details`. A custom listbox would be an accessibility liability
bought for nothing — which is also why the deck and note-type pickers (M10)
are a `<select>` with a filter box beside it rather than a combobox of our
own: a real collection has dozens of each, and the browser already has the
keyboard behaviour correct.

**Fields are `contenteditable`, not `<textarea>`** (10.2, superseding 6.6 per
P10). Anki stores field content as HTML and its own editor is rich, so a
plain textarea cannot offer bold, italic, or sub- and superscript. Each field
also carries an **HTML source toggle** (10.4) — where cloze braces are easiest
to fix, and the escape hatch when the rich editor does the wrong thing — and a
**pin** (10.6).

**No browser editing command is trusted.** Every formatting action is a pure
function of the field's HTML and a text range, in `field-html.ts`; the
component renders what comes back. That is what makes "bold applied to this
selection produces this markup" a test at the value level rather than a test
of `document.execCommand`, and it is why the same code produces the same field
in a jsdom test and in Firefox. The paste handler is owned for the same
reason: the clipboard is the one route by which a page's markup arrives whole,
so it is sanitised and spliced in at the selection rather than inserted by the
browser (10.5).

**The selection is measured, not translated** (M10's named risk). `cloze.ts`
takes text offsets and a `contenteditable` hands back a DOM `Range`;
`selection.dom.ts` walks the field counting exactly what `fieldText` counts —
a text node's characters, a `<br>` as one newline — so the two are the same
coordinate space. It has tests of its own, independent of any component,
because the mapping is where the off-by-one bugs live and finding them through
a rendered editor would be finding them twice.

**The toolbar acts on the last selection a field reported.** Pressing a button
moves the focus off the field first, so asking the field at that point would
be asking too late; each `FieldEditor` announces its selection as the caret
moves, and `CardEditor` holds the last answer. After an action rewrites the
field the selection is put back, so bold-then-italic over one phrase is two
presses rather than two selections.

**The keyboard is Anki's** (10.7), in one table in `shortcuts.ts` rather than
a pile of conditions in a handler. `Ctrl+B`, `Ctrl+I`, `Ctrl+U`, `Ctrl+=`,
`Ctrl+Shift+=`, `Ctrl+Shift+C`, `Ctrl+Alt+Shift+C`, `Ctrl+Shift+X`, and
`Ctrl+Enter` are claimed with `preventDefault` — including the ones the
browser would spend on the bookmarks sidebar and view-source, because an
editor without bold or underline is not one. **`Ctrl+R` is deliberately not
claimed**: Anki clears formatting with it and the browser reloads with it, and
10.7 matches Anki only where there is no collision, so that one is a toolbar
button and nothing else.

**The cloze controls appear for cloze note types only** (6.7), read from
`NoteType.kind` — the adapter's descriptor (4.6) — never by matching the note
type's name in the UI.

**The duplicate warning does not block** (4.4), and it is shown **on the first
field** the way Anki shows it rather than as a banner (10.8). It appears when
`canAddNote` reports that Anki already holds that field, and it stops
appearing the moment the field changes: a warning about text the user has
already replaced is worse than no warning.

**The landing area sends into the caret, or replaces** (10a.2). A checkbox
picks which, and it is off by default: inserting at the caret the user last
left in that field loses nothing, and replacing is the destructive one and so
is the one asked for. The caret is cached **per field**, because by the time
the button is pressed the focus is in the landing area and the field's own
selection is gone; a field never focused takes the text on its end. Nothing
selected in the landing area sends all of it — wanting the lot is the common
case, and refusing would be an error message for something a button can do.

**Tag completion comes from the collection** (10.9), through a `<datalist>` —
which completes, filters as the user types, is reachable from the keyboard,
and does not refuse a value that is not in it. A tag Anki has never seen is
exactly what the first card on a new subject needs.

**The note type is reconciled against Anki on open** (M7's risk). A user may
rename or reorder a note type's fields in Anki while a draft sits in the
sidebar, and field names are the draft's keys (3.1) — submitting one Anki no
longer has would be refused three layers from anywhere it could be explained.
`refreshNoteType` applies 3.2's rule to a note type that kept its name, and
returns the draft itself when the two readings agree, so an ordinary open is
not an edit. It also takes Anki's flavour over the capture's guess, which is
how a Basic capture learns it is on a cloze note type at all.

**Converting to cloze is a button, not a dropdown change** (3.12). Basic and
Cloze share no field name, so the plain switch would stash the selection
rather than carry it into the field the deletions have to be in. The target
is the first cloze note type Anki reported — its own reading of the flavour
(4.6), never a name matched in the UI — and the button is absent when there
is none, or when the card is already cloze.

**The sidebar entrypoint composes the adapter and every store.**
`App.svelte` builds `createSettingsAnkiClient` over the runtime origin (P8),
the host-permission check, and the settings (M8); `createStoredDrafts` over
`StoragePort` for the draft and for the capture waiting behind it; and
`createStoredRemembered` for the deck a card goes into. All of them are
required props on `Panel` — a missing one is a `svelte-check` error, so the
editor cannot be left unmounted or left unable to save. Until the user grants
the loopback host permission, every AnkiConnect call answers
`permission-missing` before touching the network, and the editor says so and
offers to retry; the fields, tags, and cloze controls work regardless, and
every edit is still stored.

**The deck a card went into is noted on the add** (8.5), by the panel, through
`rememberDeck`. On the add rather than on the dropdown change: a deck someone
scrolled past is not evidence of anything. A failed write there costs the next
capture its starting deck and nothing else, so it does not join the errors the
user is asked to act on.

**A pinned field's content is noted on the add too** (10.6), by the
view-model, for the same reason: a field a card actually went to Anki with is
evidence, and one that was halfway typed is not. It is carried into the next
card in `load()`, after the note type has been reconciled — the pins are keyed
by note type, and the note type is only settled once Anki has spoken.

**The panel is keyed on the capture, not on the draft.** It re-reads on every
storage change, and the editor's own saves are among them; remounting on those
would throw away the caret and anything typed since. `createdAt` is the
capture's identity — one gesture, one timestamp.

## Permissions

The MVP ceiling, from the plan index. Anything beyond it needs a written
justification in the subplan that adds it.

| Permission | Why |
|------------|-----|
| `activeTab` | Reach the page the user invoked the extension on. |
| `scripting` | Inject the content script there, on that gesture. |
| `contextMenus` | The **Create Anki Card** entry (M5). |
| `storage` | Settings, what is remembered, and the draft, since the background is unloaded when idle. |
| `sidePanel` | Chrome's sidebar. Firefox needs no permission for its own. |
| `http://127.0.0.1:8765/*` | The local AnkiConnect, at the add-on's own default port. The only host contacted. |

One **optional** host permission set, added at M8 and granted at install on
neither browser:

| Optional permission | Why |
|---------------------|-----|
| `http://127.0.0.1/*`, `http://localhost/*` | AnkiConnect's `webBindAddress` and `webBindPort` are the user's, so the endpoint is a setting (M8) — and a port the manifest does not name is one the browser will not let the extension reach. Asked for from the options page's Save press, for the one port that was configured. Loopback only: `readSettings` refuses any other host, so the setting and the permission cannot disagree. |

**Never `<all_urls>`.** `activeTab` plus `scripting` on a user gesture covers
the extraction this extension needs.

The content script is therefore registered at runtime with no match patterns.
A manifest-declared content script needs match patterns, and those become
install-time host permissions the ceiling does not allow. M5 injects it by
file path on the gesture, and a test pins that path against the built output.

`commands` — the keyboard shortcut, `Alt+Shift+A` — is a manifest key rather
than a permission, so it widens nothing. So is `options_ui`, M8's settings
page: `runtime.openOptionsPage()` needs no permission, and
`tests/manifest/generated-manifest.test.ts` pins both the page and the fact
that adding it left the permission set alone.

`src/manifest/manifest.ts` holds the declared set and is pinned by
`manifest.test.ts`; WXT adds Chrome's `sidePanel` permission itself, from the
sidepanel entrypoint, and `tests/manifest/generated-manifest.test.ts` holds
the emitted manifest for both targets to the table above. Widening
permissions breaks a test rather than slipping through a diff.

**On Firefox MV3 a declared host permission is not granted at install**
(2.7). The extension checks `PermissionsPort.has()` at runtime and requests
it from a user gesture. Chrome grants it at install, so the check is a no-op
there — which is the point: one code path, correct on both.

## Privacy

Selected page text and page context are potentially sensitive. Through M11
they travel only to loopback. Nothing that carries page content is logged in
production builds. AnkiConnect's optional `apiKey` is carried on every action
and appears in no log and no diagnostic: the adapter's
`describeAnkiConnection()` reports whether one is configured, never its
value (8.5a). It is stored in `storage.local` alongside the other settings,
shown as a password field, and never echoed back by any error copy — a test
pins each of those.

The endpoint is a setting from M8, and it is bounded twice over: the schema
refuses any host but `127.0.0.1` and `localhost`, and the manifest offers host
permissions for nothing else — so neither a mistyped setting nor a written one
can make this extension talk to anything off the machine.
