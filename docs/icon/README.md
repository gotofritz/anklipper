# Anklipper icon — direction C (Data plate)

Chrome ground, black extended AK, magenta spine.

> **As landed.** The five cuts are in `public/icon/`; the 256px masters, this
> file, and the preview stayed here, out of the shipped bundle and out of the
> sources zip (`wxt.config.ts` excludes `docs/**`). The `wxt.config.ts`
> declaration below was **not** added: WXT discovers `public/icon/<size>.png`
> by itself, and a declaration can point at a file that is not there while
> discovery cannot. What discovery costs — a stray PNG in that directory
> silently becoming an icon — is held by
> `tests/manifest/generated-manifest.test.ts`, which pins the emitted set for
> both targets. Add the block back if you would rather say it out loud; it
> wins over discovery either way.

| file | use | artwork |
| --- | --- | --- |
| 128.png | store listing / install | full cut (AK + クリ) |
| 48.png | extensions page | full cut |
| 32.png | Windows / retina toolbar | simplified (AK, fatter spine, no kana) |
| 24.png | small toolbar | single A |
| 16.png | favicon / toolbar | single A, flat ground, normal width |

Three artworks, not one scaled: the kana disappears below ~40px and the
stacked AK closes up below ~28px, so the mark is redrawn at each threshold.
This is normal practice for an icon set and the reason the 16px still reads.

Drop into `public/icon/`. To declare them explicitly rather than let WXT
find them (see the note above):

```ts
manifest: {
  icons: {
    16: "icon/16.png",
    24: "icon/24.png",
    32: "icon/32.png",
    48: "icon/48.png",
    128: "icon/128.png",
  },
}
```

`base-*.png` are the 256px masters kept for re-cutting; don't ship them —
which is why they live here rather than in `public/`.
Source artwork: `Anklipper Icon Export.dc.html` in the design project.
