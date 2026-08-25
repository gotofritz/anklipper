<script lang="ts">
  /**
   * The landing area (10a.1): the text the capture put on the page, kept in
   * one place that no note-type change can move.
   *
   * The problem it solves is 3.2's, seen from the outside. A note type owns
   * its field names, so switching from Basic to Cloze — which share none —
   * remaps nothing, stashes everything, and renders a set of empty fields. The
   * text is recoverable, and it looks exactly like data loss. So the selection
   * lives here as well, as plain text, and the fields are filled *from* it.
   *
   * A plain `<textarea>` on purpose. This is not a note field: it holds what
   * the extractor read, which is plain (5.2, 10.3), and it is the surface
   * M12's generation will read from. Formatting belongs on the far side of a
   * send.
   */
  const {
    text,
    fields,
    onInput,
    onSend,
  }: {
    text: string;
    /** The note type's field names, in its own order (10.1). */
    fields: readonly string[];
    onInput: (text: string) => void;
    /** The selected run, the field it is going to, and whether to replace. */
    onSend: (field: string, text: string, replace: boolean) => void;
  } = $props();

  let box = $state<HTMLTextAreaElement | undefined>(undefined);
  /**
   * Off by default: the selection lands where the caret was left in the target
   * field, which loses nothing. On, it overwrites the field outright — the
   * cleaner result, and the one that needs to be asked for.
   */
  let replace = $state(false);

  function send(field: string) {
    const node = box;
    if (node === undefined) return;

    // Nothing selected means the whole box. Wanting all of it is the common
    // case, and refusing would be an error message for something a button can
    // simply do.
    const selected =
      node.selectionStart === node.selectionEnd
        ? node.value
        : node.value.slice(node.selectionStart, node.selectionEnd);

    onSend(field, selected, replace);
  }
</script>

<fieldset>
  <legend>Selected text</legend>

  <label class="sr-only" for="landing">Selected text</label>
  <textarea
    id="landing"
    rows="4"
    value={text}
    oninput={(event) => onInput(event.currentTarget.value)}
    bind:this={box}></textarea>

  <p class="quiet">
    Select part of this, then send it to a field. Sending with nothing selected
    sends all of it. This box does not change when you change note type.
  </p>

  <div class="row">
    {#each fields as field (field)}
      <button type="button" onclick={() => send(field)}>
        Send to {field}
      </button>
    {/each}
  </div>

  <div class="row">
    <input id="landing-replace" type="checkbox" bind:checked={replace} />
    <label for="landing-replace">
      Replace the field instead of inserting at the cursor
    </label>
  </div>
</fieldset>

<style>
  fieldset {
    border: 1px solid var(--line, #ccc);
    margin: 0;
    min-width: 0;
    padding: 0.5rem;
  }

  .quiet {
    font-size: 0.9em;
    margin: 0.25rem 0 0;
  }

  /*
   * The legend names the group for anything that reads the page, and the
   * label is what ties the box itself to a name. Both say the same thing, so
   * only one of them needs to be seen.
   */
  .sr-only {
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }

  textarea {
    font: inherit;
    min-width: 0;
    resize: vertical;
    width: 100%;
  }

  .row {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.4rem;
  }

  .row input {
    flex: none;
  }

  .row label {
    flex: 1 1 8rem;
    min-width: 0;
  }
</style>
