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

import type { DriverNumber, LapDetail, LapSector, OpenedDriver, Radio, SessionState, Stint } from '../domain/index.ts';
import { teamColour } from './team-colour.ts';
import { escapeText } from './escape.ts';
import { timeOfDay, timeText } from './clock.ts';
import { trace } from './trace.ts';
import { tyreBadge } from './tyre.ts';

/**
 * The panel for the Driver a viewer has opened, or nothing at all when none is. The state's own
 * `opened` is used only when it is the Driver actually open: a frame still carrying the last Driver
 * — or the next one, arriving a moment early — must never be drawn under this one's name.
 */
export function driverDetail(state: SessionState, opened: DriverNumber | undefined): string {
  if (opened === undefined) return '';
  const driver = state.drivers.find((each) => each.number === opened);
  const depth = state.opened?.number === opened ? state.opened : undefined;
  return [
    `<div class="driver-detail" data-driver="${opened}" style="--team-colour: ${teamColour(driver?.team)}">`,
    '<div class="driver-detail__head">',
    `<span class="driver-detail__number">${opened}</span>`,
    `<span class="driver-detail__tla">${driver?.code === undefined ? '&mdash;' : escapeText(driver.code)}</span>`,
    `<span class="driver-detail__team">${driver?.team === undefined ? '' : escapeText(driver.team)}</span>`,
    '<button class="driver-detail__close" data-action="close-driver" aria-label="Close this Driver">Close</button>',
    '</div>',
    depth === undefined ? waiting() : sections(depth),
    '</div>',
  ].join('');
}

/** What stands in the panel between the click and the depth arriving. It is not an absence — the
 *  streams are being read — so it does not say the Driver has nothing. */
function waiting(): string {
  return '<p class="driver-detail__waiting">Reading this Driver&rsquo;s streams&hellip;</p>';
}

function sections(depth: OpenedDriver): string {
  return [
    section('stints', 'Stints', stints(depth.stints), 'No Stint has been run yet.'),
    section('laps', 'Laps', laps(depth.laps), 'No lap has been timed yet.'),
    section('radio', 'Team radio', radio(depth.radio), 'Nothing has been said yet.'),
    // The trace says its own absence, because "no telemetry" and "the feed is Gated" look the same
    // from here and neither is a blank rectangle (trace.ts).
    `<section class="driver-detail__section" data-section="telemetry"><h2 class="driver-detail__title">Telemetry</h2>${trace(depth.telemetry ?? [])}</section>`,
  ].join('');
}

/** One titled section. A section with nothing in it says so in words: a Driver who has not spoken
 *  and a panel that failed to draw must never look the same. */
function section(name: string, title: string, body: string, nothing: string): string {
  const content = body === '' ? `<p class="detail-absent">${nothing}</p>` : body;
  return `<section class="driver-detail__section" data-section="${name}"><h2 class="driver-detail__title">${title}</h2>${content}</section>`;
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
        ? '<span class="detail-stint__age absent">&mdash;</span>'
        : `<span class="detail-stint__age">${fitted(stint.tyreAgeAtStart)}</span>`;
    return (
      `<li class="detail-stint"><span class="detail-stint__number">${stint.number}</span>` +
      `${tyreBadge(stint.compound)}` +
      `<span class="detail-stint__laps">${lapSpan(stint)}</span>${age}</li>`
    );
  });
  return `<ol class="detail-stints">${items.join('')}</ol>`;
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
        ? '<span class="detail-lap__time absent">&mdash;</span>'
        : `<span class="detail-lap__time">${timeText(lap.time)}</span>`;
    return (
      `<li class="detail-lap"><span class="detail-lap__number">${lap.number}</span>${time}` +
      `${lap.sectors.map(sectorTime).join('')}</li>`
    );
  });
  return `<ol class="detail-laps">${items.join('')}</ol>`;
}

/** One sector of one lap. A sector the feed never timed is the absent mark, never a nought and
 *  never the sector before it. */
function sectorTime(sector: LapSector): string {
  if (sector === null) return '<span class="sector-time" data-status="absent">&mdash;</span>';
  return `<span class="sector-time" data-status="${sector.status}">${timeText(sector.millis)}</span>`;
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
      `<li class="detail-radio"><span class="detail-radio__at">${timeOfDay(clip.at)}</span>` +
      `<audio class="detail-radio__clip" controls preload="none" src="${escapeText(clip.url)}"></audio></li>`,
  );
  return `<ol class="detail-radios">${items.join('')}</ol>`;
}
