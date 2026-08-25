<script lang="ts">
  // Tags in, intents out (6.1). The component never decides whether a tag is
  // one Anki can store — `addTag` in the card model does, and the view-model
  // renders its refusal.
  const {
    tags,
    onAdd,
    onRemove,
    known = [],
  }: {
    tags: readonly string[];
    onAdd: (tag: string) => void;
    onRemove: (tag: string) => void;
    /** Every tag the collection already holds, for completion (10.9). */
    known?: readonly string[];
  } = $props();

  let entry = $state("");

  /**
   * A `<datalist>` and not a list of our own: it completes, it filters as the
   * user types, it is reachable from the keyboard, and — the part that matters
   * — it does not refuse a value that is not in it. A tag Anki has never seen
   * is exactly what the first card on a new subject needs.
   *
   * Tags already on this card are left out; offering one that is a no-op is
   * offering nothing.
   */
  const suggestions = $derived(known.filter((tag) => !tags.includes(tag)));

  function add() {
    const tag = entry.trim();
    if (tag === "") return;
    onAdd(tag);
    entry = "";
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    // The editor is a form: Enter in this box means "add this tag", not
    // "add the card".
    event.preventDefault();
    add();
  }
</script>

<fieldset>
  <legend>Tags</legend>

  {#if tags.length === 0}
    <p class="quiet">No tags yet.</p>
  {:else}
    <ul aria-label="Tags">
      {#each tags as tag (tag)}
        <li>
          <span>{tag}</span>
          <button type="button" onclick={() => onRemove(tag)}>
            Remove {tag}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="row">
    <label for="new-tag">Add a tag</label>
    <input
      id="new-tag"
      type="text"
      autocomplete="off"
      list="known-tags"
      bind:value={entry}
      {onkeydown}
    />
    <datalist id="known-tags">
      {#each suggestions as tag (tag)}
        <option value={tag}>{tag}</option>
      {/each}
    </datalist>
    <button type="button" onclick={add}>Add tag</button>
  </div>
</fieldset>

<style>
  fieldset {
    border: 1px solid var(--line, #ccc);
    margin: 0;
    min-width: 0;
    padding: 0.5rem;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
  }

  li {
    align-items: center;
    border: 1px solid var(--line, #ccc);
    border-radius: 0.75rem;
    display: flex;
    gap: 0.25rem;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: 0.1rem 0.4rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .row label {
    flex-basis: 100%;
  }

  .row input {
    flex: 1 1 6rem;
    min-width: 0;
  }

  .quiet {
    margin: 0 0 0.5rem;
  }
</style>
