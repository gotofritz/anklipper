<script lang="ts">
  import type {
    AnkiClient,
    DraftStore,
    RememberedStore,
  } from "@/core/ports/types";

  import CardEditor from "./CardEditor.svelte";
  import type { DraftStatus, SidebarStatus } from "./connect";
  import { draftStoreErrorCopy } from "./error-copy";
  import { dismissPending, rememberDeck, takePending } from "./session";

  // The panel is handed its reads rather than building them, so it stays free
  // of `browser.*` (P3) and the tests can drive every state. The two slots are
  // ports for the same reason: what they are backed by is the entrypoint's.
  const {
    connect,
    loadDraft,
    subscribe,
    anki,
    drafts,
    pending,
    remembered,
    openSettings,
    onCancel,
  }: {
    connect: () => Promise<SidebarStatus>;
    loadDraft: () => Promise<DraftStatus>;
    /** Told when a capture stores a new draft; returns its own disposer. */
    subscribe: (onChange: () => void) => () => void;
    /** The port the editor is built against — the adapter, or M3's fake. */
    anki: AnkiClient;
    /** The card being edited. Every edit is written here as it is made (7.1). */
    drafts: DraftStore;
    /** The capture that arrived while that one was still open (7.4). */
    pending: DraftStore;
    /**
     * Where the deck a card went into is noted for the next capture (8.5),
     * and where the sticky pins live (10.6).
     */
    remembered: RememberedStore;
    /**
     * Open the options page. Absent in tests that do not care, and absent on
     * a browser with no options page to open — hence a button that is not
     * rendered rather than one that does nothing.
     */
    openSettings?: () => void;
    onCancel?: () => void;
  } = $props();

  let status = $state<SidebarStatus>({ kind: "connecting" });
  let capture = $state<DraftStatus>({ kind: "loading" });
  /**
   * The capture that went into Anki, so its empty slot is empty on purpose
   * (7.3). Held as the capture's own timestamp rather than a flag: the panel
   * re-reads on every storage change, and the read that follows a successful
   * add can still return the card that was just added.
   */
  let addedCapture = $state<string | undefined>(undefined);
  let slotError = $state<string | undefined>(undefined);
  let reread = $state<() => void>(() => {});

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
        if (!current) return;
        // A different card to edit supersedes the confirmation of the last one.
        if (next.kind === "captured" && next.draft.createdAt !== addedCapture) {
          addedCapture = undefined;
        }
        capture = next;
      });
    };

    read();
    reread = read;
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

  const waiting = $derived(
    capture.kind === "captured" ? capture.pending : undefined,
  );

  /**
   * Hand the slot over: to the capture waiting behind this card, or to
   * nothing at all. One move with two triggers (7.3, 7.4) — the card was
   * added, or the user said they meant the newer selection.
   */
  async function take(): Promise<void> {
    const taken = await takePending(drafts, pending);
    slotError = taken.ok ? undefined : draftStoreErrorCopy(taken.error);
    reread();
  }

  // The note id is the editor's to show; what the panel does with it is hand
  // the slot over, which does not depend on which note it was.
  async function onAdded(): Promise<void> {
    addedCapture = draft?.createdAt;
    // 8.5, on the add rather than on the dropdown: a deck a card is actually
    // in is evidence of what the user is doing; one they scrolled past is not.
    // A failure here costs the next capture its starting deck and nothing
    // more, so it does not join the slot error the user is asked to act on.
    if (draft !== undefined) await rememberDeck(remembered, draft.deck);
    await take();
  }

  async function keepThisCard(): Promise<void> {
    const dropped = await dismissPending(pending);
    slotError = dropped.ok ? undefined : draftStoreErrorCopy(dropped.error);
    reread();
  }

  function discard(): void {
    addedCapture = undefined;
    void take();
    onCancel?.();
  }
</script>

<main>
  <div class="top">
    <h1>Anklipper</h1>
    {#if openSettings !== undefined}
      <button type="button" onclick={openSettings}>Settings</button>
    {/if}
  </div>
  <p role="status">{label}</p>

  {#if slotError !== undefined}
    <p class="problem" role="alert">{slotError}</p>
  {/if}

  {#if capture.kind === "captured" && draft !== undefined}
    {#if waiting !== undefined}
      <!--
        7.4. Two cards cannot be edited at once, and the one already open may
        carry work nobody else has a copy of — so the newer selection waits
        here until the user says which they meant.
      -->
      <div class="prompt" role="alert">
        <p>
          A newer selection is waiting: “{waiting.source.title}”. Opening it
          will replace the card below.
        </p>
        <div class="actions">
          <button type="button" onclick={() => void take()}>
            Use the new selection
          </button>
          <button type="button" onclick={() => void keepThisCard()}>
            Keep this card
          </button>
        </div>
      </div>
    {/if}

    <!--
      Keyed on the capture rather than the draft value: the panel re-reads on
      every storage change, and the editor's own saves (7.1) are among them.
      Remounting on those would throw away the caret and anything typed since.

      `createdAt` is the capture's identity — one gesture, one timestamp — so
      this holds as long as two gestures cannot land in the same millisecond,
      which two right-clicks cannot.
    -->
    {#key draft.createdAt}
      <CardEditor
        {anki}
        {draft}
        {drafts}
        {remembered}
        {onAdded}
        onCancel={discard}
      />
    {/key}
  {:else if capture.kind === "unavailable"}
    <p>The draft could not be read — {capture.reason}</p>
  {:else if capture.kind === "empty"}
    {#if addedCapture !== undefined}
      <p role="status">Added to Anki.</p>
    {/if}
    <p>Select some text on a page, then choose “Create Anki Card”.</p>
  {/if}
</main>

<style>
  .top {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: space-between;
  }

  .prompt {
    border: 1px solid var(--line, #ccc);
    margin-bottom: 0.6rem;
    padding: 0.5rem;
  }

  .prompt p {
    margin: 0 0 0.4rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .problem {
    color: var(--problem, #a4000f);
  }
</style>
