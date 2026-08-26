import { describe, expect, it } from "vitest";

import { CAPTURE_SHORTCUT } from "@/manifest/manifest";

import type { EditorCommand, KeyChord } from "./shortcuts";
import { SHORTCUT_DOCS, SHORTCUT_HINTS, commandFor } from "./shortcuts";

function press(chord: Partial<KeyChord>): EditorCommand | undefined {
  return commandFor({ key: "", ctrlKey: false, ...chord });
}

describe("1. Anki's own chords (10.7)", () => {
  it.each([
    ["bold", { key: "b", ctrlKey: true }],
    ["italic", { key: "i", ctrlKey: true }],
    ["underline", { key: "u", ctrlKey: true }],
    ["subscript", { key: "=", ctrlKey: true }],
    ["superscript", { key: "=", ctrlKey: true, shiftKey: true }],
    ["cloze", { key: "c", ctrlKey: true, shiftKey: true }],
    ["cloze-group", { key: "c", ctrlKey: true, shiftKey: true, altKey: true }],
    ["source", { key: "x", ctrlKey: true, shiftKey: true }],
    ["submit", { key: "Enter", ctrlKey: true }],
  ] as const)("%s", (command, chord) => {
    expect(press(chord)).toBe(command);
  });

  it("takes the command key too, for a Mac", () => {
    expect(press({ key: "b", metaKey: true })).toBe("bold");
  });

  it("reads superscript from the key a shifted `=` produces", () => {
    expect(press({ key: "+", ctrlKey: true, shiftKey: true })).toBe(
      "superscript",
    );
  });

  it("is not case-sensitive, since Shift changes the letter", () => {
    expect(press({ key: "B", ctrlKey: true })).toBe("bold");
  });
});

describe("2. what it deliberately does not claim", () => {
  it("ignores a plain letter, which is someone typing", () => {
    expect(press({ key: "b" })).toBeUndefined();
  });

  it("ignores a modifier combination Anki does not use", () => {
    expect(press({ key: "b", ctrlKey: true, altKey: true })).toBeUndefined();
  });

  // Anki clears formatting with Ctrl+R, which is the browser's reload. 10.7
  // matches Anki only where there is no collision, so this one stays on the
  // toolbar button and nowhere else.
  it("leaves Ctrl+R to the browser", () => {
    expect(press({ key: "r", ctrlKey: true })).toBeUndefined();
  });

  it("does not confuse cloze with its grouping variant", () => {
    expect(press({ key: "c", ctrlKey: true })).toBeUndefined();
  });
});

describe("3. what the buttons are labelled with", () => {
  it("names a chord for every command it binds", () => {
    for (const [command, hint] of Object.entries(SHORTCUT_HINTS)) {
      expect(hint, command).toMatch(/Ctrl/);
    }
  });
});

/**
 * M9. A chord that is only in a `title` attribute is documented to whoever
 * hovers it and to nobody else. This is the list the options page renders.
 */
describe("4. the shortcuts, written down", () => {
  it("documents every chord the editor binds", () => {
    const documented = SHORTCUT_DOCS.map((one) => one.keys);

    for (const [command, hint] of Object.entries(SHORTCUT_HINTS)) {
      expect(documented, command).toContain(hint);
    }
  });

  it("documents the capture shortcut, which is not the editor's", () => {
    expect(SHORTCUT_DOCS.map((one) => one.keys)).toContain(CAPTURE_SHORTCUT);
  });

  it("says what each one does, rather than listing keys alone", () => {
    for (const entry of SHORTCUT_DOCS) {
      expect(entry.description.length, entry.keys).toBeGreaterThan(0);
    }
  });

  it("names no chord twice", () => {
    const keys = SHORTCUT_DOCS.map((one) => one.keys);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
