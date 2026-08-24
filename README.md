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

Anklipper also keeps a note of where the text came from, so a card can carry
the page title and address alongside whatever you wrote.

Some pages hide their text in a way no add-on can read — PDFs opened in the
browser's own viewer are the common one. When that happens, Anklipper tells
you what it could not read rather than quietly making a card with a piece
missing.

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

The first time you use Anklipper, Anki will ask whether you want to allow it
to connect. Say yes. That permission is what lets the two talk to each other,
and you only give it once.

## Your information stays on your computer

Anklipper talks only to the copy of Anki running on your own machine. The
text you select, and anything you type into a card, is not sent anywhere
else. Nothing goes to us, and nothing goes to any other service.

If that ever changes — for a feature that needs help from an outside service
to write cards for you — it will be something you switch on yourself, after
being told exactly what would be sent.

## Licence

Anklipper is released under the MIT Licence. See [LICENSE](LICENSE) for the
full text.
