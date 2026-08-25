<script lang="ts">
  import { tick, untrack } from "svelte";

  import type { CardDraft, DraftIssue } from "@/core/draft";
  import { primaryFieldOf } from "@/core/note-type";
  import type { AnkiClient, DraftStore, NoteId } from "@/core/ports/types";

  import ClozeControls from "./ClozeControls.svelte";
  import TagEditor from "./TagEditor.svelte";
  import { createEditorModel } from "./editor-model.svelte";
  import {
    ankiErrorCopy,
    draftIssueCopy,
    draftStoreErrorCopy,
  } from "./error-copy";

  /**
   * The sidebar editor (M6).
   *
   * It is handed the `AnkiClient` **port** — in tests M3's in-memory fake, in
   * M7 the AnkiConnect adapter — and never reaches a `browser.*` API or the
   * protocol itself. Every transition of the draft goes through the view-model
   * to the card model's pure functions (6.1); the only thing this component
   * computes for itself is where to leave the caret.
   *
   * The model is built once, from the draft this component was mounted with.
   * A new capture is a new draft, and the panel keys the editor on it, so the
   * editor is remounted rather than mutated underneath the user.
   */
  const {
    anki,
    draft,
    drafts,
    onAdded,
    onCancel,
  }: {
    anki: AnkiClient;
    draft: CardDraft;
    /** Where every edit goes, from the moment it is made (7.1). */
    drafts: DraftStore;
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
      ...(onAdded === undefined ? {} : { onAdded }),
    }),
  );

  /** The cloze field's textarea, for its selection and its caret (6.6). */
  let clozeInput: HTMLTextAreaElement | undefined;

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

  const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fieldId = (name: string) => `field-${slug(name)}`;
  const issueId = (name: string, index: number) =>
    `${fieldId(name)}-issue-${index}`;

  const issuesFor = (name: string): readonly DraftIssue[] =>
    model.issues.filter((issue) => issue.field === name);

  const describedBy = (name: string): string | undefined => {
    const ids = issuesFor(name).map((_, index) => issueId(name, index));
    return ids.length === 0 ? undefined : ids.join(" ");
  };

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

  const duplicateCopy = ankiErrorCopy({
    kind: "duplicate-note",
    message: "canAddNotes said no",
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

  /** The duplicate check is about the first field, so only that one re-runs it. */
  function onFieldChange(name: string) {
    if (name !== primaryFieldOf(model.draft.noteType)) return;
    void model.checkDuplicate();
  }

  /**
   * Marking moves everything after the selection, so the caret has to be put
   * back deliberately — otherwise the value update drops it at the end of the
   * field and a second mark becomes guesswork.
   */
  async function markSelection(ordinal?: number) {
    const field = clozeInput;
    if (field === undefined) return;

    const caret = model.markCloze(
      field.selectionStart,
      field.selectionEnd,
      ordinal,
    );
    if (caret === undefined) return;

    await tick();
    field.focus();
    field.setSelectionRange(caret, caret);
  }

  /** Anki's own shortcut for the same thing, so the mouse is never required. */
  function onFieldKeydown(name: string, event: KeyboardEvent) {
    if (name !== model.clozeField) return;
    if (event.key.toLowerCase() !== "c") return;
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;

    event.preventDefault();
    void markSelection();
  }

  function submit(event: Event) {
    event.preventDefault();
    void model.submit();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void model.submit();
    }
  }
</script>

<!--
  The keydown listener is the panel's two shortcuts — Escape to cancel,
  Ctrl+Enter to add — and every control it wraps is interactive in its own
  right, which is what the rule is protecting.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="editor" onsubmit={submit} onkeydown={onKeydown}>
  <div class="field">
    <label for="deck">Deck</label>
    <select
      id="deck"
      bind:value={() => model.draft.deck, (value) => model.setDeck(value)}
    >
      {#each model.deckOptions as name (name)}
        <option value={name}>{name}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="note-type">Note type</label>
    <select
      id="note-type"
      bind:value={
        () => model.draft.noteType.name, (value) => model.setNoteType(value)
      }
    >
      {#each model.noteTypeOptions as name (name)}
        <option value={name}>{name}</option>
      {/each}
    </select>
  </div>

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

  {#each model.draft.noteType.fields as name (name)}
    <div class="field">
      <label for={fieldId(name)}>{name}</label>
      <textarea
        id={fieldId(name)}
        rows="3"
        aria-invalid={issuesFor(name).length > 0}
        aria-describedby={describedBy(name)}
        onchange={() => onFieldChange(name)}
        onkeydown={(event) => onFieldKeydown(name, event)}
        {@attach (node) => {
          if (name !== model.clozeField) return;
          clozeInput = node;
          return () => {
            if (clozeInput === node) clozeInput = undefined;
          };
        }}
        bind:value={
          () => model.draft.fields[name] ?? "",
          (value) => model.setField(name, value)
        }></textarea>
      {#each issuesFor(name) as issue, index (index)}
        <p class="problem" id={issueId(name, index)}>{draftIssueCopy(issue)}</p>
      {/each}
    </div>
  {/each}

  {#if model.clozeTarget !== undefined}
    <!--
      3.12's conversion, which the note-type dropdown alone cannot do: Basic
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
      Select the text to hide in {model.clozeField}, then press Ctrl+Shift+C or
      use the button below.
    </p>
    <ClozeControls
      deletions={model.deletions}
      nextOrdinal={model.nextOrdinal}
      onMark={markSelection}
      onRemove={(ordinal) => model.removeCloze(ordinal)}
    />
  {/if}

  <TagEditor
    tags={model.draft.tags}
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

  {#if model.duplicate.kind === "ready" && model.duplicate.value}
    <p class="warning" role="status">
      {duplicateCopy.cause}
      {duplicateCopy.action}
    </p>
  {/if}
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
    <button type="button" onclick={() => onCancel?.()}>Cancel</button>
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

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  select,
  textarea {
    min-width: 0;
    width: 100%;
  }

  textarea {
    font: inherit;
    resize: vertical;
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

  .warning {
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
