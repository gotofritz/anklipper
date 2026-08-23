<script lang="ts">
  import { createMessenger } from "@/messaging/messenger";
  import { createRuntimeMessaging } from "@/platform/runtime-messaging";
  import Panel from "@/sidebar/Panel.svelte";
  import { pingBackground } from "@/sidebar/connect";

  // A shell: it builds the adapters and hands them to the panel, which is
  // where the tested behaviour is. The card editor arrives in M6.
  const messenger = createMessenger(createRuntimeMessaging());
</script>

<Panel connect={() => pingBackground(messenger)} />
