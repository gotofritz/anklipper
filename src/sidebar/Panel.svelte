<script lang="ts">
  import type { SidebarStatus } from "./connect";

  // The panel is handed its connection check rather than building one, so it
  // stays free of `browser.*` (P3) and the tests can drive every state.
  const { connect }: { connect: () => Promise<SidebarStatus> } = $props();

  let status = $state<SidebarStatus>({ kind: "connecting" });

  $effect(() => {
    let current = true;
    void connect().then((next) => {
      if (current) status = next;
    });
    return () => {
      current = false;
    };
  });

  const label = $derived(
    status.kind === "connected"
      ? `Connected to the ${status.from}.`
      : status.kind === "unavailable"
        ? `Not connected — ${status.reason}`
        : "Connecting…",
  );
</script>

<main>
  <h1>Anklipper</h1>
  <p role="status">{label}</p>
</main>
