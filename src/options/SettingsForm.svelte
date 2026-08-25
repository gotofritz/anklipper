<script lang="ts">
  import { untrack } from "svelte";

  import type { AnkiClient, SettingsStore } from "@/core/ports/types";
  import type { SourceUrlStyle } from "@/core/source-fields";
  import TagEditor from "@/sidebar/TagEditor.svelte";
  import {
    ankiErrorCopy,
    settingsIssueCopy,
    draftStoreErrorCopy,
  } from "@/sidebar/error-copy";

  import { createSettingsModel } from "./settings-model.svelte";

  /**
   * The options page's form (M8).
   *
   * Built the way M6's editor is: handed the **ports**, never a `browser.*`
   * API, with one view-model between it and them (6.2) and native labelled
   * controls throughout (6.5). `TagEditor` and `error-copy` are M6's own — the
   * default tags are tags, and a failure has to say the same thing here as it
   * does in the sidebar.
   */
  const {
    settings,
    anki,
  }: {
    settings: SettingsStore;
    anki: AnkiClient;
  } = $props();

  const model = untrack(() => createSettingsModel({ settings, anki }));

  $effect(() => {
    void model.load();
  });

  const STYLES: readonly { value: SourceUrlStyle; label: string }[] = [
    { value: "plain", label: "The address itself" },
    { value: "link", label: "A link, labelled with the page title" },
  ];

  const issuesFor = (code: string) =>
    model.issues.filter((issue) => issue.code === code);

  const describedBy = (id: string, code: string) =>
    issuesFor(code).length === 0 ? undefined : `${id}-issue`;

  const listFailure = $derived.by(() => {
    const failed =
      model.decks.kind === "failed"
        ? model.decks.error
        : model.noteTypes.kind === "failed"
          ? model.noteTypes.error
          : undefined;

    return failed === undefined ? undefined : ankiErrorCopy(failed);
  });

  function submit(event: Event) {
    event.preventDefault();
    void model.save();
  }

  /** A field name, or the empty string that means "put it nowhere". */
  const NONE = "";
</script>

