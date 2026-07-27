// Reads backfilled Sessions out of the Stores, serves the dashboard, and plays them back over one
// WebSocket as a Replay the viewer can move (#15). One port, so there is nothing to point at anything.
//
//   node server/main.ts 9920
//
// The key on the command line is the Session shown first; from the picker a viewer chooses any other
// that has been Backfilled, and the socket it opens names it (`?session=<key>`). Each Session is read
// once — a finished Session does not change — and held as a timeline the Replay clock walks (clock.ts):
// it opens paused at the end, the whole finished Session, and the viewer scrubs back into it and plays
// it forward. Nothing downstream can tell a Replay frame from a Live one; only the strip's chrome and
// the controls know (ADR-0003).
//
// One clock at a time, shared by every browser, so the encode-once fan-out is untouched: a second
// browser choosing a different Session re-points the one clock. That is a single-operator tool's
// bargain, and the reload a picker choice makes gives each browser a clean snapshot regardless. The
// Driver a viewer opens is shared on the same terms (#18), and it is the only thing the per-second
// tier is ever read for.
//
//   F1_OPENF1_URL   where the self-hosted OpenF1 API is answering
//   F1_PORT         the port the browser connects to; nought asks the operating system for one

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClientControl, DriverNumber } from '../domain/index.ts';
import { loadOpened, loadTimeline, readCatalogue } from './openf1/rest-feed.ts';
import type { OpenedLog, Timeline } from './openf1/timeline.ts';
import { servePage } from './dashboard.ts';
import { replayClock } from './replay/clock.ts';
import { sessionSource } from './session.ts';
import { serveSessionState } from './websocket/server.ts';

const DEFAULT_API = 'http://localhost:8000';
const DEFAULT_PORT = '8080';
const PICKER = '/web/picker.html';

const [key] = process.argv.slice(2);
if (key === undefined || !/^\d+$/.test(key) || process.argv.length > 3) {
  process.stderr.write(
    'usage: node server/main.ts <session-key>\n\n' +
      'Serves backfilled Sessions over a WebSocket. Bring the stack up with bin/up, put a Session\n' +
      'in the stores with bin/backfill, and name the season with bin/catalogue first.\n',
  );
  process.exit(64);
}

const api = new URL(process.env['F1_OPENF1_URL'] ?? DEFAULT_API);
const sessionKey = Number(key);

// The timeline is the record log; the clock is where the viewer stands on it. Timelines are cached by
// key so choosing a Session already seen costs nothing, and the one clock is re-pointed as the choice
// changes. The source is seeded with the first Session so a browser that connects before the clock's
// opening frame still sees a whole Session.
const timelines = new Map<number, Timeline>();
const first = await loadTimeline(api, sessionKey);
timelines.set(sessionKey, first);
const source = sessionSource(first.at(first.end));
let active = first;
let clock = replayClock(source, active);
let activeKey = sessionKey;

async function activate(next: number): Promise<void> {
  if (next === activeKey) return;
  let timeline = timelines.get(next);
  if (timeline === undefined) {
    timeline = await loadTimeline(api, next);
    timelines.set(next, timeline);
  }
  clock.stop();
  // Whoever was open was open in the Session being left, so the new one starts with nobody open and
  // no per-second tier on the wire until somebody asks again.
  active.open(undefined);
  wanted = undefined;
  active = timeline;
  clock = replayClock(source, active);
  activeKey = next;
}

// One opened Driver beside the one clock, and for the same single-operator bargain (above): the
// per-second tier is read for the Driver last opened and for nobody else. Their deep streams are
// cached by Session and Driver, so re-opening one costs nothing and closing costs nothing at all —
// it is a field taken out of the next frame, which is why closing is instant even here.
const opened = new Map<string, OpenedLog>();
let wanted: DriverNumber | undefined;

async function open(driver: DriverNumber | undefined): Promise<void> {
  wanted = driver;
  if (driver !== undefined) {
    const key = `${activeKey}:${driver}`;
    let log = opened.get(key);
    if (log === undefined) {
      try {
        log = await loadOpened(api, activeKey, driver);
        opened.set(key, log);
      } catch (failure) {
        // The stack being down, or answering a 429, is the ordinary reason this fails. It costs the
        // two deep streams and nothing else — the Stints and the laps are already in the timeline —
        // so the Driver is opened without them rather than left as a panel waiting for ever. It is
        // not cached either, so asking again is a retry.
        process.stderr.write(`Driver ${driver}'s deep streams could not be read: ${String(failure)}\n`);
        log = { driver, radio: [], carData: [] };
      }
    }
    // A viewer who opened somebody else, or closed this one, while the streams were being read gets
    // what they asked for last rather than what finished loading first.
    if (wanted !== driver) return;
    active.open(log);
  } else {
    active.open(undefined);
  }
  // The clock has not moved; the log beneath it has. Republishing is how the frame the viewer is
  // already looking at gains — or loses — the depth behind one Driver.
  clock.refresh();
}

function control(sent: ClientControl): void {
  if (sent.type === 'open-driver') void open(sent.driver);
  else clock.control(sent);
}

/** The Session a request names, or nothing when it names none — a bare connection keeps the one on. */
function sessionOf(url: string | undefined): number | undefined {
  const value = new URL(url ?? '/', 'http://dashboard').searchParams.get('session');
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

/** The picker's landing page, its catalogue, and everything the dashboard is made of. */
async function page(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://dashboard');
  if (url.pathname === '/') {
    response.writeHead(302, { location: PICKER }).end();
    return;
  }
  if (url.pathname === '/catalogue') {
    await serveCatalogue(url, response);
    return;
  }
  await servePage(request, response);
}

async function serveCatalogue(url: URL, response: ServerResponse): Promise<void> {
  const year = Number(url.searchParams.get('year'));
  if (!Number.isInteger(year) || year <= 0) {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('a catalogue is a year at a time\n');
    return;
  }
  try {
    const catalogue = await readCatalogue(api, year);
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(catalogue));
  } catch {
    // The stack being down is the ordinary reason this fails, and the picker says so; a 502 keeps
    // that apart from a page that is simply not here (a 404).
    response.writeHead(502, { 'content-type': 'text/plain' }).end('the catalogue could not be read\n');
  }
}

const server = await serveSessionState(
  source,
  Number(process.env['F1_PORT'] ?? DEFAULT_PORT),
  page,
  control,
  (request) => activate(sessionOf(request.url) ?? activeKey),
);

// One line, and the port is in it: the caller may have asked for an ephemeral one, and a test
// harness has nothing else to wait for. The viewer wants the other address on the same line.
process.stdout.write(
  `${server.url} is serving Session ${sessionKey}, ${source.state.drivers.length} Drivers` +
    ` — watch it at ${server.page}\n`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clock.stop();
    void server.close().then(() => process.exit(0));
  });
}
