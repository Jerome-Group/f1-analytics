// What travels over the one WebSocket between `server/` and `web/`.
//
// The protocol is snapshot then changes (#3, #14): a connecting browser is sent the whole Session
// so far, and thereafter only what changed. A browser that reconnects is sent a fresh snapshot, so
// a dropped connection costs nothing — and the fold rule below is the guarantee that the two paths
// meet: snapshot-then-changes and a reconnected snapshot land on the identical Session.

import type { Driver, DriverNumber, SessionState } from './session-state.ts';
import { byPosition } from './ordering.ts';

/** The Session-global keys a change can carry or remove — every key of the Session but its identity
 * and its Drivers. Stated once here, so `server/` and the fold below cannot disagree about which. */
export type GlobalField = keyof Omit<SessionState, 'sessionKey' | 'drivers'>;

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
 * `removed` is the other direction: the Session-global fields that are gone rather than moved. A
 * closed Driver is the first thing to need it (#18) — a browser left holding the last opened
 * Driver's telemetry would draw a trace of seconds the Session has since left behind, which is
 * story 38 again, one field up. There is no such list for Drivers: the field only grows.
 */
export type SessionChange = Partial<Omit<SessionState, 'sessionKey' | 'drivers'>> & {
  drivers?: readonly Driver[];
  removed?: readonly GlobalField[];
};

/** A change, tagged so the browser knows to fold it rather than replace with it. */
export interface SessionChangeMessage {
  type: 'session-change';
  change: SessionChange;
}

/** Everything the socket carries *to* the browser. Tagged, so it branches on `type`, never shape. */
export type WireMessage = SessionStateMessage | SessionChangeMessage;

/**
 * A viewer moving the Replay's Session clock (#15).
 *
 * `scrub` names an absolute position on the clock's own millisecond axis rather than a delta, so a
 * scrub is idempotent and a dropped message costs nothing: the next one still says exactly where the
 * handle is, not how far it moved. `speed` is Session-seconds per wall-clock second.
 */
export type ReplayControl =
  | { type: 'replay-control'; action: 'play' }
  | { type: 'replay-control'; action: 'pause' }
  | { type: 'replay-control'; action: 'scrub'; position: number }
  | { type: 'replay-control'; action: 'speed'; speed: number };

/**
 * A viewer opening a Driver, or closing the one that was open (#18). `driver` absent is closed — the
 * model's own reading of absence, and the reason there is no second message to say so.
 *
 * This is what makes the per-second tier affordable: the server sends that tier for the Driver named
 * here and for no other, so opening is a request for depth rather than a filter over depth already
 * on the wire. Closing needs no answer to be instant — the browser stops drawing the panel the moment
 * it is asked to — but it is still sent, so the server stops paying for the trace.
 */
export type OpenControl = { type: 'open-driver'; driver?: DriverNumber };

/**
 * Everything the browser sends *back* up the socket. The only messages that travel this direction,
 * so the server can treat anything else on it as the close it already knows how to answer.
 */
export type ClientControl = ReplayControl | OpenControl;

/**
 * Read a control off an inbound frame's text, or `undefined` when it is not one this server acts on.
 * Defined here beside the types it guards so the shapes are stated once: the server parses, the
 * browser builds, and neither restates what a control is.
 */
export function clientControl(text: string): ClientControl | undefined {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof message !== 'object' || message === null) return undefined;
  const control = message as {
    type?: unknown;
    action?: unknown;
    position?: unknown;
    speed?: unknown;
    driver?: unknown;
  };
  if (control.type === 'open-driver') {
    return typeof control.driver === 'number'
      ? { type: 'open-driver', driver: control.driver }
      : { type: 'open-driver' };
  }
  if (control.type !== 'replay-control') return undefined;
  if (control.action === 'play' || control.action === 'pause') {
    return { type: 'replay-control', action: control.action };
  }
  if (control.action === 'scrub' && typeof control.position === 'number') {
    return { type: 'replay-control', action: 'scrub', position: control.position };
  }
  if (control.action === 'speed' && typeof control.speed === 'number' && control.speed > 0) {
    return { type: 'replay-control', action: 'speed', speed: control.speed };
  }
  return undefined;
}

/**
 * Fold a change into the Session a browser holds. Session-global fields overwrite; changed Drivers
 * replace by number and the field is re-sorted into position order — the same order a fresh snapshot
 * arrives in ([[ordering]]), so a browser that folded changes and one that reconnected to a snapshot
 * hold byte-identical Sessions. This is the guarantee #14 rests on, which is why it is defined once,
 * here, and exercised directly by the tests.
 */
export function applyChange(state: SessionState, change: SessionChange): SessionState {
  const { drivers, removed, ...session } = change;
  const folded: SessionState = { ...state, ...session };
  if (drivers !== undefined) folded.drivers = merge(state.drivers, drivers);
  // Removed after the overwrite, so a field both moved and removed in one change ends up gone —
  // which cannot happen, and would be the safer of the two answers if it did.
  for (const field of removed ?? []) delete folded[field];
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
