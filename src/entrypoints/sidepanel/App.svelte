<script lang="ts">
  import { createMessenger } from "@/messaging/messenger";
  import { watchDraft } from "@/platform/draft-store";
  import { createRuntimeMessaging } from "@/platform/runtime-messaging";
  import { createStorage } from "@/platform/storage";
  import Panel from "@/sidebar/Panel.svelte";
  import { loadDraft, pingBackground } from "@/sidebar/connect";

  // A shell: it builds the adapters and hands them to the panel, which is
  // where the tested behaviour is. The card editor arrives in M6.
  const messenger = createMessenger(createRuntimeMessaging());
  const storage = createStorage();
</script>

<Panel
  connect={() => pingBackground(messenger)}
  loadDraft={() => loadDraft(messenger)}
  subscribe={(onChange) => watchDraft(storage, onChange)}
/>
