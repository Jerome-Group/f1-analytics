// What a browser is given when it asks this port for a page rather than for a socket.
//
// `web/` is TypeScript that Node runs and nothing builds (ADR-0011), and a browser cannot run
// TypeScript — so the types come out on the way past, by Node's own stripper. There is still no
// build step, no emitted file that can be stale and nothing installed; the bundler question
// ADR-0011 leaves open stays open, because this answers a smaller one.
//
// Files are served from the repository root, not from `web/`, because `web/` imports `domain/`
// and a browser resolves that import as a path like any other.

import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOME = '/web/index.html';

/** The file types the dashboard is made of. Anything else is not a page and is not served. */
const SERVED: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
};

/** Serves the Timing screen and everything it asks for. */
export async function servePage(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const path = new URL(request.url ?? '/', 'http://dashboard').pathname;
  if (path === '/') {
    response.writeHead(302, { location: HOME }).end();
    return;
  }

  const type = SERVED[extension(path)];
  const file = resolve(ROOT, `.${path}`);
  // A path that climbs out of the repository is a request for a file this port does not have,
  // whatever it resolves to on disk.
  if (type === undefined || !file.startsWith(`${ROOT}/`)) {
    notHere(response, path);
    return;
  }

  try {
    const source = await readFile(file, 'utf8');
    response
      .writeHead(200, { 'content-type': type })
      .end(file.endsWith('.ts') ? stripTypeScriptTypes(source) : source);
  } catch {
    // A path of the right type that is not on disk is not here in the same way an unknown one is.
    notHere(response, path);
  }
}

function notHere(response: ServerResponse, path: string): void {
  response.writeHead(404, { 'content-type': 'text/plain' }).end(`${path} is not here.\n`);
}

function extension(path: string): string {
  return path.slice(path.lastIndexOf('.'));
}
