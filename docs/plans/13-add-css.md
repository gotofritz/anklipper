# tDR skin — how to land it

Branch suggestion: `feat/tdr-skin`

## 1. The stylesheet

Copy `tdr.css` to `src/entrypoints/sidepanel/tdr.css` and import it in
`src/entrypoints/sidepanel/main.ts`:

```ts
import { mount } from "svelte";
import App from "./App.svelte";
import "./tdr.css";
```

Everything is prefixed with `#app` on purpose. Svelte scopes each component's
own CSS as `fieldset.svelte-hash` — specificity (0,1,1) — which beats a bare
`fieldset`. The id gets (1,0,1) and wins, so **no component `<style>` block
needs editing and no `!important` appears anywhere**. If you later move the
mount point off `#app`, rename the prefix.

The whole skin rides on selectors your markup already has: `.top`, `h1`,
`p[role="status"]`, `.picker`, `.toolbar`, `button[aria-pressed]`, `.field`,
`.head`, `.tools`, `.rich`, `.warning`, `details.source`, `.actions`,
`.quiet`, `.problem`, `.prompt`, plus the ids `#landing`, `#landing-target`,
`#deck`, `#note-type`, `#new-tag`, `#cloze-ordinal`.

Two behaviours worth knowing:

- **Pressed states are CSS-only.** The toolbar's magenta underbar is
  `button[aria-pressed="true"]::after`; the pin's ■/□ is
  `.tools button:first-of-type::after`. You already set `aria-pressed` in both
  places, so nothing in Svelte changes.
- **Numeric labels come from `:has()`.** `01` is
  `fieldset:has(#landing) legend::before`, `02`/`03` are
  `.picker:has(#deck)` / `.picker:has(#note-type)`. Supported in every browser
  that ships MV3 side panels, but it does mean renaming an id renumbers the UI —
  if you'd rather not depend on that, pass an `ordinal` prop to `Picker` and
  render it, and swap those rules for `[data-ordinal]`.

## 2. Fonts (the one non-CSS bit)

MV3's CSP blocks `fonts.googleapis.com`, so the files have to ship with the
extension. Download and drop into `public/fonts/` (wxt copies `public/` to the
bundle root, so `/fonts/...` resolves):

- `Archivo-Variable.woff2` — from the Archivo repo (`google/fonts`, `ofl/archivo`).
  It carries the `wdth` axis, which is what makes the display type extended
  rather than merely bold. The `font-stretch: 62% 125%` descriptor in the
  `@font-face` is what unlocks `font-stretch: 125%` on `h1`.
- `IBMPlexMono-Regular.woff2`, `IBMPlexMono-SemiBold.woff2` — from
  `IBM/plex`.

If you'd rather not vendor fonts, delete the two `@font-face` blocks and set
`--sans: "Helvetica Neue", Helvetica, Arial, sans-serif`. You lose the extended
masthead (no width axis) and gain nothing else — Helvetica is period-correct
anyway.

## 3. Markup amends (small, all optional)

None of these are needed for the skin to work; they're the three places where
CSS alone can't reach.

**a. Uppercase without losing the accessible name.** Nothing to do — the skin
uses `text-transform`, so the DOM text is untouched.

**b. `Panel.svelte` — the status serial.** The strip's `RT/OK` marker is a
`::after` on `p[role="status"]`, i.e. decorative and fixed. If you want the real
endpoint or a build serial there, add a span the CSS can pick up:

```svelte
<p role="status">{label}<span class="serial">{serial}</span></p>
```

and replace the `p[role="status"]::after` rule with `.serial { float: right; opacity: .55 }`.

**c. `main::after` colophon.** Currently a hardcoded `content:` string
(`ANKLIPPER／0010 ■ ▲ ● NO IDLE HANDS`). If the version should be real, render a
footer element in `Panel.svelte` instead and move the rule onto it.

## 4. Test fallout to expect

Your component tests query by accessible name, so `text-transform` and
`::after` glyphs are invisible to them — those should all pass. Two spots to
check:

- `FieldEditor.svelte.test.ts` / `FormatToolbar.svelte.test.ts` — if anything
  asserts on visible text of the pin button, the name is still `Pin Front`; the
  □/■ is a pseudo-element and not in the accessibility tree.
- `TagEditor.svelte.test.ts` — the remove button's label is styled to
  `font-size: 0` with a `::after` glyph. The accessible name (`Remove politics`)
  is unchanged, but if a test asserts on *visible* text it will need a look.

## 5. Design reference

`Anklipper Sidebar.dc.html` in this project is the target rendering — open it
side by side while you diff.
