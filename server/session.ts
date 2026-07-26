// The single source of truth `server/` holds: the whole Session so far, and who to tell when it
// moves.
//
// A connecting browser is handed `state` as a snapshot; an update replaces it and hands every
// listener only what changed. The finished-Session path (`main.ts`) builds one of these and never
// updates it — a finished Session does not move — so a browser gets one snapshot and no changes.
// The live and Replay feeds (#15, #17) call `update` as new records arrive, and the fan-out to many
// browsers is already here waiting for them: one update, encoded once, sent to all.

import { isDeepStrictEqual } from 'node:util';
import type { Driver, SessionChange, SessionState } from '../domain/index.ts';

/** The Session-global keys a change can carry — every key of the change but the Drivers. Derived
 * from `SessionChange` so which keys those are is stated once, in the wire protocol (wire.ts), and
 * not restated here where it would drift. */
type GlobalField = keyof Omit<SessionChange, 'drivers'>;

export interface SessionSource {
  /** The whole Session as it stands now, for a browser that has just connected. */
  readonly state: SessionState;
  /** Be told what changed on every update. Returns the way to stop being told. */
  subscribe(onChange: (change: SessionChange) => void): () => void;
  /** Replace the Session, and hand every listener the change — unless nothing actually moved. */
  update(next: SessionState): void;
}

export function sessionSource(initial: SessionState): SessionSource {
  let state = initial;
  const listeners = new Set<(change: SessionChange) => void>();
  return {
    get state() {
      return state;
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    update(next) {
      const change = computeChange(state, next);
      state = next;
      if (change !== undefined) for (const listener of listeners) listener(change);
    },
  };
}

/**
 * What moved between one Session state and the next, in the shape the browser folds (wire.ts):
 * every Session-global field that changed, and the Drivers whose facts changed, each whole.
 * `undefined` when nothing moved, so an update that changes nothing sends nothing. `sessionKey` is
 * never compared — a change is always a change to the same Session.
 */
export function computeChange(previous: SessionState, next: SessionState): SessionChange | undefined {
  const change: SessionChange = {};
  let moved = false;

  for (const field of sessionGlobalFields(previous, next)) {
    const value = next[field];
    // A field the next state does not carry is a field that has not moved *to* a value, and the wire
    // has no way to say a field was removed (wire.ts), so it is left out either way.
    if (value !== undefined && !isDeepStrictEqual(previous[field], value)) {
      assign(change, field, value);
      moved = true;
    }
  }

  const drivers = changedDrivers(previous.drivers, next.drivers);
  if (drivers.length > 0) {
    change.drivers = drivers;
    moved = true;
  }

  return moved ? change : undefined;
}

function sessionGlobalFields(previous: SessionState, next: SessionState): GlobalField[] {
  const keys = new Set<string>([...Object.keys(previous), ...Object.keys(next)]);
  keys.delete('sessionKey');
  keys.delete('drivers');
  return [...keys] as GlobalField[];
}

/** Written apart so `change[field] = next[field]` is one assignable expression rather than a cast at
 * every call: the field and the value come from the same state, so they are the same key. */
function assign<Field extends GlobalField>(
  change: SessionChange,
  field: Field,
  value: SessionState[Field],
): void {
  change[field] = value;
}

/**
 * The Drivers whose whole object changed, keyed by number — a new Driver counts as changed. A
 * Driver that *left* the field does not, and there is nowhere to say one did: the field only grows,
 * because a Driver who retires stays in it plainly out of it rather than disappearing (session-state
 * "DriverState"). The fold ([[wire]]) rests on the same invariant.
 */
function changedDrivers(previous: readonly Driver[], next: readonly Driver[]): Driver[] {
  const before = new Map(previous.map((driver) => [driver.number, driver]));
  return next.filter((driver) => !isDeepStrictEqual(before.get(driver.number), driver));
}
