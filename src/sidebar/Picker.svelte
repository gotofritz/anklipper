<script lang="ts">
  /**
   * A name chosen out of a list, with a filter over it (M10).
   *
   * A real collection has dozens of decks and note types, and a plain
   * `<select>` of eighty entries is a scroll, not a choice. The filter is a
   * text box beside it rather than a combobox of our own: native controls come
   * with keyboard behaviour, screen-reader support, and the browser's own
   * type-ahead already correct, and 10.7 is about not making the user learn
   * anything new.
   *
   * Names in, one intent out (6.1). It never decides what a valid choice is.
   */
  const {
    id,
    label,
    /** The plural, for the filter's own label — "Filter decks". */
    plural = `${label.toLowerCase()}s`,
    value,
    options,
    onChange,
    describedBy,
  }: {
    id: string;
    label: string;
    plural?: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
    describedBy?: string;
  } = $props();

  let filter = $state("");

  const matching = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return options;

    return options.filter((one) => one.toLowerCase().includes(needle));
  });

  /**
   * The chosen name is always in the list, filtered out or not: a `<select>`
   * whose value is absent from its options shows the first one instead, and
   * the user would watch their deck change because they typed in a filter.
   */
  const shown = $derived(
    matching.includes(value) ? matching : [value, ...matching],
  );
</script>

<div class="picker">
  <label for={id}>{label}</label>
  <select
    {id}
    aria-describedby={describedBy}
    bind:value={() => value, (next) => onChange(next)}
  >
    {#each shown as name (name)}
      <option value={name}>{name}</option>
    {/each}
  </select>

  <label class="quiet" for={`${id}-filter`}>Filter {plural}</label>
  <input
    id={`${id}-filter`}
    type="search"
    autocomplete="off"
    bind:value={filter}
  />
  {#if filter.trim() !== "" && matching.length === 0}
    <p class="quiet" role="status">No {plural} match “{filter}”.</p>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  select,
  input {
    min-width: 0;
    width: 100%;
  }

  .quiet {
    font-size: 0.9em;
    margin: 0;
  }
</style>
