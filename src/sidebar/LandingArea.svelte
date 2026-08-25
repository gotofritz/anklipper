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
    emptyFields = [],
    onInput,
    onSend,
  }: {
    text: string;
    /** The note type's field names, in its own order (10.1). */
    fields: readonly string[];
    /**
     * Which of them have nothing in them. Adding to an empty field and
     * replacing it are the same act, so only one of the two is offered.
     */
    emptyFields?: readonly string[];
    onInput: (text: string) => void;
    /**
     * The selected run, the field it is going to, and which of the two things
     * to do with it. `replace` overwrites the field; otherwise it goes on the
     * end.
     */
    onSend: (field: string, text: string, replace: boolean) => void;
  } = $props();

  let box = $state<HTMLTextAreaElement | undefined>(undefined);
  /**
   * Which field the next send goes to. Held as the user's choice, but read
   * through `target`, which falls back to the note type's first field: a note
   * type change replaces the field set entirely, and a chosen name that is no
   * longer one of them would send nowhere.
   */
  let chosen = $state<string | undefined>(undefined);

  const target = $derived(
    chosen !== undefined && fields.includes(chosen) ? chosen : fields[0],
  );

  const targetEmpty = $derived(
    target === undefined || emptyFields.includes(target),
  );

  /**
   * Two buttons rather than one and a modifier: adding to a field and
   * replacing it are different enough that reading a checkbox to know which
   * is about to happen is a worse trade than a second button. Each says what
   * it does, and neither has a state to be wrong about.
   */
  function send(replace: boolean) {
    const node = box;
    const field = target;
    if (node === undefined || field === undefined) return;

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
    Select part of this, then add it to a field at the cursor, or replace that
    field with it. Sending with nothing selected sends all of it. This box does
    not change when you change note type.
  </p>

  <div class="row">
    <label for="landing-target">Send to</label>
    <select
      id="landing-target"
      bind:value={() => target ?? "", (name) => (chosen = name)}
    >
      {#each fields as field (field)}
        <option value={field}>{field}</option>
      {/each}
    </select>
    <!--
      Disabled while the field is empty: adding to an empty field and
      replacing it produce the same field, so offering both would be offering
      a choice that is not one.
    -->
    <button
      type="button"
      title={targetEmpty
        ? `${target ?? "The field"} is empty — replace it instead`
        : `Put it where the cursor was left in ${target}`}
      onclick={() => send(false)}
      disabled={targetEmpty}
    >
      Add to field
    </button>
    <button
      type="button"
      title="Overwrite {target ?? 'the field'} with it"
      onclick={() => send(true)}
      disabled={target === undefined}
    >
      Replace field
    </button>
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

  .row select {
    flex: 1 1 6rem;
    min-width: 0;
  }
</style>
