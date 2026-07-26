// Replay's input feed: a Session already in the Stores, read back through OpenF1's REST API.
//
// There are two feeds and they are not symmetrical. Live arrives over MQTT; `ingest-historical`
// has no MQTT configuration at all, so a backfilled Session is only ever readable over REST.
// Both feeds produce a `SessionState` and nothing downstream can tell which one it came from —
// that is the whole arrangement, and the reason this file's export says nothing about HTTP.

import type { SessionState } from '../../domain/index.ts';
import { sessionStateFrom } from './adapter.ts';
import type { DriverRecord, PositionRecord } from './records.ts';

export async function readSession(api: URL, sessionKey: number): Promise<SessionState> {
  const [drivers, positions] = await Promise.all([
    collection<DriverRecord>(api, 'drivers', sessionKey),
    collection<PositionRecord>(api, 'position', sessionKey),
  ]);
  return sessionStateFrom(sessionKey, drivers, positions);
}

async function collection<Record>(api: URL, name: string, sessionKey: number): Promise<Record[]> {
  const url = new URL(`v1/${name}`, api);
  url.searchParams.set('session_key', String(sessionKey));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Record[];
}