<form class="settings" onsubmit={submit}>
  <h1>Anklipper settings</h1>

  {#if model.loadError !== undefined}
    <p class="problem" role="alert">
      Your saved settings could not be read, so these are the defaults.
      {draftStoreErrorCopy(model.loadError)}
    </p>
  {/if}

  {#if listFailure !== undefined}
    <div class="problem" role="alert">
      <p>The deck and note type lists could not be read. {listFailure.cause}</p>
      <p>{listFailure.action}</p>
      <button type="button" onclick={() => void model.load()}>Try again</button>
    </div>
  {/if}

  <fieldset>
    <legend>New cards</legend>

    <div class="field">
      <label for="default-deck">Deck new cards start in</label>
      <select
        id="default-deck"
        aria-invalid={issuesFor("deck-missing").length > 0}
        aria-describedby={describedBy("default-deck", "deck-missing")}
        bind:value={
          () => model.settings.defaultDeck, (value) => model.setDeck(value)
        }
      >
        {#each model.deckOptions as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
      {#each issuesFor("deck-missing") as issue (issue.code)}
        <p class="problem" id="default-deck-issue">
          {settingsIssueCopy(issue)}
        </p>
      {/each}
    </div>

    <div class="field">
      <label for="default-note-type">Note type new cards start on</label>
      <select
        id="default-note-type"
        bind:value={
          () => model.settings.defaultNoteType.name,
          (value) => model.setNoteType(value)
        }
      >
        {#each model.noteTypeOptions as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
      <p class="quiet">
        A card can still be changed to any other note type while you edit it.
      </p>
    </div>

    <TagEditor
      tags={model.settings.defaultTags}
      onAdd={(tag) => model.addTag(tag)}
      onRemove={(tag) => model.removeTag(tag)}
    />
    {#each issuesFor("tag-malformed") as issue (issue.tag)}
      <p class="problem">{settingsIssueCopy(issue)}</p>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Where the card came from</legend>
    <p class="quiet">
      Anklipper always keeps the page title and address with the card. These
      choose whether either is also written into one of the note type's own
      fields.
    </p>

    <div class="field">
      <label for="source-url-field">Field for the page address</label>
      <select
        id="source-url-field"
        aria-invalid={issuesFor("mapping-unknown-field").length > 0}
        bind:value={
          () => model.settings.fieldMapping.sourceUrl,
          (value) => model.setSourceUrlField(value)
        }
      >
        {#each model.fieldOptions as name (name)}
          <option value={name}>{name === NONE ? "Nowhere" : name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="source-title-field">Field for the page title</label>
      <select
        id="source-title-field"
        bind:value={
          () => model.settings.fieldMapping.sourceTitle,
          (value) => model.setSourceTitleField(value)
        }
      >
        {#each model.fieldOptions as name (name)}
          <option value={name}>{name === NONE ? "Nowhere" : name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="source-url-style">How the address is written</label>
      <select
        id="source-url-style"
        bind:value={
          () => model.settings.sourceUrlStyle,
          (value) => model.setSourceUrlStyle(value as SourceUrlStyle)
        }
      >
        {#each STYLES as style (style.value)}
          <option value={style.value}>{style.label}</option>
        {/each}
      </select>
    </div>

    {#each issuesFor("mapping-unknown-field") as issue (issue.field)}
      <p class="problem">{settingsIssueCopy(issue)}</p>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Anki</legend>

    <div class="field">
      <label for="endpoint">AnkiConnect address</label>
      <input
        id="endpoint"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-invalid={issuesFor("endpoint-invalid").length > 0}
        aria-describedby={describedBy("endpoint", "endpoint-invalid")}
        bind:value={
          () => model.settings.endpoint, (value) => model.setEndpoint(value)
        }
      />
      <p class="quiet">
        Change this only if you changed AnkiConnect's own address or port.
      </p>
      {#each issuesFor("endpoint-invalid") as issue (issue.code)}
        <p class="problem" id="endpoint-issue">{settingsIssueCopy(issue)}</p>
      {/each}
    </div>

    <div class="field">
      <label for="timeout">How long to wait (milliseconds)</label>
      <input
        id="timeout"
        type="number"
        min="1"
        step="1"
        aria-invalid={issuesFor("timeout-invalid").length > 0}
        aria-describedby={describedBy("timeout", "timeout-invalid")}
        bind:value={
          () => model.settings.timeoutMs,
          (value) => model.setTimeoutMs(Number(value))
        }
      />
      {#each issuesFor("timeout-invalid") as issue (issue.code)}
        <p class="problem" id="timeout-issue">{settingsIssueCopy(issue)}</p>
      {/each}
    </div>

    <div class="field">
      <label for="api-key">AnkiConnect API key</label>
      <!--
        8.5a. Stored like any other setting, and treated like no other: it is
        a credential for a service that can delete a collection, so it is
        never logged, never in diagnostics, and not on screen by default.
      -->
      <input
        id="api-key"
        type="password"
        autocomplete="off"
        spellcheck="false"
        bind:value={
          () => model.settings.apiKey, (value) => model.setApiKey(value)
        }
      />
      <p class="quiet">
        Leave this empty unless you set a key in AnkiConnect's own
        configuration. It is kept on this computer and sent only to Anki.
      </p>
    </div>
  </fieldset>

  {#if model.notice !== undefined}
    <p class="problem" role="alert">{model.notice}</p>
  {/if}

  {#if model.saveState === "saved"}
    <p role="status">Settings saved.</p>
  {:else if model.saveState === "refused"}
    <p class="problem" role="alert">
      Nothing was saved — fix what is marked above.
    </p>
  {:else if model.saveState === "failed" && model.saveError !== undefined}
    <p class="problem" role="alert">
      Your settings could not be saved. {draftStoreErrorCopy(model.saveError)}
    </p>
  {/if}

  <div class="actions">
    <button type="submit" disabled={model.saveState === "saving"}>
      Save settings
    </button>
    <button type="button" onclick={() => void model.reset()}>
      Reset to defaults
    </button>
  </div>
</form>

<style>
  .settings {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    margin: 0 auto;
    max-width: 40rem;
    overflow-wrap: anywhere;
    padding: 1rem;
  }

  .settings :global(*) {
    box-sizing: border-box;
    max-width: 100%;
  }

  fieldset {
    border: 1px solid var(--line, #ccc);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin: 0;
    min-width: 0;
    padding: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  select,
  input {
    font: inherit;
    min-width: 0;
    width: 100%;
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

  p {
    margin: 0;
  }
</style>
