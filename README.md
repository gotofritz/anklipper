# Anklipper

Anklipper is a browser add-on that turns text you find while reading into
Anki flashcards. Highlight something on a page, right-click, and the card is
ready for you to check and save — without leaving the page or opening Anki.

> **Building or contributing?** Start with the
> [developer guide](docs/developer-guide.md).

## Status

Anklipper is being built and is **not ready to install yet**. This page
describes what it will do. There is nothing to download at the moment.

## What it does

1. You select some text on a page.
2. You right-click and choose **Create Anki Card** — or press
   **Alt+Shift+A**, which does the same thing.
3. A panel opens at the side of your browser with the card already filled in.
4. You change anything you like — the wording, the deck, the type of card,
   the tags.
5. You click add, and the card goes straight into Anki.

Anklipper also keeps a note of where the text came from. If your cards have a
field for it, you can have the page title or its address written straight into
that field — see **Settings** below.

## Writing the card

The panel works the way Anki's own card editor does, with one thing Anki does
not have.

**The box at the top holds what you selected.** It is plain text, you can edit
it, and — this is the point — **it does not change when you change the type of
card**. Different card types have different fields with different names, so
switching from one to another cannot always carry what you had typed. The box
at the top is never a field, so nothing can move it.

To fill a field from it: select the part you want, pick the field from the
**Send to** menu, and press **Add to field** or **Replace field**. Adding puts
it where you last had the cursor in that field; replacing overwrites whatever
was there. With nothing selected, the whole box is sent. **Add to field** is
greyed out while the field is empty, because adding to an empty field and
replacing it come to the same thing.

If you change card type and a field's contents cannot come with it, Anklipper
says so and keeps them — switch back and they are there again.

**Every kind of card you have.** Whatever note types are in your collection
are in the list, with all of their fields, in the order you put them in. If
you have a lot of decks or note types, there is a box above each list to
narrow it down.

**Formatting.** Buttons above the fields give you bold, italic, underline,
superscript and subscript, and one to strip formatting off again. They work on
whatever you have selected, and the usual keys work too: **Ctrl+B**,
**Ctrl+I**, **Ctrl+U**. What you see is what ends up in Anki.

**The HTML button** next to a field shows you what is really in it, as text
you can edit. Useful for tidying up a fill-in-the-blank, or fixing anything
the buttons got wrong.

**The Pin button** next to a field keeps whatever is in it for your next card.
Handy when you are making several cards off one page and they all want the
same source or the same note in the back field. Press it again to stop.

**Tags** offer the tags already in your collection as you type, and still
accept anything new you want to type instead.

If Anki already has a card starting with the same thing, that field is
highlighted so you can see it. You can still add the card — sometimes two
similar cards is exactly what you want.

If you want a fill-in-the-blank card instead, press **Convert to cloze**.
Select each word or phrase you want hidden and press **Mark selection** — or
**Ctrl+Shift+C** — and Anki will ask you for them one at a time.

Anything you paste into a card is cleaned up first: the formatting comes
across, and everything a web page carries around with it does not.

Some pages hide their text in a way no add-on can read — PDFs opened in the
browser's own viewer are the common one. When that happens, Anklipper tells
you what it could not read rather than quietly making a card with a piece
missing.

## Settings

Anklipper has a settings page. Open the panel and click **Settings**, or find
Anklipper in your browser's add-ons list and open its options.

You can change:

- **The deck new cards start in**, and **the note type** they start on. Picked
  from the ones your own Anki has, so there is nothing to spell.
- **Tags every new card gets**, if you want any.
- **Where the page title and address go.** By default they are kept with the
  card but not written into it. If your note type has a field for a source,
  point one of them at it — as the plain address, or as a link labelled with
  the page title.
- **Anki's address and how long to wait for it.** Leave these alone unless you
  changed AnkiConnect's own settings. Anklipper only ever talks to your own
  computer, and it will not accept an address anywhere else.
- **An API key**, if — and only if — you set one in AnkiConnect. Almost nobody
  has. It is kept on your computer, sent only to Anki, and never shown in
  anything Anklipper writes out.

**Reset to defaults** puts all of that back. It does not forget the deck you
last used.

There are two things Anklipper remembers rather than asks about: **the deck
your last card went into**, so the next card starts there, and **any fields
you pinned**. Resetting the settings leaves both alone.

## Your unfinished card is kept

A card you are part way through is saved as you type it, so it is still there
if you close the panel, switch tabs, or leave the browser for a while.

If Anki is not running when you click add, nothing is lost: Anklipper says so
and keeps the card exactly as you left it, with a **Try again** button. Start
Anki, press it, and the card goes in.

And if you select something new while a card is still open, Anklipper asks
before replacing it. You can keep what you were working on, or switch to the
new selection — nothing is thrown away without you saying so.

## Before you start

You will need three things.

**1. Anki**, the flashcard program itself, installed on your computer.
Anklipper adds cards to it — it does not replace it. Anki needs to be open
and running while you make cards.
Get it from [apps.ankiweb.net](https://apps.ankiweb.net/).

**2. The AnkiConnect add-on for Anki.** This is a small extra that lets other
programs talk to Anki. Without it, Anklipper has no way to reach your cards.

To install it, open Anki and go to **Tools → Add-ons → Get Add-ons…**, then
type this code:

```text
2055492159
```

Click OK, then close and reopen Anki. You can check the add-on's page first
at [ankiweb.net/shared/info/2055492159](https://ankiweb.net/shared/info/2055492159)
if you would rather see what you are installing.

**3. Firefox.** Support for Chrome is planned, but Firefox comes first.

Firefox will also ask you to allow Anklipper to reach Anki on your own
computer — it is the only address Anklipper ever contacts. Say yes; that
permission is what lets the two talk to each other, and you only give it
once. Until you do, Anklipper says so and everything except adding a card
still works.

If you change Anki's address in Anklipper's settings, Firefox will ask again
for the new one when you save. Say yes to that too, or cards cannot be added
there.

## Your information stays on your computer

Anklipper talks only to the copy of Anki running on your own machine. The
text you select, and anything you type into a card, is not sent anywhere
else. Nothing goes to us, and nothing goes to any other service. That is not
a promise about how we behave: Anklipper will not accept an address that is
not on your own computer, and your browser will not let it reach one.

Your settings — including an API key, if you have one — are kept on your
computer and nowhere else.

If that ever changes — for a feature that needs help from an outside service
to write cards for you — it will be something you switch on yourself, after
being told exactly what would be sent.

## Licence

Anklipper is released under the MIT Licence. See [LICENSE](LICENSE) for the
full text.
