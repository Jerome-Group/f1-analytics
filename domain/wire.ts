// What travels over the one WebSocket between `server/` and `web/`.
//
// Messages are tagged rather than bare Session state because the protocol is snapshot-then-delta
// (#3): a connecting browser is sent the whole Session so far and thereafter only what changed.
// Only the snapshot exists yet; a bare payload would have to be replaced on the day the second
// message arrives, in the browser and the server at once.

import type { SessionState } from './session-state.ts';

/** The whole Session so far, sent once to every browser that connects. */
export interface SessionStateMessage {
  type: 'session-state';
  state: SessionState;
}
