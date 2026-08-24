<script lang="ts">
  import { primaryFieldOf } from "@/core/note-type";
  import type { AnkiClient } from "@/core/ports/types";

  import CardEditor from "./CardEditor.svelte";
  import type { DraftStatus, SidebarStatus } from "./connect";

  // The panel is handed its reads rather than building them, so it stays free
  // of `browser.*` (P3) and the tests can drive every state.
  const {
    connect,
    loadDraft,
    subscribe,
    anki,
    onCancel,
  }: {
    connect: () => Promise<SidebarStatus>;
    loadDraft: () => Promise<DraftStatus>;
    /** Told when a capture stores a new draft; returns its own disposer. */
    subscribe: (onChange: () => void) => () => void;
    /**
     * The port M6's editor is built against. Optional until M7 wires the
     * AnkiConnect adapter into the entrypoint: without one there is nothing
     * to add a card through, so the panel shows the capture instead of an
     * editor that could not submit.
     */
    anki?: AnkiClient;
    onCancel?: () => void;
  } = $props();

  let status = $state<SidebarStatus>({ kind: "connecting" });
  let capture = $state<DraftStatus>({ kind: "loading" });

  $effect(() => {
    let current = true;
    void connect().then((next) => {
      if (current) status = next;
    });
    return () => {
      current = false;
    };
  });

  // Read once on mount, then again on every capture: Firefox's sidebar
  // persists per window, so it is usually already open when the next card is
  // made, and reading only on mount would leave it showing the previous one.
  $effect(() => {
    let current = true;

    const read = () => {
      void loadDraft().then((next) => {
        if (current) capture = next;
      });
    };

    read();
    const stop = subscribe(read);

    return () => {
      current = false;
      stop();
    };
  });

  const label = $derived(
    status.kind === "connected"
      ? `Connected to the ${status.from}.`
      : status.kind === "unavailable"
        ? `Not connected — ${status.reason}`
        : "Connecting…",
  );

  const draft = $derived(
    capture.kind === "captured" ? capture.draft : undefined,
  );

  // The fallback view, for a panel with no `AnkiClient` yet: what was
  // captured, which is what proves the whole path from the gesture to the
  // draft. M7 wires the adapter in and this branch goes.
  const captured = $derived.by(() => {
    if (draft === undefined) return "";
    const primary = primaryFieldOf(draft.noteType);
    return primary === undefined ? "" : (draft.fields[primary] ?? "");
  });

  // 5.4: what could not be read is named, never quietly dropped.
  const warnings = $derived(draft?.generation.warnings ?? []);
</script>

<main>
  <h1>Anklipper</h1>
  <p role="status">{label}</p>

  {#if capture.kind === "captured" && draft !== undefined && anki !== undefined}
    <!--
      Keyed on the draft: a capture while the sidebar is open replaces it, and
      the editor holds the draft from the moment it is built, so it is
      remounted rather than left editing the previous card.
    -->
    {#key draft}
      <CardEditor {anki} {draft} {onCancel} />
    {/key}
  {:else if capture.kind === "captured" && draft !== undefined}
    <section aria-label="Captured card">
      <blockquote>{captured}</blockquote>
      <p>
        <cite>{draft.source.title}</cite>
        <a href={draft.source.url}>{draft.source.url}</a>
      </p>
      {#if warnings.length > 0}
        <ul aria-label="What could not be captured">
          {#each warnings as warning (warning.kind)}
            <li>{warning.message}</li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else if capture.kind === "unavailable"}
    <p>The draft could not be read — {capture.reason}</p>
  {:else if capture.kind === "empty"}
    <p>Select some text on a page, then choose “Create Anki Card”.</p>
  {/if}
</main>
