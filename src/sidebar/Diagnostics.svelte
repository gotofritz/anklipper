<script lang="ts">
  import { untrack } from "svelte";

  import type { AnkiClient, AnkiDiagnostics } from "@/core/ports/types";

  import ManualFallback from "./ManualFallback.svelte";
  import { createDiagnosticsModel } from "./diagnostics-model.svelte";
  import { ankiErrorCopy } from "./error-copy";

  /**
   * The connection report, and the first run it doubles as (9.1, 9.3, 9.4).
   *
   * One view rather than a wizard and a diagnostics page, because they say the
   * same things: a fresh install and an Anki that was closed an hour ago both
   * need the cause and the fix, and only the framing differs. Folded away when
   * the connection works, open when it does not, and reachable either way —
   * the failure recurs whenever Anki closes (9.4), and a one-shot wizard would
   * be no use the second time.
   *
   * Handed the `AnkiClient` port and nothing browser-shaped (P3, 6.2); the
   * asks that need a `browser.*` call are functions the entrypoint passes in.
   */
  const {
    anki,
    describe,
    grantAccess,
    openSettings,
    copy,
  }: {
    anki: AnkiClient;
    /** How the adapter is configured, for the report. Never the API key (4.8). */
    describe?: () => Promise<AnkiDiagnostics>;
    /**
     * Ask the browser for the Anki host permission (9.6). Firefox MV3 grants
     * none at install and refuses the request outside a user gesture, so the
     * ask belongs to the button below.
     */
    grantAccess?: () => Promise<boolean>;
    /** Where the API key is entered, when AnkiConnect asks for one. */
    openSettings?: () => void;
    /** Put the allowlist snippet on the clipboard. */
    copy?: (text: string) => Promise<void>;
  } = $props();

  const model = untrack(() =>
    createDiagnosticsModel({
      anki,
      ...(describe === undefined ? {} : { describe }),
      ...(grantAccess === undefined ? {} : { grantAccess }),
    }),
  );

  $effect(() => {
    void model.check();
  });

  const summary = $derived(
    model.state.kind === "connected"
      ? `Anki: connected — AnkiConnect ${model.state.apiVersion}`
      : model.state.kind === "failed"
        ? "Anki: not connected"
        : "Anki: checking…",
  );

  const failure = $derived(
    model.state.kind === "failed"
      ? { kind: model.state.cause.kind, ...ankiErrorCopy(model.state.cause) }
      : undefined,
  );

  /**
   * The first run, told apart from a fault (test 8). Someone who has never
   * connected is being set up; someone whose Anki has just closed is being
   * told what broke, and does not need the introduction again.
   */
  const firstRun = $derived(failure !== undefined && !model.everConnected);

  /**
   * 9.7. `permission-missing` is the one cause a press can fix, and the one
   * cause **Check again** could never fix — the probe would refuse before
   * anything went out. So it gets the ask instead, and not both.
   */
  const asksSettings = $derived(
    failure?.kind === "api-key-required" && openSettings !== undefined,
  );
</script>

<details
  class="report"
  aria-label="Anki connection"
  open={failure !== undefined}
>
  <summary>{summary}</summary>

  <div class="body">
    {#if firstRun}
      <p>
        Before Anklipper can add cards, it needs to reach Anki on this computer.
        Here is what is stopping it:
      </p>
    {/if}

    {#if failure !== undefined}
      <p class="problem" role="alert">{failure.cause}</p>
      <p>{failure.action}</p>
    {/if}

    <div class="actions">
      {#if model.canGrant}
        <button type="button" onclick={() => void model.grant()}>
          Allow access to Anki
        </button>
      {:else}
        <button
          type="button"
          disabled={model.state.kind === "checking"}
          onclick={() => void model.check()}
        >
          Check again
        </button>
      {/if}
      {#if asksSettings}
        <button type="button" onclick={openSettings}>Open settings</button>
      {/if}
    </div>

    {#if model.facts !== undefined}
      <!--
        What a bug report needs, and what the user needs to check their own
        Anki against. The API key is a yes-or-no and never a value (4.8).
      -->
      <dl>
        <dt>Anki's address</dt>
        <dd>{model.facts.endpoint}</dd>
        <dt>This installation</dt>
        <dd>{model.facts.origin}</dd>
        <dt>API key</dt>
        <dd>{model.facts.apiKeyConfigured ? "set" : "not set"}</dd>
      </dl>

      {#if failure !== undefined}
        <ManualFallback
          origin={model.facts.origin}
          {...copy === undefined ? {} : { copy }}
        />
      {/if}
    {/if}
  </div>
</details>

<style>
  .report {
    border: 1px solid var(--line, #ccc);
    margin-bottom: 0.6rem;
    padding: 0.4rem 0.5rem;
  }

  summary {
    cursor: pointer;
  }

  .body > :global(*:first-child) {
    margin-top: 0.5rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  dl {
    display: grid;
    gap: 0 0.6rem;
    grid-template-columns: auto 1fr;
    margin: 0.6rem 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .problem {
    color: var(--problem, #a4000f);
  }
</style>
