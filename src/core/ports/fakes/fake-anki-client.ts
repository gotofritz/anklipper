import type { CardDraft } from "../../draft";
import type { NoteType } from "../../note-type";
import { primaryFieldOf } from "../../note-type";
import type { Result } from "../../result";
import { err, ok } from "../../result";
import type {
  AnkiClient,
  AnkiConnection,
  AnkiError,
  AnkiHandshake,
  NoteId,
} from "../types";

export interface FakeAnkiClientOptions {
  readonly decks?: readonly string[];
  readonly noteTypes?: readonly NoteType[];
  /** Primary-field values Anki is pretending to hold already. */
  readonly duplicates?: readonly string[];
  /** What the version probe reports when the fake is not failing (4.9). */
  readonly apiVersion?: number;
  /** What the handshake answers, so M9 can test each branch of P9. */
  readonly handshake?: AnkiHandshake;
}

export interface FakeAnkiClient extends AnkiClient {
  /** Every draft the fake accepted, in order. */
  readonly added: readonly CardDraft[];
  /** How many times the handshake has been asked for. */
  readonly handshakes: { readonly count: number };
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
  const apiVersion = options.apiVersion ?? 6;
  const added: CardDraft[] = [];
  const handshakes = { count: 0 };
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
    handshakes,

    failWith(error: AnkiError | undefined): void {
      failure = error;
    },

    async probe(): Promise<AnkiConnection> {
      return failure === undefined
        ? { kind: "connected", apiVersion }
        : {
            kind: "unavailable",
            cause: failure,
            confident: true,
            alternatives: [],
          };
    },

    async requestPermission(): Promise<AnkiHandshake> {
      handshakes.count += 1;
      return options.handshake ?? { kind: "granted", apiVersion };
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

    /**
     * A duplicate does not refuse the add (4.4). `canAddNote` is what reports
     * it, and the user may genuinely want a near-duplicate — a fake that
     * blocked here would have every consumer above it build a block instead of
     * the warning the milestone pins. `failWith({kind: "duplicate-note"})`
     * still drives the refusing path for a caller that needs it.
     */
    async addNote(draft: CardDraft): Promise<Result<NoteId, AnkiError>> {
      const refused = refuse<NoteId>();
      if (refused) return refused;

      added.push(draft);
      duplicates.add(firstFieldOf(draft));
      return ok(added.length);
    },
  };
}
