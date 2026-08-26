<script lang="ts">
  import {
    createSettingsAnkiClient,
    createSettingsAnkiDiagnostics,
  } from "@/anki/from-settings";
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
  import { DEFAULT_SETTINGS } from "@/core/settings";
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
  const origin = createOrigin();

  // The endpoint the last permission check was made against (9.6). Firefox
  // refuses `permissions.request` outside a user gesture, and an `await` on
  // the settings store inside the click handler would spend that gesture — so
  // the endpoint is recorded on the way past instead. The check runs
  // immediately before the refusal the button answers, so this is always the
  // endpoint that refusal was about.
  let refusedEndpoint = DEFAULT_SETTINGS.endpoint;

  const ankiDeps = {
    loadSettings: () => loadSettingsOrDefaults(settings),
    origin: origin.extensionOrigin(),
    hasHostPermission: (endpoint: string) => {
      refusedEndpoint = endpoint;
      return permissions.has(hostPermissionFor(endpoint));
    },
  };

  const anki = createSettingsAnkiClient(ankiDeps);
  // What the connection report renders (9.3). Read per call, from the same
  // settings the client is built from, so the two cannot describe different
  // endpoints.
  const describeAnki = createSettingsAnkiDiagnostics(ankiDeps);
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
  version={origin.extensionVersion()}
  grantAccess={() => permissions.request(hostPermissionFor(refusedEndpoint))}
  {describeAnki}
  copy={(text) => navigator.clipboard.writeText(text)}
/>
