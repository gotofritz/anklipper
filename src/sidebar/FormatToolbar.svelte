<script lang="ts">
  import type { ClozeDeletion } from "@/core/cloze";
  import type { InlineMark } from "@/core/field-html";

  import ClozeControls from "./ClozeControls.svelte";
  import { SHORTCUT_HINTS } from "./shortcuts";
  import type { EditorCommand } from "./shortcuts";

  /**
   * One toolbar for the whole editor, acting on whichever field has the caret.
   *
   * The formatting buttons are Anki's own set (M10 deliverables), and the
   * cloze controls moved in from M6's separate block so that there is one
   * place where marking happens rather than two. Intents out, nothing decided
   * here (6.1): which field, which range, and whether the mark is already on
   * are all the view-model's.
   */
  const {
    onCommand,
    onMark,
    onRemove,
    marks,
    isCloze,
    deletions,
    nextOrdinal,
  }: {
    onCommand: (command: EditorCommand) => void;
    onMark: (ordinal?: number) => void;
    onRemove: (ordinal: number) => void;
    /** Which marks the current selection already carries, for the pressed state. */
    marks: Readonly<Record<InlineMark, boolean>>;
    isCloze: boolean;
    deletions: readonly ClozeDeletion[];
    nextOrdinal: number;
  } = $props();

  interface Tool {
    readonly command: EditorCommand;
    readonly label: string;
    /** Absent for "remove formatting", which is not a state a selection is in. */
    readonly mark?: InlineMark;
    readonly glyph: string;
  }

  const TOOLS: readonly Tool[] = [
    { command: "bold", label: "Bold", mark: "b", glyph: "B" },
    { command: "italic", label: "Italic", mark: "i", glyph: "I" },
    { command: "underline", label: "Underline", mark: "u", glyph: "U" },
    { command: "superscript", label: "Superscript", mark: "sup", glyph: "x²" },
    { command: "subscript", label: "Subscript", mark: "sub", glyph: "x₂" },
    { command: "clear", label: "Remove formatting", glyph: "✗" },
  ];
</script>

<div class="toolbar">
  <div class="row" role="group" aria-label="Formatting">
    {#each TOOLS as tool (tool.command)}
      <button
        type="button"
        class={tool.mark}
        aria-pressed={tool.mark === undefined
          ? undefined
          : (marks[tool.mark] ?? false)}
        title="{tool.label}{tool.command in SHORTCUT_HINTS
          ? ` (${SHORTCUT_HINTS[tool.command]})`
          : ''}"
        onclick={() => onCommand(tool.command)}
      >
        <span aria-hidden="true">{tool.glyph}</span>
        <span class="name">{tool.label}</span>
      </button>
    {/each}
  </div>

  {#if isCloze}
    <ClozeControls {deletions} {nextOrdinal} {onMark} {onRemove} />
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
  }

  button {
    font: inherit;
    min-width: 2.2em;
  }

  button[aria-pressed="true"] {
    border-color: currentColor;
    font-weight: bold;
  }

  .b {
    font-weight: bold;
  }

  .i {
    font-style: italic;
  }

  .u {
    text-decoration: underline;
  }

  /*
   * The glyph is the button; the words are for anything that reads rather
   * than looks, which is what gives every control an accessible name without
   * a toolbar six rows deep in a sidebar a third of a window wide.
   */
  .name {
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }
</style>
