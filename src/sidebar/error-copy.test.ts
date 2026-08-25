import { describe, expect, it } from "vitest";

import type { ClozeIssueCode } from "@/core/cloze";
import type { DraftIssueCode } from "@/core/draft";
import type { AnkiErrorKind, StoreErrorKind } from "@/core/ports/types";
import type { SettingsIssueCode } from "@/core/settings";

import {
  ankiErrorCopy,
  clozeIssueCopy,
  draftIssueCopy,
  draftStoreErrorCopy,
  settingsIssueCopy,
} from "./error-copy";

/**
 * The taxonomies as the layers below declare them. A kind missing here still
 * cannot slip through — the tables are keyed by the union, so leaving one out
 * is a type error — but the loops below are what prove each entry says
 * something, rather than being a placeholder.
 */
const ANKI_KINDS: readonly AnkiErrorKind[] = [
  "anki-not-running",
  "addon-missing",
  "permission-missing",
  "api-key-required",
  "malformed-response",
  "duplicate-note",
  "unknown-deck",
  "unknown-note-type",
  "unknown-field",
  "timeout",
  "api-error",
];

const CLOZE_CODES: readonly ClozeIssueCode[] = [
  "cloze-range-invalid",
  "cloze-ordinal-invalid",
  "cloze-overlap",
  "cloze-markup-malformed",
  "cloze-markup-unstable",
];

const DRAFT_CODES: readonly DraftIssueCode[] = [
  "deck-missing",
  "note-type-missing",
  "unknown-field",
  "field-required",
  "tag-malformed",
  "cloze-no-deletions",
  "cloze-markup-malformed",
  "note-type-not-cloze",
  "note-type-not-standard",
];

describe("what to tell the user about an AnkiConnect failure", () => {
  it("gives every cause both a cause and a next action", () => {
    for (const kind of ANKI_KINDS) {
      const copy = ankiErrorCopy({ kind, message: "whatever Anki said" });

      expect(copy.cause, kind).not.toBe("");
      expect(copy.action, kind).not.toBe("");
    }
  });

  // 6.4 and M4's taxonomy exist because each cause has a different fix. One
  // shared sentence would put them straight back into "something went wrong".
  it("says something different about each cause", () => {
    const causes = ANKI_KINDS.map(
      (kind) => ankiErrorCopy({ kind, message: "whatever Anki said" }).cause,
    );

    expect(new Set(causes).size).toBe(ANKI_KINDS.length);
  });

  it("names the fix for a missing add-on and for a closed Anki separately", () => {
    const closed = ankiErrorCopy({
      kind: "anki-not-running",
      message: "connection refused",
    });
    const missing = ankiErrorCopy({
      kind: "addon-missing",
      message: "not AnkiConnect",
    });

    expect(closed.action).toMatch(/start anki/i);
    expect(missing.action).toMatch(/add-on/i);
  });

  // The add-on's error strings are the only information an API-level failure
  // carries, so a cause that dropped them would be worse than useless.
  it("keeps Anki's own words when there is nothing more specific", () => {
    const copy = ankiErrorCopy({
      kind: "api-error",
      message: "collection is not open",
    });

    expect(copy.cause).toContain("collection is not open");
  });
});

describe("what to tell the user about a refused cloze edit", () => {
  it("explains every way a deletion can be refused", () => {
    for (const code of CLOZE_CODES) {
      expect(clozeIssueCopy({ code, message: "raw" }), code).not.toBe("");
    }
  });

  it("names the deletion the selection collided with", () => {
    const copy = clozeIssueCopy({
      code: "cloze-overlap",
      message: "the range overlaps the deletion c2",
      ordinal: 2,
    });

    expect(copy).toContain("c2");
  });

  it("asks for a selection when there is none to mark", () => {
    const copy = clozeIssueCopy({
      code: "cloze-range-invalid",
      message: "4–4 is not a range within the field",
    });

    expect(copy).toMatch(/select/i);
  });
});

describe("what to tell the user about an invalid draft", () => {
  it("explains every issue the card model reports", () => {
    for (const code of DRAFT_CODES) {
      expect(draftIssueCopy({ code, message: "raw" }), code).not.toBe("");
    }
  });

  it("names the field that may not be empty", () => {
    const copy = draftIssueCopy({
      code: "field-required",
      message: "Front may not be empty",
      field: "Front",
    });

    expect(copy).toContain("Front");
  });

  it("says why a tag with a space in it is not one tag", () => {
    const copy = draftIssueCopy({
      code: "tag-malformed",
      message: '"two words" is not a tag Anki can store',
      tag: "two words",
    });

    expect(copy).toMatch(/space/i);
    expect(copy).toContain("two words");
  });
});

/**
 * 7.1's failure. An edit that was not stored looks exactly like one that was,
 * so the user has to be told in the same terms as any other cause.
 */
describe("what to tell the user about a draft that was not stored", () => {
  const STORE_KINDS: readonly StoreErrorKind[] = [
    "read-failed",
    "write-failed",
    "malformed-stored-value",
  ];

  it("explains every kind the store reports", () => {
    for (const kind of STORE_KINDS) {
      expect(draftStoreErrorCopy({ kind, message: "raw" }), kind).not.toBe("");
    }
  });

  it("says what to do about a browser that would not store it", () => {
    expect(
      draftStoreErrorCopy({ kind: "write-failed", message: "quota" }),
    ).toMatch(/add it now|browser/i);
  });
});

/**
 * M8's settings form. The same cause-and-action rule as everything else here:
 * a field the user cannot save has to say which one and why.
 */
describe("what to tell the user about a setting they cannot save", () => {
  const SETTINGS_CODES: readonly SettingsIssueCode[] = [
    "deck-missing",
    "endpoint-invalid",
    "timeout-invalid",
    "tag-malformed",
    "mapping-unknown-field",
  ];

  it("explains every code the settings validator reports", () => {
    for (const code of SETTINGS_CODES) {
      expect(settingsIssueCopy({ code, message: "raw" }), code).not.toBe("");
    }
  });

  it("names the field a mapping points at that does not exist", () => {
    expect(
      settingsIssueCopy({
        code: "mapping-unknown-field",
        message: "raw",
        field: "Nowhere",
      }),
    ).toContain("Nowhere");
  });

  it("names the tag Anki could not store", () => {
    expect(
      settingsIssueCopy({
        code: "tag-malformed",
        message: "raw",
        tag: "two words",
      }),
    ).toContain("two words");
  });

  it("never repeats an API key back, whatever the issue says", () => {
    expect(
      settingsIssueCopy({ code: "endpoint-invalid", message: "s3cret" }),
    ).not.toContain("s3cret");
  });
});
