import type { PageCapture } from "./capture";
import type { CardDraft, GenerationMetadata } from "./draft";
import { createDraft } from "./draft";
import type { NoteType } from "./note-type";
import { primaryFieldOf } from "./note-type";

/**
 * Deterministic generation (P6): selected text plus page context to a
 * `CardDraft`. No AI, no network, no browser — M5 does the extracting and
 * hands the result in.
 */
export interface TextSelection {
  /** The selection exactly as the page gave it up. */
  readonly text: string;
}

export interface PageContext {
  readonly surroundingText: string;
  readonly url: string;
  readonly title: string;
  readonly heading?: string;
  readonly html?: string;
}

export interface GenerationDefaults {
  readonly deck: string;
  readonly noteType: NoteType;
  readonly tags?: readonly string[];
}

export interface GenerationOptions {
  /** Injected so a draft's timestamp is testable. */
  readonly now?: () => Date;
}

export const BASIC_GENERATOR: GenerationMetadata = {
  name: "basic",
  version: 1,
};

/**
 * The selection becomes the note type's primary field — `Front` on Basic,
 * `Text` on Cloze — and the rest is left for the user. The source is kept
 * verbatim alongside, so provenance survives however the fields are edited
 * (3.6).
 */
export function generateBasicCard(
  selection: TextSelection,
  context: PageContext,
  defaults: GenerationDefaults,
  options: GenerationOptions = {},
): CardDraft {
  const primary = primaryFieldOf(defaults.noteType);
  const now = options.now ?? (() => new Date());

  return createDraft({
    deck: defaults.deck,
    noteType: defaults.noteType,
    fields: primary === undefined ? {} : { [primary]: selection.text.trim() },
    tags: defaults.tags,
    source: {
      text: selection.text,
      context: context.surroundingText,
      url: context.url,
      title: context.title,
      ...(context.heading === undefined ? {} : { heading: context.heading }),
      ...(context.html === undefined ? {} : { html: context.html }),
    },
    createdAt: now().toISOString(),
    generation: BASIC_GENERATOR,
  });
}

/**
 * The M5 path: one capture off a page becomes a draft (5.1). The same
 * generator as above — this only unpacks the capture into it, and carries the
 * capture's warnings along so the editor can show what could not be read
 * (5.4).
 */
export function generateFromCapture(
  capture: PageCapture,
  defaults: GenerationDefaults,
  options: GenerationOptions = {},
): CardDraft {
  const draft = generateBasicCard(
    { text: capture.text },
    {
      surroundingText: capture.context,
      url: capture.url,
      title: capture.title,
      heading: capture.heading,
      html: capture.html,
    },
    defaults,
    options,
  );

  return capture.warnings.length === 0
    ? draft
    : {
        ...draft,
        generation: { ...draft.generation, warnings: capture.warnings },
      };
}
