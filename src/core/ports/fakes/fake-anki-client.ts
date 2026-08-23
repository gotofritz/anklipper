import type { CardDraft } from "../../draft";
import type { NoteType } from "../../note-type";
import { primaryFieldOf } from "../../note-type";
import type { Result } from "../../result";
import { err, ok } from "../../result";
import type { AnkiClient, AnkiError, NoteId } from "../types";

export interface FakeAnkiClientOptions {
  readonly decks?: readonly string[];
  readonly noteTypes?: readonly NoteType[];
  /** Primary-field values Anki is pretending to hold already. */
  readonly duplicates?: readonly string[];
}

export interface FakeAnkiClient extends AnkiClient {
  /** Every draft the fake accepted, in order. */
  readonly added: readonly CardDraft[];
  /** Drive the fake into failure, or out of it again with `undefined`. */
  failWith(error: AnkiError | undefined): void;
}

/**
 * An in-memory `AnkiClient`. Every consumer above the adapter tests against
 * this rather than a running Anki — including its error paths, which is why
 * the fake can be told to fail (3.5).
 */
export function createFakeAnkiClient(
  options: FakeAnkiClientOptions = {},
): FakeAnkiClient {
  const decks = [...(options.decks ?? ["Default"])];
  const noteTypes = [...(options.noteTypes ?? [])];
  const duplicates = new Set(options.duplicates ?? []);
  const added: CardDraft[] = [];
  let failure: AnkiError | undefined;

  function refuse<T>(): Result<T, AnkiError> | undefined {
    return failure === undefined ? undefined : err(failure);
  }

  function firstFieldOf(draft: CardDraft): string {
    const primary = primaryFieldOf(draft.noteType);
    return primary === undefined ? "" : (draft.fields[primary] ?? "");
  }

  return {
    added,

    failWith(error: AnkiError | undefined): void {
      failure = error;
    },

    async deckNames(): Promise<Result<readonly string[], AnkiError>> {
      return refuse<readonly string[]>() ?? ok(decks);
    },

    async noteTypes(): Promise<Result<readonly NoteType[], AnkiError>> {
      return refuse<readonly NoteType[]>() ?? ok(noteTypes);
    },

    async canAddNote(draft: CardDraft): Promise<Result<boolean, AnkiError>> {
      return refuse<boolean>() ?? ok(!duplicates.has(firstFieldOf(draft)));
    },

    async addNote(draft: CardDraft): Promise<Result<NoteId, AnkiError>> {
      const refused = refuse<NoteId>();
      if (refused) return refused;

      const first = firstFieldOf(draft);
      if (duplicates.has(first)) {
        return err({
          kind: "duplicate-note",
          message: `a note with the first field "${first}" already exists`,
        });
      }

      added.push(draft);
      duplicates.add(first);
      return ok(added.length);
    },
  };
}
