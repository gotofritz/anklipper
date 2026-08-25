<script lang="ts">
  import { createSettingsAnkiClient } from "@/anki/from-settings";
  import SettingsForm from "@/options/SettingsForm.svelte";
  import { createOrigin } from "@/platform/origin";
  import { createPermissions, hostPermissionFor } from "@/platform/permissions";
  import {
    createStoredSettings,
    loadSettingsOrDefaults,
  } from "@/platform/settings-store";
  import { createStorage } from "@/platform/storage";

  // A shell, like the sidebar's: it builds the adapters and hands them to the
  // form, which is where the tested behaviour is.
  const storage = createStorage();
  const permissions = createPermissions();
  const settings = createStoredSettings(storage);

  // The deck and note-type lists come from Anki, so the form is a choice
  // rather than two text boxes to mistype. It reads the settings for its own
  // endpoint, which is how a corrected address takes effect on **Try again**
  // without reopening the page.
  const anki = createSettingsAnkiClient({
    loadSettings: () => loadSettingsOrDefaults(settings),
    origin: createOrigin().extensionOrigin(),
    hasHostPermission: (endpoint) =>
      permissions.has(hostPermissionFor(endpoint)),
  });
</script>

<!--
  The permission request is passed rather than made here: it has to happen in
  the same task as the Save press, and the form is what has the press.
-->
<SettingsForm
  {settings}
  {anki}
  requestHostPermission={(endpoint) =>
    permissions.request(hostPermissionFor(endpoint))}
/>
