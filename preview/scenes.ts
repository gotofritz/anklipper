import { createDraft } from "@/core/draft";
import type { CardDraft } from "@/core/draft";
import { createFakeAnkiClient } from "@/core/ports/fakes/fake-anki-client";
import { createFakeDraftStore } from "@/core/ports/fakes/fake-draft-store";
import { createFakeRememberedStore } from "@/core/ports/fakes/fake-remembered-store";
import type { AnkiError } from "@/core/ports/types";
import { BASIC, CLOZE, RECIPE, VOCAB } from "@/fixtures/note-types";
import type { DraftStatus, SidebarStatus } from "@/sidebar/connect";
import type Panel from "@/sidebar/Panel.svelte";
import type { ComponentProps } from "svelte";

type PanelProps = ComponentProps<typeof Panel>;

function draftOf(
  overrides: Partial<Parameters<typeof createDraft>[0]> = {},
): CardDraft {
  return createDraft({
    deck: "Geography::Europe",
    noteType: BASIC,
    fields: {
      Front: "Which city is the capital of France?",
      Back: "<b>Paris</b>, on the Seine.",
    },
    tags: ["europe", "capitals"],
    scratch:
      "Paris is the capital and most populous city of France, on the river Seine.",
    source: {
      text: "Paris is the capital and most populous city of France.",
      context: "France is a country in Western Europe.",
      url: "https://example.test/wiki/Paris",
      title: "Paris — Example Encyclopedia",
      heading: "Cities",
    },
    createdAt: "2026-01-01T12:00:00.000Z",
    generation: { name: "basic", version: 1 },
    ...overrides,
  });
}

/** A collection with enough in it that the filters and long names show. */
function collection(failure?: AnkiError) {
  const client = createFakeAnkiClient({
    decks: ["Default", "Geography::Europe", "Languages::French::Vocabulary"],
    noteTypes: [BASIC, VOCAB, CLOZE, RECIPE],
    tags: ["europe", "capitals", "geography", "politics", "revolutions"],
  });
  if (failure !== undefined) client.failWith(failure);
  return client;
}

function panel(
  draft: CardDraft | undefined,
  options: {
    readonly status?: SidebarStatus;
    readonly pending?: CardDraft;
    readonly failure?: AnkiError;
  } = {},
): PanelProps {
  const status: SidebarStatus = options.status ?? {
    kind: "connected",
    from: "background",
  };
  const capture: DraftStatus =
    draft === undefined
      ? { kind: "empty" }
      : { kind: "captured", draft, pending: options.pending };

  return {
    connect: async () => status,
    loadDraft: async () => capture,
    subscribe: () => () => {},
    openSettings: () => {},
    anki: collection(options.failure),
    drafts: createFakeDraftStore(draft),
    pending: createFakeDraftStore(options.pending),
    remembered: createFakeRememberedStore({
      lastDeck: "Geography::Europe",
      // Keyed by note type, then by field (10.6) — so the pin shows filled
      // on Basic's Back and nowhere else.
      sticky: { Basic: { Back: "<i>Example Encyclopedia</i>" } },
    }),
    version: "1.0.0",
    // The connection report's facts (M9). A fixed UUID: the real one is minted
    // per installation, and the point here is that the line is long enough to
    // wrap awkwardly if the skin lets it.
    describeAnki: async () => ({
      endpoint: "http://127.0.0.1:8765",
      origin: "moz-extension://11111111-2222-3333-4444-555555555555",
      apiKeyConfigured: false,
      timeoutMs: 5_000,
    }),
    copy: async () => {},
    grantAccess: async () => {
      // Nothing here can grant anything — the point is the button, and what
      // the panel looks like while it is on screen.
      window.alert("The real one asks the browser. This one cannot.");
      return false;
    },
  };
}

/**
 * The states worth looking at when the skin changes. Each is one URL:
 * `?scene=empty`. Keep them to states the CSS renders differently — a scene
 * that only differs in wording proves nothing a test does not already hold.
 */
export const SCENES: Record<string, { label: string; props: PanelProps }> = {
  card: { label: "A captured card", props: panel(draftOf()) },
  empty: { label: "Nothing captured yet", props: panel(undefined) },
  cloze: {
    label: "A cloze note type",
    props: panel(
      draftOf({
        noteType: CLOZE,
        fields: {
          Text: "The capital of France is {{c1::Paris}}, on the {{c2::Seine}}.",
          "Back Extra": "",
        },
      }),
    ),
  },
  long: {
    label: "A note type with many fields",
    props: panel(
      draftOf({
        noteType: RECIPE,
        fields: {
          Title: "Soupe à l’oignon",
          Ingredients: "Onions, butter, stock, bread, Gruyère.",
          Method: "Caramelise the onions slowly. Do not rush this part.",
          "Applies to": "",
        },
      }),
    ),
  },
  waiting: {
    label: "A second selection waiting",
    props: panel(draftOf(), {
      pending: draftOf({
        createdAt: "2026-01-01T12:05:00.000Z",
        source: {
          text: "Lyon is the third-largest city in France.",
          context: "France is a country in Western Europe.",
          url: "https://example.test/wiki/Lyon",
          title: "Lyon — Example Encyclopedia",
          heading: "Cities",
        },
      }),
    }),
  },
  permission: {
    label: "The host permission never granted",
    props: panel(draftOf(), {
      failure: {
        kind: "permission-missing",
        message: "no host permission for http://127.0.0.1:8765",
      },
    }),
  },
  offline: {
    label: "The background not answering",
    props: panel(draftOf(), {
      status: { kind: "unavailable", reason: "no-receiver" },
      failure: { kind: "anki-not-running", message: "nothing answered" },
    }),
  },
};

export const DEFAULT_SCENE = "card";
