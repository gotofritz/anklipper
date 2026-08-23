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
    },
    createdAt: now().toISOString(),
    generation: BASIC_GENERATOR,
  });
}
