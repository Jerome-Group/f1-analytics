// What travels over the one WebSocket between `server/` and `web/`.
//
// The protocol is snapshot then changes (#3, #14): a connecting browser is sent the whole Session
// so far, and thereafter only what changed. A browser that reconnects is sent a fresh snapshot, so
// a dropped connection costs nothing — and the fold rule below is the guarantee that the two paths
// meet: snapshot-then-changes and a reconnected snapshot land on the identical Session.

import type { Driver, SessionState } from './session-state.ts';
import { byPosition } from './ordering.ts';

/**
 * The whole Session so far, sent when a browser connects and again whenever it reconnects. The one
 * message a browser can act on holding nothing beforehand.
 */
export interface SessionStateMessage {
  type: 'session-state';
  state: SessionState;
}

/**
 * Only what changed since the browser was last current. Every Session-global field is optional and
 * carries its new value when it moved; `drivers` carries the Drivers whose facts changed, each
 * *whole* — because a browser replaces a changed Driver rather than merging into it, a fact the feed
 * stopped sending goes absent rather than lingering (story 38). `sessionKey` is not here: a change
 * never re-keys the Session it is a change to.
 *
 * A change never *removes* a Session-global field. No feed does that yet, and the wire has no way to
 * say it — the day one needs to, this is where it is said.
 */
export type SessionChange = Partial<Omit<SessionState, 'sessionKey' | 'drivers'>> & {
  drivers?: readonly Driver[];
};

/** A change, tagged so the browser knows to fold it rather than replace with it. */
export interface SessionChangeMessage {
  type: 'session-change';
  change: SessionChange;
}

/** Everything the socket carries. Tagged, so the browser branches on `type` and never on shape. */
export type WireMessage = SessionStateMessage | SessionChangeMessage;

/**
 * Fold a change into the Session a browser holds. Session-global fields overwrite; changed Drivers
 * replace by number and the field is re-sorted into position order — the same order a fresh snapshot
 * arrives in ([[ordering]]), so a browser that folded changes and one that reconnected to a snapshot
 * hold byte-identical Sessions. This is the guarantee #14 rests on, which is why it is defined once,
 * here, and exercised directly by the tests.
 */
export function applyChange(state: SessionState, change: SessionChange): SessionState {
  const { drivers, ...session } = change;
  const folded: SessionState = { ...state, ...session };
  if (drivers !== undefined) folded.drivers = merge(state.drivers, drivers);
  return folded;
}

// Every held Driver is kept and every changed one replaces its own by number: the field only grows,
// because a retired Driver stays in it rather than leaving (session-state.ts). So a fold never has a
// Driver to remove, and — like the Session-global fields above — the wire has no way to say it did.
function merge(held: readonly Driver[], changed: readonly Driver[]): Driver[] {
  const byNumber = new Map(held.map((driver) => [driver.number, driver]));
  for (const driver of changed) byNumber.set(driver.number, driver);
  return [...byNumber.values()].sort(byPosition);
}
