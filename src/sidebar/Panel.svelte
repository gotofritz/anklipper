<script lang="ts">
  import { primaryFieldOf } from "@/core/note-type";

  import type { DraftStatus, SidebarStatus } from "./connect";

  // The panel is handed its reads rather than building them, so it stays free
  // of `browser.*` (P3) and the tests can drive every state.
  const {
    connect,
    loadDraft,
    subscribe,
  }: {
    connect: () => Promise<SidebarStatus>;
    loadDraft: () => Promise<DraftStatus>;
    /** Told when a capture stores a new draft; returns its own disposer. */
    subscribe: (onChange: () => void) => () => void;
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

  // The editor is M6's; until then the panel shows what was captured, which is
  // what proves the whole path from the gesture to the draft.
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

  {#if capture.kind === "captured" && draft !== undefined}
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
