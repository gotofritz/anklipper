import type { CardDraft } from "@/core/draft";
import { generateBasicCard } from "@/core/generate";
import type { NoteType, NoteTypeKind } from "@/core/note-type";
import type {
  AnkiClient,
  AnkiConnection,
  AnkiError,
  AnkiHandshake,
} from "@/core/ports/types";

import type { AnkiClientConfig, AnkiDiagnostics } from "./client";
import { createAnkiClient, describeAnkiConnection } from "./client";

/**
 * A hand-driven harness for the manual checks M4's plan asks for.
 *
 * The adapter's automated tests run against a stubbed `fetch`, which proves
 * every branch and proves nothing about the add-on. The remaining questions —
 * whether a `no-cors` request really separates a dead port from a rejected
 * origin on Firefox, whether the origin reported is the one AnkiConnect
 * accepts, what Anki actually says when a cloze note has no deletions — can
 * only be answered from a real extension origin against a real Anki. This is
 * what the background console drives to answer them.
 *
 * Development builds only: `src/entrypoints/background.ts` guards the wiring
 * behind `import.meta.env.DEV`, so nothing here reaches a release.
 */
export interface DevHarnessDeps extends Omit<
  AnkiClientConfig,
  "hasHostPermission"
> {
  readonly hasHostPermission: () => Promise<boolean>;
  /** Injected by the tests; production wiring lets the harness build its own. */
  readonly client?: AnkiClient;
}

/** A note type flattened to the three things the manual checks care about. */
export interface NoteTypeReport {
  readonly name: string;
  readonly kind: NoteTypeKind;
  readonly fields: readonly string[];
}

export interface SurveyFailure {
  readonly step: string;
  readonly error: AnkiError;
}

/**
 * Everything the read-only sweep could establish. Safe to paste into an issue:
 * it carries the origin, which the user needs, and no API key, which nobody
 * does (4.8).
 */
export interface Survey {
  readonly origin: string;
  readonly hostPermission: boolean;
  readonly connection: AnkiConnection;
  readonly diagnostics: AnkiDiagnostics;
  readonly decks?: readonly string[];
  readonly noteTypes?: readonly NoteTypeReport[];
  /** Split out because 4.6's check is "is the custom one in this list". */
  readonly clozeNoteTypes?: readonly string[];
  readonly failures: readonly SurveyFailure[];
}

/**
 * Sample drafts, so the console never has to hand-build a `CardDraft`.
 *
 * Built through `generateBasicCard`, the path M5 will feed, so a manual add
 * exercises generation and the adapter rather than a shape invented here.
 */
export interface SampleDrafts {
  basic(deck: string, noteType: NoteType): CardDraft;
  cloze(deck: string, noteType: NoteType): CardDraft;
}

export interface DevHarness {
  readonly client: AnkiClient;
  readonly origin: string;
  readonly drafts: SampleDrafts;
  diagnostics(): AnkiDiagnostics;
  probe(): Promise<AnkiConnection>;
  requestPermission(): Promise<AnkiHandshake>;
  /** Permission, probe, decks, note types. Writes nothing. */
  survey(): Promise<Survey>;
}

/** Every sample carries it, so a manual run is one search away in Anki. */
export const MANUAL_CHECK_TAG = "anklipper-manual-check";

const SAMPLE_TEXT = "the capital of France is Paris";
const SAMPLE_CLOZE = "the capital of {{c1::France}} is Paris";
const SAMPLE_CONTEXT = {
  surroundingText: "A paragraph about France, kept as the draft's context.",
  url: "https://example.test/anklipper-manual-check",
  title: "Anklipper manual check",
};

export function createDevHarness(deps: DevHarnessDeps): DevHarness {
  const { client: injected, ...config } = deps;
  const client = injected ?? createAnkiClient(config);

  function sample(deck: string, noteType: NoteType, text: string): CardDraft {
    return generateBasicCard({ text }, SAMPLE_CONTEXT, {
      deck,
      noteType,
      tags: [MANUAL_CHECK_TAG],
    });
  }

  return {
    client,
    origin: config.origin,

    drafts: {
      basic: (deck, noteType) => sample(deck, noteType, SAMPLE_TEXT),
      cloze: (deck, noteType) => sample(deck, noteType, SAMPLE_CLOZE),
    },

    diagnostics: () => describeAnkiConnection(config),
    probe: () => client.probe(),
    requestPermission: () => client.requestPermission(),

    async survey(): Promise<Survey> {
      const failures: SurveyFailure[] = [];
      const hostPermission = await deps.hasHostPermission();

      // The harness reports the permission, so it acts on it too rather than
      // probing anyway and hoping the client says the same thing.
      const connection: AnkiConnection = hostPermission
        ? await client.probe()
        : {
            kind: "unavailable",
            cause: {
              kind: "permission-missing",
              message: `the extension has not been granted access to ${describeAnkiConnection(config).endpoint}`,
            },
            confident: true,
            alternatives: [],
          };

      const head = {
        origin: config.origin,
        hostPermission,
        connection,
        diagnostics: describeAnkiConnection(config),
      };

      // Past this point every call would fail the same way, and four copies of
      // one cause is noise rather than evidence.
      if (connection.kind !== "connected") return { ...head, failures };

      const decks = await client.deckNames();
      if (!decks.ok) failures.push({ step: "deckNames", error: decks.error });

      const noteTypes = await client.noteTypes();
      if (!noteTypes.ok) {
        failures.push({ step: "noteTypes", error: noteTypes.error });
      }

      const reports = noteTypes.ok
        ? noteTypes.value.map(({ name, kind, fields }) => ({
            name,
            kind,
            fields,
          }))
        : undefined;

      return {
        ...head,
        ...(decks.ok ? { decks: decks.value } : {}),
        ...(reports === undefined
          ? {}
          : {
              noteTypes: reports,
              clozeNoteTypes: reports
                .filter((one) => one.kind === "cloze")
                .map((one) => one.name),
            }),
        failures,
      };
    },
  };
}
