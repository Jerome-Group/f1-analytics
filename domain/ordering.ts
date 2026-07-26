// The order the field reads in, defined once because two sides now depend on it agreeing.
//
// The Adapter sorts a fresh Session this way, and the browser re-sorts after folding a change into
// the Session it holds (wire.ts). If the two comparators differed, a browser that reconnected to a
// snapshot and one that folded changes could show the same Drivers in a different order — so the
// rule lives here, in the model both import, rather than once in each.

import type { Driver } from './session-state.ts';

/**
 * Position order is the order the race reads in (story 2). An unplaced Driver — one the feed has
 * not placed against the field yet — sorts last, and ties break on Driver number so the order is
 * total: a Replay played twice, or a reconnect against the same Session, is byte-stable.
 */
export function byPosition(one: Driver, other: Driver): number {
  if (one.position === undefined || other.position === undefined) {
    if (one.position !== other.position) return one.position === undefined ? 1 : -1;
    return one.number - other.number;
  }
  return one.position - other.position;
}
