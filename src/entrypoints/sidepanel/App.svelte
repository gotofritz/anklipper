<script lang="ts">
  import { createAnkiClient } from "@/anki";
  import { createMessenger } from "@/messaging/messenger";
  import {
    PENDING_KEY,
    createStoredDrafts,
    watchDraft,
  } from "@/platform/draft-store";
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

  // The two draft slots (7.1, 7.4). The sidebar writes every edit to the
  // first as it is made and hands the slot over when the card is added or the
  // user chooses the newer selection; the background writes captures into
  // whichever is free. Both contexts reach the same two storage keys rather
  // than passing drafts over the message channel, which neither an unloaded
  // background nor a closed sidebar could be relied on to do.
  const drafts = createStoredDrafts(storage);
  const pending = createStoredDrafts(storage, PENDING_KEY);

  // The two things the adapter needs from the browser, injected as plain
  // values so the layer itself stays testable without one (M4). The origin is
  // read at runtime and never hardcoded (P8): Firefox mints a fresh
  // `moz-extension://<uuid>` per installation.
  //
  // The endpoint is the add-on's own default until M8 makes it a setting; the
  // deck and note-type defaults a capture starts from are constants in
  // `@/background/capture` until then.
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
  {drafts}
  {pending}
/>
