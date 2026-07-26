// Stand up `server/` as a black box against a recorded Session, and hand back the WebSocket
// address and a way to tear it down. Both seam-1 harnesses — the one that reads a single snapshot
// (seam1.ts) and the one that reloads to prove a reconnect restores it (seam1-reconnect.ts) — stand
// the server up the same way, so the way is written once here and imports nothing from `server/`.

import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GIVE_UP_AFTER_MS = 20_000;

export interface SpawnedServer {
  /** Where a browser connects — the address the server announced on startup. */
  readonly url: string;
  /** Kill the server and the recording it was reading. */
  stop(): void;
}

/**
 * OpenF1's REST API, answering only out of the recording. A collection the fixture does not carry
 * is a 404 rather than an empty list, so a server that starts reading a stream nobody curated fails
 * here instead of quietly seeing nothing.
 */
async function replayRecording(name: string): Promise<Server> {
  const server = createServer((request, response) => {
    const collection = new URL(request.url ?? '/', 'http://recording').pathname.replace('/v1/', '');
    readFile(`${REPO_ROOT}test/fixtures/${name}/${collection}.json`).then(
      (body) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(body);
      },
      () => {
        response.writeHead(404).end();
      },
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

/** Spawn the server against `fixture` and resolve once it has announced where a browser connects. */
export async function spawnServer(fixture: string): Promise<SpawnedServer> {
  const recording = await replayRecording(fixture);
  const recordingPort = (recording.address() as { port: number }).port;

  const server = spawn(process.execPath, [`${REPO_ROOT}server/main.ts`, '9920'], {
    env: {
      ...process.env,
      F1_OPENF1_URL: `http://127.0.0.1:${recordingPort}`,
      // Nought is an ephemeral port: two of these may run at once, and a fixed port would make that
      // a flaky test rather than a slow one.
      F1_PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const stop = (): void => {
    server.kill();
    recording.close();
  };

  const url = await announced(server, stop);
  return { url, stop };
}

/** The WebSocket address from the server's first line of output, or a clear failure if it never
 * comes — twenty silent seconds otherwise, with nothing saying why. */
async function announced(server: ChildProcess, stop: () => void): Promise<string> {
  const timeout = setTimeout(() => {
    stop();
    throw new Error('the server never announced a WebSocket');
  }, GIVE_UP_AFTER_MS);

  let announcement = '';
  for await (const chunk of server.stdout ?? []) {
    announcement += chunk;
    if (announcement.includes('\n')) break;
  }
  clearTimeout(timeout);

  const address = /ws:\/\/\S+/.exec(announcement)?.[0];
  if (address === undefined) {
    stop();
    throw new Error(`the server announced "${announcement.trim()}", which is not a WebSocket`);
  }
  return address;
}
