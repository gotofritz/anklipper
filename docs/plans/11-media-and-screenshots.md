# M11 — Media and screenshots

Index: `00-plan.md`. Depends on: M10. Blocks: M12.

## Goal

Put pictures on cards. The primary case is a **screenshot of part of the
page** — drag a rectangle, get an image in a field. Secondary: an image
already on the page, and an image pasted or dropped into a field.

Text-only capture covers a lot, but a diagram, a chart, or a code block that
reads badly as text is exactly when a card most needs an image.

## Non-goals

Full-page or scroll-and-stitch capture: `captureVisibleTab` returns the
rendered viewport, so anything below the fold needs scrolling and seam
handling. Region-within-the-viewport first; revisit stitching on evidence
that it is wanted.

Audio and video. Occlusion-style image editing (arrows, boxes, redaction) —
possibly worth its own plan later, definitely not here.

**LaTeX and MathJax are not in this project.** Not deferred, not out of
scope for now — not planned. Do not add buttons, parsing, or rendering for
them.

## Decisions this milestone pins

| # | Decision | Note |
|---|----------|------|
| 11.1 | Screenshots come from **`tabs.captureVisibleTab`**, cropped client-side to the user's rectangle | Keeps the permission ceiling intact: `activeTab` already covers it, so no new host permission and no `<all_urls>`. Verify the Firefox behaviour in this milestone rather than assuming parity. |
| 11.2 | Region selection is a **content-script overlay** driven by the user's drag | The same injection-on-gesture path M5 already uses. |
| 11.3 | Media is **uploaded at submit, never at insert** | A cancelled or abandoned draft must leave nothing in the user's media folder. Anki's media folder has no per-note ownership, so anything uploaded early becomes an orphan only "Check Media" will find. |
| 11.4 | Filenames are **collision-resistant**, derived from the image's content hash | The media folder is flat and global. `screenshot.png` from two different pages is a silent overwrite of someone's existing file. |
| 11.5 | The user **sees the image before it is attached** | A viewport screenshot catches whatever else was on screen. Attaching unseen is how private content ends up in a shared deck. |
| 11.6 | Uploads go through **`storeMediaFile`**, and the field references the returned filename | Verify the action's exact parameters — base64 `data` versus a `url` the add-on fetches itself — against a real installation. If `url` works, an image already on the page needs no fetch from the extension at all, and no host permission for its origin. |
| 11.7 | Image markup is subject to **10.5's sanitiser** like any other field content | An `<img>` is still HTML going into a collection. Allow the tag and its geometry; nothing else. |

## Deliverables

* Context-menu entry to capture a region, and a keyboard shortcut.
* Drag-to-select overlay with a cancel path (Escape, right-click, blur).
* Crop and encode from the captured viewport image.
* Preview in the sidebar before the image is committed to a field.
* Insert into the focused field at the caret, as an `<img>`.
* Context-menu entry on an existing page image.
* Paste and drop an image into a field.
* Adapter: `storeMediaFile` plus whatever the verification in 11.6 settles.
* Draft persistence extended to carry pending image data until submit.

## Tests to write first

1. A crop rectangle produces an image of the expected dimensions from a
   fixture capture.
2. A cancelled overlay attaches nothing and leaves no pending media.
3. Inserting an image puts an `<img>` at the caret in the focused field.
4. Nothing is uploaded until submit — asserted at the adapter, with a draft
   that is edited and then abandoned.
5. Submitting uploads each pending image once and rewrites the field to the
   returned filenames.
6. Two different images never produce the same filename; the same image
   twice does not upload twice.
7. A failed upload leaves the draft intact and retryable, per 7.2, with the
   image still attached.
8. A pasted image follows the same path as a captured one.
9. Sanitisation strips everything on an `<img>` except the allowed
   attributes.

## Done when

* A region screenshot from a real page appears on a real card in Anki.
* An abandoned draft leaves no file in the media folder — checked by
  inspecting it, not by trusting the code path.
* Anki's *Check Media* reports no unused files after a normal session.
* The permission set is unchanged from M2, or the addition is justified in
  this subplan (see the storage risk below).

## Risks

* **Draft storage quota.** Screenshots are orders of magnitude larger than
  text, and 7.1 persists the draft continuously. If `storage.local` proves
  too small, the options are storing image data outside the draft record,
  or requesting `unlimitedStorage` — which is a permission-ceiling change
  and needs justifying here before it is taken.
* **Capture timing.** `captureVisibleTab` grabs whatever is rendered when it
  fires. An overlay drawn for region selection must not appear in its own
  screenshot; capture before drawing, or hide and re-capture.
* **Cross-origin images.** Reading a page image through a canvas taints it
  for a cross-origin source. 11.6's `url` path avoids the problem entirely
  by letting Anki fetch it — which is the reason to verify that first.
* **Scope creep into an image editor.** Cropping is capture. Arrows, boxes,
  and occlusion are a different product; they do not enter here.
