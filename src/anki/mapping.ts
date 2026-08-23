import type { CardDraft } from "@/core/draft";
import type { NoteType } from "@/core/note-type";
import { createNoteType, deriveNoteTypeKind } from "@/core/note-type";

import type { AnkiNote, TemplateMap } from "./types";

/**
 * `CardDraft` in, AnkiConnect's shapes out — and nothing else knows about
 * either half (P4). The editor never sees a request, and the wire format never
 * sees a Svelte component.
 */

/**
 * The draft's fields, verbatim.
 *
 * The adapter sends the note type's own fields and injects nothing: the source
 * URL and title are provenance the model keeps alongside the fields (3.6), and
 * writing them into a field the user did not fill would be the editor's
 * decision to make, not this layer's. Cloze markup is passed through untouched
 * — the braces are the note's content, and parsing them is the card model's
 * job (3.9).
 */
export function toAnkiNote(draft: CardDraft): AnkiNote {
  return {
    deckName: draft.deck,
    modelName: draft.noteType.name,
    fields: { ...draft.fields },
    tags: [...draft.tags],
    options: {
      // Duplicates are surfaced as a warning by `canAddNote` and never block
      // the add (4.4) — the user may genuinely want a near-duplicate — so the
      // request that follows their decision has to be allowed through.
      allowDuplicate: true,
      duplicateScope: "deck",
    },
  };
}

/**
 * Anki reads a note type as cloze from its templates, so this does too (4.6).
 *
 * A cloze template references the field through the `cloze` filter, which may
 * sit in a chain (`{{text:cloze:Text}}`) and has a `cloze-only` variant. A
 * field merely *named* something with "cloze" in it is not a match: the filter
 * is what precedes the field name, so the colon is what makes it one.
 */
const CLOZE_FILTER = /\{\{[^}]*\bcloze(?:-only)?:/i;

export function isClozeTemplateMap(templates: TemplateMap): boolean {
  return Object.values(templates).some((card) =>
    Object.values(card).some((side) => CLOZE_FILTER.test(side)),
  );
}

/**
 * A note-type descriptor the UI and the model can use as-is, so neither has to
 * re-derive the flavour.
 *
 * With templates, the flavour is read from them. Without — an older add-on, or
 * a `modelTemplates` call that failed — it falls back to M3's name heuristic,
 * which gets the built-in `Cloze` right and a custom one wrong. Falling back
 * is better than refusing the whole note-type list over one unreadable
 * template.
 */
export function toNoteType(
  name: string,
  fields: readonly string[],
  templates?: TemplateMap,
): NoteType {
  return createNoteType({
    name,
    fields,
    kind:
      templates === undefined
        ? deriveNoteTypeKind(name)
        : isClozeTemplateMap(templates)
          ? "cloze"
          : "standard",
  });
}
