import type { CaptureWarning, PageCapture } from "@/core/capture";
import {
  CONTEXT_CAP,
  HTML_CAP,
  SELECTION_CAP,
  capText,
  warn,
} from "@/core/capture";

/**
 * Extraction off a live page (5.1).
 *
 * `info.selectionText` from the context-menu event is truncated by the browser
 * and arrives with no surroundings at all, so the menu click is the trigger
 * and this is what actually reads the page. The `.dom` in the filename is the
 * repo's marker for a module that needs a document — its tests run in jsdom.
 */
export interface ExtractDeps {
  readonly document: Document;
  readonly window: Window;
}

/**
 * Elements that start a new line when a page is read aloud. Used for two
 * things: deciding where a line break belongs in the flattened text, and
 * picking the block whose text becomes the surrounding context (5.3).
 */
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

/**
 * How far up the tree the search for a block with text may go. A
 * framework-rewritten DOM nests wrappers with no text of their own, and
 * without a bound the fallback ends at `<body>` — which is the whole page,
 * not context.
 */
const CONTEXT_HOPS = 8;

function isBlock(element: Element): boolean {
  return BLOCK_TAGS.has(element.tagName);
}

function asElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

/** Collapse spaces and tabs, keep the line breaks the blocks earned (5.2). */
function tidy(value: string): string {
  return value
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

/**
 * Flatten a fragment to text. Anki fields accept HTML, but round-tripping page
 * markup into a card produces junk far more often than value (5.2), so the
 * markup decides only where the line breaks go.
 */
function flatten(node: Node, into: string[]): void {
  if (node.nodeType === 3) {
    into.push((node as Text).data);
    return;
  }
  if (node.nodeType !== 1 && node.nodeType !== 11) return;

  const element = node.nodeType === 1 ? (node as Element) : undefined;
  if (element?.tagName === "BR") {
    into.push("\n");
    return;
  }
  // Anything the page does not render is not part of the selection's text.
  if (
    element &&
    (element.tagName === "SCRIPT" || element.tagName === "STYLE")
  ) {
    return;
  }

  const breaks = element !== undefined && isBlock(element);
  if (breaks) into.push("\n");
  for (const child of Array.from(node.childNodes)) flatten(child, into);
  if (breaks) into.push("\n");
}

function fragmentToText(fragment: DocumentFragment): string {
  const parts: string[] = [];
  flatten(fragment, parts);
  return tidy(parts.join(""));
}

function fragmentToHtml(fragment: DocumentFragment, doc: Document): string {
  const holder = doc.createElement("div");
  holder.append(fragment.cloneNode(true));
  return holder.innerHTML;
}

/**
 * The block whose text is the context (5.3). A block ancestor beats a
 * character window because it respects the document's structure instead of
 * slicing mid-sentence; one with no text of its own is a wrapper, not context.
 */
function contextBlock(range: Range): Element | null {
  let element = asElement(range.commonAncestorContainer);

  for (let hop = 0; element && hop < CONTEXT_HOPS; hop += 1) {
    if (isBlock(element) && (element.textContent ?? "").trim() !== "") {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

/** The nearest `h1`–`h6` before the selection, however much sits between. */
function precedingHeading(doc: Document, range: Range): string {
  const start = range.startContainer;
  let heading = "";

  for (const candidate of Array.from(
    doc.querySelectorAll("h1, h2, h3, h4, h5, h6"),
  )) {
    const position = candidate.compareDocumentPosition(start);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      heading = tidy(candidate.textContent ?? "");
    } else {
      break;
    }
  }
  return heading;
}

/** `getSelection()` does not reach into a shadow root, open or closed. */
function touchesShadowRoot(range: Range): boolean {
  const root = asElement(range.commonAncestorContainer);
  if (!root) return false;
  if (root.shadowRoot) return true;

  return Array.from(root.querySelectorAll("*")).some(
    (element) => element.shadowRoot !== null && range.intersectsNode(element),
  );
}

/** A cross-origin frame is a separate context; reading it throws. */
function hasUnreadableFrame(doc: Document): boolean {
  return Array.from(doc.querySelectorAll("iframe, frame")).some((frame) => {
    try {
      return (frame as HTMLIFrameElement).contentDocument === null;
    } catch {
      return true;
    }
  });
}

function firstRange(win: Window): Range | undefined {
  const selection = win.getSelection();
  if (!selection || selection.rangeCount === 0) return undefined;
  return selection.getRangeAt(0);
}

/**
 * Read the current selection and everything the card model wants around it.
 *
 * Never throws and never returns nothing: a blind spot becomes a warning
 * naming what could not be captured (5.4), and the caller still gets a
 * capture it can degrade a draft from.
 */
export function extractCapture(deps: ExtractDeps): PageCapture {
  const { document: doc, window: win } = deps;
  const warnings: CaptureWarning[] = [];
  const page = { title: doc.title, url: win.location.href };

  const range = firstRange(win);
  if (!range) {
    return { text: "", html: "", context: "", heading: "", ...page, warnings };
  }

  const contents = range.cloneContents();
  const selection = capText(fragmentToText(contents), SELECTION_CAP);
  if (selection.truncated) {
    warnings.push(
      warn(
        "selection-truncated",
        `only the first ${SELECTION_CAP} characters of the selection were captured`,
      ),
    );
  }

  // The markup is worth keeping (5.2) but not at any size: this crosses a
  // message boundary, and an unbounded fragment is the one that breaks it.
  const markup = fragmentToHtml(contents, doc);
  const html = markup.length <= HTML_CAP ? markup : "";
  if (html === "" && markup !== "") {
    warnings.push(
      warn("html-dropped", "the selected markup was too large to keep"),
    );
  }

  if (selection.text === "") {
    if (touchesShadowRoot(range)) {
      warnings.push(
        warn(
          "shadow-dom",
          "the selection is inside a shadow root, which the page script cannot read",
        ),
      );
    } else if (hasUnreadableFrame(doc)) {
      warnings.push(
        warn(
          "cross-origin-frame",
          "the selection is inside a frame from another site, which the page script cannot read",
        ),
      );
    }
  }

  const block = contextBlock(range);
  const context = capText(tidy(block?.textContent ?? ""), CONTEXT_CAP);
  if (context.truncated) {
    warnings.push(
      warn(
        "context-truncated",
        `only the first ${CONTEXT_CAP} characters of the surrounding text were captured`,
      ),
    );
  } else if (context.text === "" && selection.text !== "") {
    warnings.push(
      warn(
        "context-unavailable",
        "nothing around the selection carried text to use as context",
      ),
    );
  }

  return {
    text: selection.text,
    html,
    context: context.text,
    heading: precedingHeading(doc, range),
    ...page,
    warnings,
  };
}
