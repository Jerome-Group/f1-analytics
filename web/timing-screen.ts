// Seam 2 (#3): Session state in, the Timing screen out.
//
// The whole field, in the order the state gives it, which is the order the race reads in
// (story 2). How many Drivers that is belongs to the Session and not to this file — twenty in
// 2025, twenty-two in 2026, and fewer than either the moment a car is withdrawn. A screen that
// knew the number would drop a Driver the season added and draw an empty row for one it lost.
//
// Narrow on purpose: a Driver's code and their livery. The columns beside them are the same
// track list the design system lays out (docs/adr/0010) and are filled by #9 onwards, so a row
// counts its cells to the last one it can fill and stops — the tracks after it stay empty, and
// nothing is drawn that would have to claim a value the feed has not sent (story 38).

import type {
  Driver,
  Sector,
  SectorBests,
  Sectors,
  Separation,
  SessionState,
} from '../domain/index.ts';
import { teamColour } from './team-colour.ts';

/** The markup inside the timing table: one row per Driver, and no row that is not a Driver. */
export function timingScreen(state: SessionState): string {
  return state.drivers.map(driverRow).join('\n');
}

function driverRow(driver: Driver): string {
  return [
    `<div class="driver-row" style="--team-colour: ${teamColour(driver.team)}">`,
    figure('position', driver.position),
    // Position change against the grid is #12. The cell is here because the row lays out against
    // the whole track list: drop it and every column to its right moves one place left.
    '<span class="cell"></span>',
    '<span class="team-bar"></span>',
    figure('car-number', driver.number),
    `<span class="driver-name">${tla(driver.code)}</span>`,
    // State chip is #13, the two trend sparklines are #11. Each is an empty cell for the same
    // reason the position-change cell above is: the columns they hold have to stay held, or Gap,
    // Interval, Last and Best all slide one place left of the header that names them.
    '<span class="cell"></span>',
    gapCell('gap', driver.gap),
    '<span class="cell"></span>',
    gapCell('interval', driver.interval),
    lapCell('last-lap', driver.lastLap),
    '<span class="cell"></span>',
    lapCell('best-lap', driver.bestLap),
    sectorCells(driver.sectors, driver.sectorBests),
    // Speed trap is the last cell the row can fill for now; tyres (#11) pick up where it stops,
    // and the row ends here rather than drawing a column it has nothing to put in.
    figure('cell--figure speed-trap', driver.speedTrap),
    '</div>',
  ].join('');
}

/**
 * The three sectors of the lap in progress, each with the Driver's own best beside it. A sector
 * not yet crossed this lap is absent — the dotted mark the design gives it — never the time from
 * the lap before, which is the one thing this column must not do (story: "a sector not yet set
 * reads as absent"). The personal best beside it persists across the lap boundary, so it can show
 * even while the live sector is still absent.
 */
function sectorCells(sectors: Sectors | undefined, bests: SectorBests | undefined): string {
  return [0, 1, 2].map((i) => sectorCell(sectors?.[i]) + sectorBestCell(bests?.[i])).join('');
}

/**
 * One sector, coloured purple, green or yellow to a meaning everyone already knows (#10). The
 * status is settled above the row against the whole field; this only draws the colour it is given,
 * so the row never has to know what anyone else did.
 */
function sectorCell(sector: Sector | undefined): string {
  if (sector === undefined) return '<span class="sector-time" data-status="absent">&mdash;</span>';
  return `<span class="sector-time" data-status="${sector.status}">${clock(sector.millis)}</span>`;
}

/** The Driver's own best in one sector, drawn secondary beside the live time, or the absent mark. */
function sectorBestCell(millis: number | undefined): string {
  return millis === undefined
    ? absent('cell--figure-secondary')
    : `<span class="cell--figure-secondary">${clock(millis)}</span>`;
}

/**
 * A Gap, to the leader or to the car ahead. Absent for the leader, a time while on the lead lap,
 * and whole laps once a lap or more down — never a lap rendered as an enormous time, because the
 * model does not let the two be confused and neither does this.
 */
function gapCell(column: string, separation: Separation | undefined): string {
  if (separation === undefined) return absent(`${column} cell--figure`);
  const shown = 'laps' in separation ? lapsDown(separation.laps) : `+${clock(separation.millis)}`;
  return `<span class="${column} cell--figure">${shown}</span>`;
}

/** A lap time — the Driver's last, or their best of the Session. A time or the absent mark. */
function lapCell(column: string, millis: number | undefined): string {
  return millis === undefined
    ? absent(`${column} cell--figure`)
    : `<span class="${column} cell--figure">${clock(millis)}</span>`;
}

/** The mark for a value the feed has not sent, wearing whatever column's classes it stands in. */
function absent(classes: string): string {
  return `<span class="${classes} absent">&mdash;</span>`;
}

function lapsDown(laps: number): string {
  return `+${laps} ${laps === 1 ? 'LAP' : 'LAPS'}`;
}

/**
 * Milliseconds as the timing screen reads them: `2.418`, `12.345`, and `1:02.550` once a minute
 * is crossed. The minutes place is dropped below a minute and the seconds are only padded once
 * there is a minute in front of them to pad against — a lone `2.418`, but a `1:02.550`.
 */
function clock(millis: number): string {
  const minutes = Math.floor(millis / 60_000);
  const seconds = Math.floor((millis % 60_000) / 1000);
  const thousandths = String(millis % 1000).padStart(3, '0');
  if (minutes === 0) return `${seconds}.${thousandths}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${thousandths}`;
}

function tla(code: string | undefined): string {
  return code === undefined
    ? '<span class="driver-name__tla absent">&mdash;</span>'
    : `<span class="driver-name__tla">${text(code)}</span>`;
}

/** A number the feed gave, or the mark for one it did not. Never a nought standing in. */
function figure(column: string, value: number | undefined): string {
  return value === undefined
    ? absent(column)
    : `<span class="${column}">${value}</span>`;
}

/** Upstream's text, drawn as text. A driver code is not markup, whatever arrives in it. */
function text(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ENTITIES[character] ?? character);
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
