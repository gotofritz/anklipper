<script lang="ts">
  import type { DraftIssue } from "@/core/draft";
  import {
    fieldFromText,
    sanitizeFieldHtml,
    spliceField,
  } from "@/core/field-html";

  import {
    placeCaretAt,
    selectRangeIn,
    selectionOffsetsIn,
  } from "./selection.dom";
  import { draftIssueCopy } from "./error-copy";
  import type { FieldApi, RegisterField, ReportSelection } from "./types";

  /**
   * One field of the note, as Anki edits one (10.2).
   *
   * A `contenteditable`, superseding M6's `<textarea>` (6.6): Anki stores
   * field content as HTML and its own editor is rich, so a plain textarea
   * cannot offer bold, italic, or sub- and superscript — which is most of what
   * "reproduce Anki's editor" means.
   *
   * The component owns the caret and nothing else. Every value it produces
   * goes out as an intent (6.1), and every value it is given is sanitised
   * before it gets here — but the paste handler sanitises again on the way in,
   * because a paste is the one route by which a page's own markup arrives.
   */
  const {
    name,
    value,
    onInput,
    onToggleSticky,
    register,
    onSelect,
    issues = [],
    sticky = false,
    duplicate = false,
  }: {
    name: string;
    /** The field's HTML. */
    value: string;
    onInput: (html: string) => void;
    onToggleSticky: (field: string) => void;
    register: RegisterField;
    /**
     * Told as the caret moves. The toolbar needs the range *after* its own
     * button has taken the focus, which is exactly when asking the field
     * would be too late.
     */
    onSelect?: ReportSelection;
    issues?: readonly DraftIssue[];
    sticky?: boolean;
    /** Anki already holds a note with this first field (10.8). */
    duplicate?: boolean;
  } = $props();

  /** 10.4: source is where cloze braces are easiest to fix, and the escape hatch. */
  let source = $state(false);
  let draftSource = $state("");
  let node = $state<HTMLElement | undefined>(undefined);

  const fieldId = $derived(
    `field-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  );
  const issueId = (index: number) => `${fieldId}-issue-${index}`;
  const duplicateId = $derived(`${fieldId}-duplicate`);

  const describedBy = $derived(
    [
      ...issues.map((_, index) => issueId(index)),
      ...(duplicate ? [duplicateId] : []),
    ].join(" ") || undefined,
  );

  /**
   * What this component last handed out. The DOM is the source of truth while
   * the user is typing in it — writing `innerHTML` back on every keystroke
   * would drop the caret at the end of the field — so the value is only
   * written in when it changed for some other reason: a toolbar action, a
   * cloze mark, the note type being reconciled.
   */
  let mine = $state.raw<string | undefined>(undefined);

  $effect(() => {
    const host = node;
    if (host === undefined || source) return;
    if (value === mine) return;

    // Typing can still land here: pressing Enter leaves a `<div>` behind, and
    // the value that comes back is the sanitised `<br>`. Rewriting the markup
    // throws the caret away, so where it was is measured first and put back
    // afterwards — otherwise a new line would send the cursor to the top of
    // the field.
    const caret =
      host.ownerDocument.activeElement === host
        ? selectionOffsetsIn(host, window.getSelection())
        : undefined;

    mine = value;
    host.innerHTML = value;
    if (caret !== undefined) selectRangeIn(host, caret.start, caret.end);
  });

  function emit(html: string) {
    mine = html;
    onInput(html);
  }

  function onNodeInput() {
    if (node === undefined) return;
    emit(node.innerHTML);
    report();
  }

  function report() {
    if (node === undefined) return;
    onSelect?.(name, selectionOffsetsIn(node, window.getSelection()));
  }

  /**
   * 10.5. The clipboard is the one place a page's markup can reach a field
   * whole, so this owns the paste rather than letting the browser insert it:
   * sanitise, then splice at the selection so the surrounding formatting
   * survives.
   */
  function onPaste(event: ClipboardEvent) {
    const host = node;
    if (host === undefined) return;

    const data = event.clipboardData;
    if (data === null || data === undefined) return;
    event.preventDefault();

    const html = data.getData("text/html");
    const incoming =
      html === ""
        ? fieldFromText(data.getData("text/plain"))
        : sanitizeFieldHtml(html);

    const at = selectionOffsetsIn(host, window.getSelection()) ?? {
      start: 0,
      end: 0,
    };
    // The element, not the `value` prop: the offsets were just measured
    // against the DOM, and while the user is typing the DOM is what is ahead.
    emit(
      spliceField(
        sanitizeFieldHtml(host.innerHTML),
        at.start,
        at.end,
        incoming,
      ),
    );
  }

  function toggleSource() {
    if (source) {
      emit(sanitizeFieldHtml(draftSource));
      source = false;
      return;
    }

    draftSource = value;
    source = true;
  }

  const api: FieldApi = {
    selection: () =>
      node === undefined
        ? undefined
        : selectionOffsetsIn(node, window.getSelection()),
    placeCaret: (offset: number) => {
      if (node !== undefined) placeCaretAt(node, offset);
    },
    select: (start: number, end: number) => {
      if (node !== undefined) selectRangeIn(node, start, end);
    },
    focus: () => node?.focus(),
    isSource: () => source,
    toggleSource,
  };

  $effect(() => {
    register(name, api);
    return () => register(name, undefined);
  });
</script>

<div class="field" data-field={name}>
  <div class="head">
    <label for={source ? `${fieldId}-source` : fieldId}>
      {source ? `${name} (HTML)` : name}
    </label>
    <div class="tools">
      <!--
        10.6. Anki's own pin, and the reason capturing several cards off one
        page is fast: the content is there again on the next card.
      -->
      <button
        type="button"
        aria-pressed={sticky}
        title="Keep {name} for the next card"
        onclick={() => onToggleSticky(name)}
      >
        Pin {name}
      </button>
      <button
        type="button"
        aria-pressed={source}
        title="Edit {name} as HTML (Ctrl+Shift+X)"
        onclick={toggleSource}
      >
        HTML for {name}
      </button>
    </div>
  </div>

  {#if source}
    <textarea
      id={`${fieldId}-source`}
      class="source"
      rows="3"
      spellcheck="false"
      aria-describedby={describedBy}
      bind:value={draftSource}></textarea>
  {:else}
    <!--
      A `contenteditable` is not a form control, so the role, the label, and
      the multi-line hint have to be said out loud for it to be one.
    -->
    <div
      id={fieldId}
      class="rich"
      role="textbox"
      tabindex="0"
      contenteditable="true"
      aria-label={name}
      aria-multiline="true"
      aria-invalid={issues.length > 0}
      aria-describedby={describedBy}
      data-duplicate={duplicate ? "true" : undefined}
      oninput={onNodeInput}
      onpaste={onPaste}
      onkeyup={report}
      onmouseup={report}
      onfocus={report}
      bind:this={node}
    ></div>
  {/if}

  {#each issues as issue, index (index)}
    <p class="problem" id={issueId(index)}>{draftIssueCopy(issue)}</p>
  {/each}

  {#if duplicate}
    <!--
      10.8: shown against the field it is about, the way Anki shows it, and
      never as a block — the user may genuinely want the near-duplicate (4.4).
    -->
    <p class="warning" id={duplicateId} role="status">
      Anki already has a note whose first field is this one. Adding it anyway is
      allowed.
    </p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .head {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    justify-content: space-between;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
  }

  .tools button {
    font-size: 0.8em;
  }

  .tools button[aria-pressed="true"] {
    border-color: currentColor;
    font-weight: bold;
  }

  .rich,
  .source {
    border: 1px solid var(--line, #ccc);
    font: inherit;
    min-height: 3.4em;
    min-width: 0;
    padding: 0.25rem;
    width: 100%;
  }

  .rich {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .rich[data-duplicate="true"] {
    background: var(--duplicate, #fff3cd);
  }

  .source {
    font-family: monospace;
    resize: vertical;
  }

  .problem {
    color: var(--problem, #a4000f);
    margin: 0;
  }

  .warning {
    margin: 0;
  }
</style>
