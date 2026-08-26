<script lang="ts">
  import { allowlistSnippet } from "@/anki/allowlist";

  /**
   * The manual `webCorsOriginList` edit (9.2a).
   *
   * The one fix that works when nothing the extension can press does: the user
   * edits AnkiConnect's own configuration, and Anki serves this extension from
   * then on. It exists because the value cannot be documented in advance —
   * Firefox mints a fresh `moz-extension://<uuid>` per installation (P8), so
   * the running extension is the only thing that knows what to paste.
   *
   * `allowlistSnippet` is a pure string builder from the adapter layer, where
   * the add-on's config shape belongs. Nothing here calls AnkiConnect.
   */
  const {
    origin,
    copy,
  }: {
    /** From `OriginPort.extensionOrigin()`, read at runtime and never baked in. */
    origin: string;
    /**
     * Put the snippet on the clipboard. Injected so the component holds no
     * browser API of its own, and absent where nothing can — the snippet is on
     * screen and selectable either way.
     */
    copy?: (text: string) => Promise<void>;
  } = $props();

  const snippet = $derived(allowlistSnippet(origin));

  let copied = $state(false);
  let copyFailed = $state(false);

  async function copySnippet(): Promise<void> {
    try {
      await copy?.(snippet);
      copied = true;
      copyFailed = false;
    } catch {
      // A clipboard write is a permission and a browser setting away from
      // being refused, and the fix does not depend on it.
      copied = false;
      copyFailed = true;
    }
  }
</script>

<div class="fallback">
  {#if origin === ""}
    <p class="problem" role="alert">
      Anklipper cannot read its own origin here, so it cannot tell you what to
      paste. Open the panel from the browser's own toolbar and look again.
    </p>
  {:else}
    <p>
      Anki can be told to accept Anklipper by hand. In Anki, open
      <strong>Tools → Add-ons</strong>, select <strong>AnkiConnect</strong>, and
      click <strong>Config</strong>. Replace the
      <code>webCorsOriginList</code> line with this, then close and reopen Anki:
    </p>

    <pre>{snippet}</pre>

    <p class="quiet">
      This installation of Anklipper is <code>{origin}</code>. It is different
      on every computer, so this is the only place the value can come from.
    </p>

    {#if copy !== undefined}
      <button type="button" onclick={() => void copySnippet()}>
        Copy the snippet
      </button>
    {/if}

    {#if copied}
      <p role="status">Copied.</p>
    {/if}
    {#if copyFailed}
      <p class="problem" role="alert">
        Your browser would not let Anklipper use the clipboard. Select the text
        above and copy it yourself.
      </p>
    {/if}
  {/if}
</div>

<style>
  pre {
    border: 1px solid var(--line, #ccc);
    overflow-x: auto;
    padding: 0.5rem;
    white-space: pre;
  }

  .problem {
    color: var(--problem, #a4000f);
  }
</style>
