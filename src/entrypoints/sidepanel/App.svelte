<script lang="ts">
  import { createSettingsAnkiClient } from "@/anki/from-settings";
  import { createMessenger } from "@/messaging/messenger";
  import {
    PENDING_KEY,
    createStoredDrafts,
    watchDraft,
  } from "@/platform/draft-store";
  import { createOptionsPage } from "@/platform/options";
  import { createOrigin } from "@/platform/origin";
  import { createPermissions, hostPermissionFor } from "@/platform/permissions";
  import { createStoredRemembered } from "@/platform/remembered-store";
  import { createRuntimeMessaging } from "@/platform/runtime-messaging";
  import {
    createStoredSettings,
    loadSettingsOrDefaults,
  } from "@/platform/settings-store";
  import { createStorage } from "@/platform/storage";
  import Panel from "@/sidebar/Panel.svelte";
  import { loadDraft, pingBackground } from "@/sidebar/connect";

  // A shell: it builds the adapters and hands them to the panel, which is
  // where the tested behaviour is.
  const messenger = createMessenger(createRuntimeMessaging());
  const storage = createStorage();
  const permissions = createPermissions();
  const options = createOptionsPage();

  // The two draft slots (7.1, 7.4). The sidebar writes every edit to the
  // first as it is made and hands the slot over when the card is added or the
  // user chooses the newer selection; the background writes captures into
  // whichever is free. Both contexts reach the same two storage keys rather
  // than passing drafts over the message channel, which neither an unloaded
  // background nor a closed sidebar could be relied on to do.
  const drafts = createStoredDrafts(storage);
  const pending = createStoredDrafts(storage, PENDING_KEY);

  // What the user configured, and what the extension noticed (M8). Kept apart
  // on purpose: resetting the settings must not erase the deck last used
  // (8.5).
  const settings = createStoredSettings(storage);
  const remembered = createStoredRemembered(storage);

  // The adapter, configured from the settings on every call (M8): the endpoint,
  // the timeout, and the optional API key are the user's now, and the options
  // page can change them while this sidebar is open. The origin is read at
  // runtime and never hardcoded (P8) — Firefox mints a fresh
  // `moz-extension://<uuid>` per installation — and the host permission is
  // checked before anything is sent (2.7).
  const anki = createSettingsAnkiClient({
    loadSettings: () => loadSettingsOrDefaults(settings),
    origin: createOrigin().extensionOrigin(),
    hasHostPermission: (endpoint) =>
      permissions.has(hostPermissionFor(endpoint)),
  });
</script>

<Panel
  connect={() => pingBackground(messenger)}
  loadDraft={() => loadDraft(messenger)}
  subscribe={(onChange) => watchDraft(storage, onChange)}
  openSettings={() => void options.open()}
  {anki}
  {drafts}
  {pending}
  {remembered}
/>
