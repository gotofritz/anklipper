import type { CardDraft } from "@/core/draft";
import type {
  Remembered,
  DraftStore,
  DraftStoreError,
  RememberedStore,
  RememberedStoreError,
} from "@/core/ports/types";
import { ok, type Result } from "@/core/result";
import { pinField, recordSticky, unpinField } from "@/core/sticky";

/**
 * The two moves the sidebar makes on the draft slots (7.3, 7.4).
 *
 * One card is edited at a time, so a capture that arrives while another is in
 * flight waits behind it. What happens to that waiting capture is a decision
 * with two triggers and one answer: the card in flight is finished, or the
 * user says they meant the newer selection. Both hand the slot over.
 *
 * Ports only — no `browser.*`, no Svelte — so the panel's tests drive this
 * against M3's in-memory fakes.
 */

/**
 * Hand the in-flight slot to whatever is waiting, and empty it if nothing is.
 *
 * Nothing is destroyed before its replacement is known: the waiting capture
 * is the only copy of itself, and a failed read here would otherwise cost
 * whichever of the two cards the failure was about.
 */
export async function takePending(
  drafts: DraftStore,
  pending: DraftStore,
): Promise<Result<CardDraft | undefined, DraftStoreError>> {
  const waiting = await pending.load();
  if (!waiting.ok) return waiting;

  if (waiting.value === undefined) {
    const cleared = await drafts.clear();
    return cleared.ok ? ok(undefined) : cleared;
  }

  const promoted = await drafts.save(waiting.value);
  // Left where it is: clearing it anyway would put the same card in neither
  // slot, and the panel would go on offering a capture that no longer exists.
  if (!promoted.ok) return promoted;

  const cleared = await pending.clear();
  return cleared.ok ? ok(waiting.value) : cleared;
}

/** Keep the card in flight; the newer selection is the one thrown away (7.4). */
export function dismissPending(
  pending: DraftStore,
): Promise<Result<void, DraftStoreError>> {
  return pending.clear();
}

/**
 * Read, change, write — the one place anything remembered is written.
 *
 * Two separate things live under that key now: the deck a card last went into
 * (8.5) and the sticky pins (10.6). A caller that wrote its own half whole
 * would silently drop the other's, and neither would ever notice.
 */
export async function updateRemembered(
  store: RememberedStore,
  change: (current: Remembered) => Remembered,
): Promise<Result<void, RememberedStoreError>> {
  const current = await store.load();
  if (!current.ok) return current;

  return store.save(change(current.value));
}

/**
 * Note the deck a card went into, so the next capture starts there (8.5).
 *
 * On the add rather than on the dropdown: a deck someone scrolled past is not
 * evidence of anything, and a deck a card is actually in is. It is remembered
 * state and not a setting — resetting the settings leaves it alone, and it
 * changing is not an edit to the user's configuration.
 */
export function rememberDeck(
  remembered: RememberedStore,
  deck: string,
): Promise<Result<void, RememberedStoreError>> {
  if (deck.trim() === "") return Promise.resolve(ok(undefined));

  return updateRemembered(remembered, (current) => ({
    ...current,
    lastDeck: deck,
  }));
}

/** Pin a field, or let it go (10.6). The value is what it should carry. */
export function setStickyPin(
  remembered: RememberedStore,
  noteType: string,
  field: string,
  value: string,
  pinned: boolean,
): Promise<Result<void, RememberedStoreError>> {
  return updateRemembered(remembered, (current) => ({
    ...current,
    sticky: pinned
      ? pinField(current.sticky ?? {}, noteType, field, value)
      : unpinField(current.sticky ?? {}, noteType, field),
  }));
}

/**
 * Note what the pinned fields held on the card that was added (10.6).
 *
 * On the add, like the deck and for the same reason: a field a card actually
 * went to Anki with is evidence, and one that was halfway typed is not.
 */
export function rememberSticky(
  remembered: RememberedStore,
  draft: CardDraft,
): Promise<Result<void, RememberedStoreError>> {
  return updateRemembered(remembered, (current) => ({
    ...current,
    sticky: recordSticky(current.sticky ?? {}, draft),
  }));
}
