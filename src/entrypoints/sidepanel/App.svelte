<script lang="ts">
  import { createAnkiClient } from "@/anki";
  import { createMessenger } from "@/messaging/messenger";
  import { watchDraft } from "@/platform/draft-store";
  import { createOrigin } from "@/platform/origin";
  import {
    ANKI_CONNECT_HOST_PERMISSION,
    createPermissions,
  } from "@/platform/permissions";
  import { createRuntimeMessaging } from "@/platform/runtime-messaging";
  import { createStorage } from "@/platform/storage";
  import Panel from "@/sidebar/Panel.svelte";
  import { loadDraft, pingBackground } from "@/sidebar/connect";

  // A shell: it builds the adapters and hands them to the panel, which is
  // where the tested behaviour is.
  const messenger = createMessenger(createRuntimeMessaging());
  const storage = createStorage();
  const permissions = createPermissions();

  // The two things the adapter needs from the browser, injected as plain
  // values so the layer itself stays testable without one (M4). The origin is
  // read at runtime and never hardcoded (P8): Firefox mints a fresh
  // `moz-extension://<uuid>` per installation.
  //
  // The endpoint is the add-on's own default until M8 makes it a setting, and
  // there are no deck or note-type defaults yet — M7 owns both, along with
  // persisting the draft and retrying a failed add.
  const anki = createAnkiClient({
    origin: createOrigin().extensionOrigin(),
    hasHostPermission: () => permissions.has(ANKI_CONNECT_HOST_PERMISSION),
  });
</script>

<Panel
  connect={() => pingBackground(messenger)}
  loadDraft={() => loadDraft(messenger)}
  subscribe={(onChange) => watchDraft(storage, onChange)}
  {anki}
/>
