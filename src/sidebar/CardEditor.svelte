<script lang="ts">
  import { tick, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import type { CardDraft, DraftIssue } from "@/core/draft";
  import type { InlineMark } from "@/core/field-html";
  import { INLINE_MARKS } from "@/core/field-html";
  import type {
    AnkiClient,
    DraftStore,
    NoteId,
    RememberedStore,
  } from "@/core/ports/types";

  import FieldEditor from "./FieldEditor.svelte";
  import FormatToolbar from "./FormatToolbar.svelte";
  import Picker from "./Picker.svelte";
  import TagEditor from "./TagEditor.svelte";
  import { createEditorModel } from "./editor-model.svelte";
  import {
    ankiErrorCopy,
    draftIssueCopy,
    draftStoreErrorCopy,
  } from "./error-copy";
  import type { TextRange } from "./selection.dom";
  import { SHORTCUT_HINTS, commandFor } from "./shortcuts";
  import type { EditorCommand } from "./shortcuts";
  import type { FieldApi } from "./types";

  /**
   * The sidebar editor (M6, rebuilt to Anki's own shape in M10).
   *
   * It is handed the `AnkiClient` **port** — in tests M3's in-memory fake, in
   * M7 the AnkiConnect adapter — and never reaches a `browser.*` API or the
   * protocol itself. Every transition of the draft goes through the view-model
   * to the card model's pure functions (6.1).
   *
   * What this component computes for itself is the caret, and only the caret.
   * The fields are `contenteditable` now (10.2), so "where the selection is"
   * is a DOM question with a text answer — `selection.dom.ts` maps between the
   * two, and this holds the last answer each field gave, because a toolbar
   * button takes the focus before its handler runs.
   *
   * The model is built once, from the draft this component was mounted with.
   * A new capture is a new draft, and the panel keys the editor on it, so the
   * editor is remounted rather than mutated underneath the user.
   */
  const {
    anki,
    draft,
    drafts,
    remembered,
    onAdded,
    onCancel,
  }: {
    anki: AnkiClient;
    draft: CardDraft;
    /** Where every edit goes, from the moment it is made (7.1). */
    drafts: DraftStore;
    /** Where the sticky pins live, alongside the last deck (8.5, 10.6). */
    remembered: RememberedStore;
    /** The card is in Anki (7.3); what happens to the slot is the panel's. */
    onAdded?: (noteId: NoteId) => void | Promise<void>;
    onCancel?: () => void;
  } = $props();

  // Deliberately the values this component was mounted with: the model owns
  // the draft from here on, and a new capture arrives as a remount (see above).
  const model = untrack(() =>
    createEditorModel({
      anki,
      draft,
      drafts,
      remembered,
      ...(onAdded === undefined ? {} : { onAdded }),
    }),
  );

  /**
   * Every field's handle on its own caret, by field name. Nothing rendered
   * reads it — it is looked up in handlers only — but the lint rule that
   * catches a plain `Map` being read reactively does not know that, and a
   * `SvelteMap` costs nothing.
   */
  const fields = new SvelteMap<string, FieldApi>();
  /**
   * The last selection any field reported, and which field reported it.
   * Pressing a toolbar button moves the focus off the field first, so asking
   * the field at that point would be asking too late.
   */
  let at = $state.raw<{ field: string; range: TextRange } | undefined>(
    undefined,
  );

  $effect(() => {
    void model.load();
  });

  /**
   * The other half of M7's persistence risk: a debounce that has not fired
   * when the sidebar goes away would lose the last thing typed. Firefox
   * unloads the sidebar document when the panel is closed, and `pagehide` is
   * the last event either browser delivers.
   */
  $effect(() => {
    const flush = () => void model.flush();
    window.addEventListener("pagehide", flush);

    return () => {
      window.removeEventListener("pagehide", flush);
      void model.flush();
      model.stop();
    };
  });

  const issuesFor = (name: string): readonly DraftIssue[] =>
    model.issues.filter((issue) => issue.field === name);

  const generalIssues = $derived(
    model.issues.filter((issue) => issue.field === undefined),
  );

  /** One block for both lists: they are loaded together and fail together. */
  const listFailure = $derived.by(() => {
    const failed =
      model.decks.kind === "failed"
        ? model.decks.error
        : model.noteTypes.kind === "failed"
          ? model.noteTypes.error
          : undefined;
    if (failed === undefined) return undefined;

    const which =
      model.decks.kind === "failed" && model.noteTypes.kind === "failed"
        ? "The deck and note type lists"
        : model.decks.kind === "failed"
          ? "The deck list"
          : "The note type list";

    return { which, ...ankiErrorCopy(failed) };
  });

  const submitFailure = $derived(
    model.submission.kind === "failed"
      ? ankiErrorCopy(model.submission.error)
      : undefined,
  );

  // 7.1's failure. Everything still looks edited and none of it is anywhere,
  // which is the one failure the user cannot see coming.
  const saveFailure = $derived(
    model.saveError === undefined
      ? undefined
      : draftStoreErrorCopy(model.saveError),
  );

  /** Which marks the current selection carries, for the toolbar's buttons. */
  const marks = $derived.by(() => {
    const state = {} as Record<InlineMark, boolean>;
    for (const mark of INLINE_MARKS) {
      state[mark] =
        at !== undefined &&
        model.isMarked(at.field, at.range.start, at.range.end, mark);
    }

    return state;
  });

  function register(name: string, api: FieldApi | undefined) {
    if (api === undefined) {
      fields.delete(name);
      if (at?.field === name) at = undefined;
    } else {
      fields.set(name, api);
    }
  }

  function onSelect(field: string, range: TextRange | undefined) {
    if (range === undefined) return;
    at = { field, range };
  }

  /**
   * A formatting action rewrites the field's markup, which throws the DOM
   * selection away. Putting it back is what makes bold-then-italic over one
   * phrase two presses rather than two selections.
   */
  async function reselect(field: string, range: TextRange) {
    await tick();
    const api = fields.get(field);
    api?.focus();
    api?.select(range.start, range.end);
  }

  function applyMark(mark: InlineMark) {
    if (at === undefined) return;
    const { field, range } = at;

    model.format(field, range.start, range.end, mark);
    void reselect(field, range);
  }

  function clearFormatting() {
    if (at === undefined) return;
    const { field, range } = at;

    model.clearFormat(field, range.start, range.end);
    void reselect(field, range);
  }

  /**
   * Marking moves everything after the selection, so the caret has to be put
   * back deliberately — otherwise the value update drops it at the end of the
   * field and a second mark becomes guesswork.
   */
  async function markSelection(ordinal?: number) {
    const field = model.clozeField;
    if (field === undefined) return;

    const range = at?.field === field ? at.range : { start: 0, end: 0 };
    const caret = model.markCloze(range.start, range.end, ordinal);
    if (caret === undefined) return;

    at = undefined;
    await tick();
    const api = fields.get(field);
    api?.focus();
    api?.placeCaret(caret);
  }

  /** Anki's "same deletion again": the ordinal already in progress (3.9). */
  function markAsCurrent() {
    const highest = model.deletions.reduce(
      (top, one) => Math.max(top, one.ordinal),
      0,
    );
    void markSelection(highest === 0 ? undefined : highest);
  }

  const MARK_FOR: Partial<Record<EditorCommand, InlineMark>> = {
    bold: "b",
    italic: "i",
    underline: "u",
    subscript: "sub",
    superscript: "sup",
  };

  function run(command: EditorCommand) {
    const mark = MARK_FOR[command];
    if (mark !== undefined) {
      applyMark(mark);
      return;
    }

    if (command === "clear") clearFormatting();
    else if (command === "cloze") void markSelection();
    else if (command === "cloze-group") markAsCurrent();
    else if (command === "source") fields.get(at?.field ?? "")?.toggleSource();
    else if (command === "submit") void model.submit();
  }

  function submit(event: Event) {
    event.preventDefault();
    void model.submit();
  }

  /**
   * 10.7's chords, claimed from the browser where they collide: Ctrl+B is the
   * bookmarks sidebar and Ctrl+U is view-source, and an editor that let either
   * through would be an editor without bold or underline. Ctrl+R is the one
   * this deliberately leaves alone — see `shortcuts.ts`.
   */
  function onKeydown(event: KeyboardEvent) {
    const command = commandFor(event);
    if (command === undefined) return;

    event.preventDefault();
    run(command);
  }

  /**
   * Throwing the card away is deliberate and has no undo, so it is a named
   * button and nothing else. M6 bound Escape to it as well, when the panel
   * left it unwired and it did nothing; now that it empties the slot, a stray
   * keypress is not how to ask for it.
   */
  function discard() {
    // The outstanding edit goes with the card. The flush on unmount would
    // otherwise race the slot being emptied.
    model.stop();
    onCancel?.();
  }
</script>

<!--
  The keydown listener is the editor's shortcut table, and every control it
  wraps is interactive in its own right, which is what the rule is protecting.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="editor" onsubmit={submit} onkeydown={onKeydown}>
  <Picker
    id="deck"
    label="Deck"
    plural="decks"
    value={model.draft.deck}
    options={model.deckOptions}
    onChange={(name) => model.setDeck(name)}
  />

  <Picker
    id="note-type"
    label="Note type"
    plural="note types"
    value={model.draft.noteType.name}
    options={model.noteTypeOptions}
    onChange={(name) => model.setNoteType(name)}
  />

  {#if model.decks.kind === "loading"}
    <p class="quiet">Loading decks from Anki…</p>
  {/if}
  {#if model.noteTypes.kind === "loading"}
    <p class="quiet">Loading note types from Anki…</p>
  {/if}
  {#if listFailure !== undefined}
    <div class="problem">
      <p>{listFailure.which} could not be read. {listFailure.cause}</p>
      <p>{listFailure.action}</p>
      <button type="button" onclick={() => void model.load()}>Try again</button>
    </div>
  {/if}

  <FormatToolbar
    {marks}
    onCommand={run}
    onMark={(ordinal) => void markSelection(ordinal)}
    onRemove={(ordinal) => model.removeCloze(ordinal)}
    isCloze={model.isCloze}
    deletions={model.deletions}
    nextOrdinal={model.nextOrdinal}
  />

  <!--
    10.1: the note type's own order, as the collection defines it. Nothing
    between `modelFieldNames` and here sorts or re-keys the list, which is the
    whole of what that decision costs.
  -->
  {#each model.draft.noteType.fields as name (name)}
    <FieldEditor
      {name}
      {register}
      {onSelect}
      value={model.draft.fields[name] ?? ""}
      issues={issuesFor(name)}
      sticky={model.isSticky(name)}
      duplicate={model.duplicateField === name}
      onInput={(html) => model.setField(name, html)}
      onToggleSticky={(field) => void model.toggleSticky(field)}
    />
  {/each}

  {#if model.clozeTarget !== undefined}
    <!--
      3.12's conversion, which the note-type picker alone cannot do: Basic
      and Cloze share no field name, so switching would stash the selection
      instead of carrying it into the field the deletions have to be in.
    -->
    <div>
      <button type="button" onclick={() => model.convertToCloze()}>
        Convert to cloze
      </button>
    </div>
  {/if}

  {#if model.isCloze}
    <p class="quiet">
      Select the text to hide in {model.clozeField}, then press
      {SHORTCUT_HINTS.cloze ?? "the cloze shortcut"} or use the toolbar above.
    </p>
  {/if}

  <TagEditor
    tags={model.draft.tags}
    known={model.knownTags.kind === "ready" ? model.knownTags.value : []}
    onAdd={(tag) => model.addTag(tag)}
    onRemove={(tag) => model.removeTag(tag)}
  />

  <details class="source">
    <summary>Where this came from</summary>
    <p><cite>{model.draft.source.title}</cite></p>
    {#if model.draft.source.heading}
      <p class="quiet">{model.draft.source.heading}</p>
    {/if}
    <p><a href={model.draft.source.url}>{model.draft.source.url}</a></p>
    <blockquote>{model.draft.source.context}</blockquote>
  </details>

  {#if (model.draft.generation.warnings ?? []).length > 0}
    <ul class="problem" aria-label="What could not be captured">
      {#each model.draft.generation.warnings ?? [] as warning (warning.kind)}
        <li>{warning.message}</li>
      {/each}
    </ul>
  {/if}

  {#each generalIssues as issue, index (index)}
    <p class="problem">{draftIssueCopy(issue)}</p>
  {/each}

  {#if model.duplicate.kind === "failed"}
    <p class="quiet">Could not check whether Anki already has this card.</p>
  {/if}

  {#if model.notice !== undefined}
    <p class="problem" role="alert">{model.notice}</p>
  {/if}

  {#if model.submission.kind === "submitting"}
    <p class="quiet" role="status">Adding the card…</p>
  {:else if model.submission.kind === "added"}
    <p role="status">Added to Anki.</p>
  {:else if model.submission.kind === "refused"}
    <p class="problem" role="alert">
      This card is not ready yet — fix what is marked above.
    </p>
  {:else if submitFailure !== undefined}
    <!--
      7.2: the draft is intact and nothing has to be re-entered, so the retry
      is one press. 7.5 keeps it manual — an automatic queue needs ordering
      and conflict rules this milestone deliberately does not design.
    -->
    <div class="problem" role="alert">
      <p>{submitFailure.cause}</p>
      <p>{submitFailure.action}</p>
      <button type="button" onclick={() => void model.submit()}>
        Try again
      </button>
    </div>
  {/if}

  {#if saveFailure !== undefined}
    <p class="problem" role="alert">
      This card could not be saved, so closing the sidebar would lose it.
      {saveFailure}
    </p>
  {/if}

  <div class="actions">
    <button
      type="submit"
      disabled={model.submission.kind === "submitting" ||
        model.submission.kind === "added"}
    >
      Add card
    </button>
    <button type="button" onclick={discard}>Discard card</button>
  </div>
</form>

<style>
  /*
   * One column, no fixed widths, everything allowed to wrap: a Firefox
   * sidebar is about a third of the window and the user can drag it
   * narrower still, so nothing here may depend on having room.
   */
  .editor {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .editor :global(*) {
    box-sizing: border-box;
    max-width: 100%;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .problem {
    color: var(--problem, #a4000f);
    margin: 0;
  }

  .quiet {
    margin: 0;
  }

  blockquote {
    border-left: 2px solid var(--line, #ccc);
    margin: 0.4rem 0 0;
    padding-left: 0.5rem;
  }

  ul {
    margin: 0;
    padding-left: 1.1rem;
  }

  p {
    margin: 0;
  }
</style>
