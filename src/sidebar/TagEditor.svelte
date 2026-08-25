<script lang="ts">
  // Tags in, intents out (6.1). The component never decides whether a tag is
  // one Anki can store — `addTag` in the card model does, and the view-model
  // renders its refusal.
  const {
    tags,
    onAdd,
    onRemove,
  }: {
    tags: readonly string[];
    onAdd: (tag: string) => void;
    onRemove: (tag: string) => void;
  } = $props();

  let entry = $state("");

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
      bind:value={entry}
      {onkeydown}
    />
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
