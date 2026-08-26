<script lang="ts">
  import { SHORTCUT_DOCS } from "@/sidebar/shortcuts";

  /**
   * The keyboard shortcuts, written down (M9).
   *
   * They were documented in `title` attributes on the toolbar's buttons, which
   * reaches whoever hovers one and nobody else — not a touch user, not a
   * screen-reader user skimming for what the panel can do, and not somebody
   * who wants to know before opening the panel at all.
   *
   * The list is `SHORTCUT_DOCS`, which a test holds to the editor's own
   * bindings and to the manifest's suggested key — so this cannot go on
   * documenting a chord that has been changed somewhere else.
   */
</script>

<section class="shortcuts">
  <h2>Keyboard shortcuts</h2>

  <table>
    <tbody>
      {#each SHORTCUT_DOCS as entry (entry.keys)}
        <tr>
          <th scope="row"><kbd>{entry.keys}</kbd></th>
          <td>{entry.description}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="quiet">
    On a Mac, use Command where these say Ctrl. The shortcut that makes a card
    is the browser's, and can be changed in its own add-on shortcut settings.
  </p>
</section>

<style>
  .shortcuts {
    margin-top: 1.5rem;
  }

  table {
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.15rem 0.8rem 0.15rem 0;
    text-align: left;
    vertical-align: baseline;
  }

  th {
    font-weight: 400;
    white-space: nowrap;
  }

  kbd {
    border: 1px solid var(--line, #ccc);
    border-radius: 3px;
    font-size: 0.9em;
    padding: 0.05rem 0.3rem;
  }
</style>
