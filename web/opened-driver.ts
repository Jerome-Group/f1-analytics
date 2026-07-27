// The opened Driver (#18): depth on one Driver, one click away rather than on screen at once.
//
// A pure function of the Session state and which Driver the viewer opened, like the rows and the
// strip — so the panel is testable without a DOM, and `main.ts` needs nothing from it but the
// `data-action` attribute the close button carries.
//
// It draws the whole panel the moment a Driver is opened, with the identity the rows already hold,
// and fills the four sections in when the depth arrives. That is what makes opening feel immediate
// and closing *be* immediate: the panel is a function of what the browser holds, and closing changes
// what the browser holds without waiting for anybody.

import type { DriverNumber, LapDetail, OpenedDriver, Radio, SessionState, Stint } from '../domain/index.ts';
import { teamColour } from './team-colour.ts';
import { escapeText } from './escape.ts';
import { sectorTime } from './sector.ts';
import { timeOfDay, timeText } from './time-text.ts';
import { trace } from './trace.ts';
import { tyreBadge } from './tyre.ts';

/**
 * The panel for the Driver a viewer has opened, or nothing at all when none is. The state's own
 * `opened` is used only when it is the Driver actually open: a frame still carrying the last Driver
 * — or the next one, arriving a moment early — must never be drawn under this one's name.
 */
export function openedDriverPanel(state: SessionState, opened: DriverNumber | undefined): string {
  if (opened === undefined) return '';
  const driver = state.drivers.find((each) => each.number === opened);
  const depth = state.opened?.number === opened ? state.opened : undefined;
  return [
    `<div class="opened-driver" data-driver="${opened}" style="--team-colour: ${teamColour(driver?.team)}">`,
    '<div class="opened-driver__head">',
    `<span class="opened-driver__number">${opened}</span>`,
    `<span class="opened-driver__tla">${driver?.code === undefined ? '&mdash;' : escapeText(driver.code)}</span>`,
    `<span class="opened-driver__team">${driver?.team === undefined ? '' : escapeText(driver.team)}</span>`,
    '<button class="opened-driver__close" data-action="close-driver" aria-label="Close this Driver">Close</button>',
    '</div>',
    depth === undefined ? waiting() : sections(depth),
    '</div>',
  ].join('');
}

/** What stands in the panel between the click and the depth arriving. It is not an absence — the
 *  streams are being read — so it does not say the Driver has nothing. */
function waiting(): string {
  return '<p class="opened-driver__waiting">Reading this Driver&rsquo;s streams&hellip;</p>';
}

function sections(depth: OpenedDriver): string {
  return [
    section('stints', 'Stints', stints(depth.stints), 'No Stint has been run yet.'),
    section('laps', 'Laps', laps(depth.laps), 'No lap has been timed yet.'),
    section('radio', 'Team radio', radio(depth.radio), 'Nothing has been said yet.'),
    // The trace says its own absence, because "no telemetry" and "the feed is Gated" look the same
    // from here and neither is a blank rectangle (trace.ts).
    `<section class="opened-driver__section" data-section="telemetry"><h2 class="opened-driver__title">Telemetry</h2>${trace(depth.telemetry ?? [])}</section>`,
  ].join('');
}

/** One titled section. A section with nothing in it says so in words: a Driver who has not spoken
 *  and a panel that failed to draw must never look the same. */
function section(name: string, title: string, body: string, nothing: string): string {
  const content = body === '' ? `<p class="opened-driver__nothing">${nothing}</p>` : body;
  return `<section class="opened-driver__section" data-section="${name}"><h2 class="opened-driver__title">${title}</h2>${content}</section>`;
}

/**
 * The Stint history: every set run so far, oldest first, each with its compound ring, the laps it
 * covered and the age it was fitted carrying. A set fitted scrubbed is said in words here — the row
 * has only a superscript for it (#11), and this is where there is room to be plain.
 */
function stints(history: readonly Stint[] | undefined): string {
  if (history === undefined || history.length === 0) return '';
  const items = history.map((stint) => {
    const age =
      stint.tyreAgeAtStart === undefined
        ? '<span class="opened-driver__stint-age absent">&mdash;</span>'
        : `<span class="opened-driver__stint-age">${fitted(stint.tyreAgeAtStart)}</span>`;
    return (
      `<li class="opened-driver__stint"><span class="opened-driver__stint-number">${stint.number}</span>` +
      `${tyreBadge(stint.compound)}` +
      `<span class="opened-driver__stint-laps">${lapSpan(stint)}</span>${age}</li>`
    );
  });
  return `<ol class="opened-driver__stints">${items.join('')}</ol>`;
}

/** Which laps a set covered. A Stint one lap long is a lap, not a span from itself to itself. */
function lapSpan(stint: Stint): string {
  return stint.fromLap === stint.toLap
    ? `Lap ${stint.fromLap}`
    : `Laps ${stint.fromLap}&ndash;${stint.toLap}`;
}

/** How the set went on: fresh, or with laps already on the rubber (CONTEXT.md, "Stint"). */
function fitted(ageAtStart: number): string {
  if (ageAtStart === 0) return 'fitted new';
  return `fitted with ${ageAtStart} lap${ageAtStart === 1 ? '' : 's'} on it`;
}

/**
 * The laps, newest first — the lap just run is the one being asked about, and it should not take a
 * scroll to reach. Each carries its time and its three sectors in the same purple, green and yellow
 * the row uses, so the column that has room for only the current lap is here for all of them.
 */
function laps(run: readonly LapDetail[] | undefined): string {
  if (run === undefined || run.length === 0) return '';
  const items = [...run].reverse().map((lap) => {
    const time =
      lap.time === undefined
        ? '<span class="opened-driver__lap-time absent">&mdash;</span>'
        : `<span class="opened-driver__lap-time">${timeText(lap.time)}</span>`;
    // The three slots are drawn by number rather than by what the list happens to hold, so a sector
    // the feed never timed leaves its own place empty instead of shifting the ones after it along.
    const sectors = [1, 2, 3].map((number) => sectorTime(lap.sectors.find((sector) => sector.number === number)));
    return (
      `<li class="opened-driver__lap"><span class="opened-driver__lap-number">${lap.number}</span>${time}` +
      `${sectors.join('')}</li>`
    );
  });
  return `<ol class="opened-driver__laps">${items.join('')}</ol>`;
}

/**
 * The radio, newest first, each clip playable where it stands. The recording is Formula 1's own
 * address and is loaded only if a viewer asks for it — this project mirrors no audio, and a panel
 * that fetched every clip on opening would fetch a race's worth to play none of them.
 */
function radio(clips: readonly Radio[] | undefined): string {
  if (clips === undefined || clips.length === 0) return '';
  const items = clips.map(
    (clip) =>
      `<li class="opened-driver__radio"><span class="opened-driver__radio-at">${timeOfDay(clip.at)}</span>` +
      `<audio class="opened-driver__radio-clip" controls preload="none" src="${escapeText(clip.url)}"></audio></li>`,
  );
  return `<ol class="opened-driver__radios">${items.join('')}</ol>`;
}
