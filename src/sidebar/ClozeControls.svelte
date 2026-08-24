<script lang="ts">
  import type { ClozeDeletion } from "@/core/cloze";

  /**
   * The deletion list and the two things done to it. The component is handed
   * parsed deletions and hands back an intent (6.1): it never writes braces,
   * because the grammar belongs to the card model and would otherwise exist in
   * two places.
   */
  const {
    deletions,
    nextOrdinal,
    onMark,
    onRemove,
  }: {
    deletions: readonly ClozeDeletion[];
    /** The ordinal a new deletion would take, so the control can name it. */
    nextOrdinal: number;
    onMark: (ordinal?: number) => void;
    onRemove: (ordinal: number) => void;
  } = $props();

  /** `"new"`, or the ordinal this span should be grouped under (3.9). */
  let choice = $state("new");

  /** Spans sharing an ordinal are one deletion with two blanks, not two. */
  const grouped = $derived.by(() => {
    const ordinals = deletions
      .map((deletion) => deletion.ordinal)
      .filter((ordinal, index, all) => all.indexOf(ordinal) === index)
      .sort((a, b) => a - b);

    return ordinals.map(
      (ordinal) =>
        [
          ordinal,
          deletions
            .filter((deletion) => deletion.ordinal === ordinal)
            .map((deletion) => deletion.answer),
        ] as const,
    );
  });

  function mark() {
    onMark(choice === "new" ? undefined : Number(choice));
  }
</script>

<fieldset>
  <legend>Cloze deletions</legend>

  <div class="row">
    <label for="cloze-ordinal">Mark the selection as</label>
    <select id="cloze-ordinal" bind:value={choice}>
      <option value="new">a new deletion (c{nextOrdinal})</option>
      {#each grouped as [ordinal] (ordinal)}
        <option value={String(ordinal)}>part of c{ordinal}</option>
      {/each}
    </select>
    <button type="button" onclick={mark}>Mark selection</button>
  </div>

  {#if grouped.length === 0}
    <p class="quiet">
      Nothing is hidden yet. Select the text to hide in the field above, then
      mark it.
    </p>
  {:else}
    <ul aria-label="Cloze deletions">
      {#each grouped as [ordinal, answers] (ordinal)}
        <li>
          <span class="ordinal">c{ordinal}</span>
          <span class="answers">{answers.join(" / ")}</span>
          <button type="button" onclick={() => onRemove(ordinal)}>
            Remove c{ordinal}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</fieldset>

<style>
  fieldset {
    border: 1px solid var(--line, #ccc);
    margin: 0;
    min-width: 0;
    padding: 0.5rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .row label {
    flex-basis: 100%;
  }

  .row select {
    flex: 1 1 8rem;
    min-width: 0;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    align-items: baseline;
    display: flex;
    gap: 0.4rem;
  }

  .ordinal {
    font-family: monospace;
  }

  .answers {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .quiet {
    margin: 0;
  }
</style>
