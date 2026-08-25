/**
 * A `contenteditable`'s selection, in the coordinates the card model works in.
 *
 * This is the milestone's named risk (M10, "where this gets harder than it
 * looks"): the cloze functions take **text offsets** and a `contenteditable`
 * hands back a DOM `Range`. `field-html.ts` already puts a field's markup and
 * its text in one coordinate space, so all this has to do is measure the DOM
 * the same way — a text node contributes its characters, a `<br>` contributes
 * the one newline that `fieldText` reads it as, and nothing else contributes
 * anything.
 *
 * It is deliberately not a Svelte component and has tests of its own: the
 * mapping is where the off-by-one bugs live, and finding them through a
 * rendered editor would be finding them twice.
 */

function isBreak(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).tagName.toLowerCase() === "br"
  );
}

/** How many characters of the field's text a node accounts for. */
function lengthOf(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data.length;
  if (isBreak(node)) return 1;

  let total = 0;
  for (const child of node.childNodes) total += lengthOf(child);

  return total;
}

/** Characters before `node` starts, or `undefined` if it is not in `host`. */
function textBefore(host: Node, node: Node): number | undefined {
  let total = 0;

  const visit = (current: Node): boolean => {
    if (current === node) return true;
    if (current.nodeType === Node.TEXT_NODE || isBreak(current)) {
      total += lengthOf(current);
      return false;
    }
    for (const child of current.childNodes) if (visit(child)) return true;

    return false;
  };

  return visit(host) ? total : undefined;
}

/**
 * One end of a DOM range as a text offset.
 *
 * A range boundary is either inside a text node, where the offset counts
 * characters, or inside an element, where it counts *children* — the two mean
 * different things, and conflating them is the classic way to be one out.
 */
export function textOffsetOf(
  host: HTMLElement,
  node: Node,
  offset: number,
): number | undefined {
  const before = textBefore(host, node);
  if (before === undefined) return undefined;

  if (node.nodeType === Node.TEXT_NODE) {
    return before + Math.min(Math.max(offset, 0), (node as Text).data.length);
  }

  let inside = 0;
  for (const child of [...node.childNodes].slice(0, Math.max(offset, 0))) {
    inside += lengthOf(child);
  }

  return before + inside;
}

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export function rangeOffsetsOf(
  host: HTMLElement,
  range: Range,
): TextRange | undefined {
  const start = textOffsetOf(host, range.startContainer, range.startOffset);
  const end = textOffsetOf(host, range.endContainer, range.endOffset);
  if (start === undefined || end === undefined) return undefined;

  return start <= end ? { start, end } : { start: end, end: start };
}

/**
 * What the user currently has selected inside `host`.
 *
 * A selection that is not in this field at all is nothing, rather than a range
 * at offset zero: acting on that would mark text the user never chose.
 */
export function selectionOffsetsIn(
  host: HTMLElement,
  selection: Selection | null,
): TextRange | undefined {
  if (selection === null || selection.rangeCount === 0) return undefined;

  const range = selection.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) return undefined;

  return rangeOffsetsOf(host, range);
}

/** A collapsed range at a text offset, clamped to the field. */
export function caretRangeAt(host: HTMLElement, offset: number): Range {
  const wanted = Math.max(0, Math.min(offset, lengthOf(host)));
  const range = host.ownerDocument.createRange();

  let seen = 0;
  const place = (current: Node): boolean => {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current as Text;
      if (wanted <= seen + text.data.length) {
        range.setStart(text, wanted - seen);
        range.collapse(true);
        return true;
      }
      seen += text.data.length;
      return false;
    }

    if (isBreak(current)) {
      // A `<br>` occupies the offset just before it, so a caret at that offset
      // belongs at the end of the line rather than at the start of the next.
      if (wanted <= seen) {
        range.setStartBefore(current);
        range.collapse(true);
        return true;
      }
      seen += 1;
      return false;
    }

    for (const child of current.childNodes) if (place(child)) return true;

    return false;
  };

  if (!place(host)) {
    // Nothing to land in: an empty field, or an offset past the last node.
    range.selectNodeContents(host);
    range.collapse(false);
  }

  return range;
}

/** Put the caret where a text offset says, after the value has been rewritten. */
export function placeCaretAt(host: HTMLElement, offset: number): void {
  selectRangeIn(host, offset, offset);
}

/**
 * Re-select a range of the field's text.
 *
 * A toolbar action rewrites the field's markup, which throws the selection
 * away; without putting it back, bold-then-italic over the same words would
 * take two selections instead of one.
 */
export function selectRangeIn(
  host: HTMLElement,
  start: number,
  end: number,
): void {
  const selection = host.ownerDocument.defaultView?.getSelection();
  if (selection === null || selection === undefined) return;

  const from = caretRangeAt(host, start);
  const to = caretRangeAt(host, end);
  const range = host.ownerDocument.createRange();
  range.setStart(from.startContainer, from.startOffset);
  range.setEnd(to.startContainer, to.startOffset);

  selection.removeAllRanges();
  selection.addRange(range);
}
