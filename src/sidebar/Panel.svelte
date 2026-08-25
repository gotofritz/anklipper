<script lang="ts">
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
    /** The port the editor is built against — the adapter, or M3's fake. */
    anki: AnkiClient;
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
</script>

<main>
  <h1>Anklipper</h1>
  <p role="status">{label}</p>

  {#if capture.kind === "captured" && draft !== undefined}
    <!--
      Keyed on the draft: a capture while the sidebar is open replaces it, and
      the editor holds the draft from the moment it is built, so it is
      remounted rather than left editing the previous card.
    -->
    {#key draft}
      <CardEditor {anki} {draft} {onCancel} />
    {/key}
  {:else if capture.kind === "unavailable"}
    <p>The draft could not be read — {capture.reason}</p>
  {:else if capture.kind === "empty"}
    <p>Select some text on a page, then choose “Create Anki Card”.</p>
  {/if}
</main>
