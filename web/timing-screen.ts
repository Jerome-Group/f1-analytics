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
  Compound,
  Driver,
  DriverState,
  Lap,
  Sector,
  SectorBests,
  Sectors,
  Separation,
  SessionState,
  Tyre,
} from '../domain/index.ts';
import { teamColour } from './team-colour.ts';
import { escapeText } from './escape.ts';
import { sparkline, type Plot } from './sparkline.ts';

/** The markup inside the timing table: one row per Driver, and no row that is not a Driver. */
export function timingScreen(state: SessionState): string {
  return state.drivers.map(driverRow).join('\n');
}

function driverRow(driver: Driver): string {
  // The row wears its state, so pit lane, box, out lap and retired change the whole row and not
  // only a chip (#12). On track is the ordinary state and the default, drawn quietly.
  const state = driver.state ?? 'on-track';
  return [
    `<div class="driver-row" data-state="${state}" style="--team-colour: ${teamColour(driver.team)}">`,
    figure('position', driver.position),
    positionChangeCell(driver.gridPosition, driver.position),
    '<span class="team-bar"></span>',
    figure('car-number', driver.number),
    `<span class="driver-name">${tla(driver.code)}</span>`,
    stateCell(state),
    gapCell('gap', driver.gap),
    gapTrendCell(driver.recentLaps),
    gapCell('interval', driver.interval),
    lapCell('last-lap', driver.lastLap),
    lapTrendCell(driver.recentLaps, driver.bestLap),
    lapCell('best-lap', driver.bestLap),
    sectorCells(driver.sectors, driver.sectorBests),
    figure('cell--figure speed-trap', driver.speedTrap),
    // Strategy at a glance (#11): what they are on, how old it is, and how often they have stopped.
    tyreCell(driver.tyre),
    tyreAgeCell(driver.tyre, driver.stintLaps),
    figure('cell--figure stint', driver.stint),
    figure('cell--figure pit-stops', driver.pitStops),
    // The trends the field can afford for all twenty (#16): pace against the age of this set, and the
    // count of laps run. Nothing per-second is drawn here — that is the whole reason the line exists.
    degTrendCell(driver.recentLaps),
    figure('cell--figure laps', driver.lapsCompleted),
    '</div>',
  ].join('');
}

/**
 * A Driver's change against their grid slot, with direction (#12) — what says who is having a good
 * afternoon. Places gained is the grid slot minus the current position: a lower position than the
 * slot is a gain. A Driver the feed has not placed, or has no grid slot for, has no change to draw
 * and reads as level rather than as a spurious jump.
 */
function positionChangeCell(grid: number | undefined, position: number | undefined): string {
  const level = '<span class="position-change" data-direction="none">&middot;</span>';
  if (grid === undefined || position === undefined) return level;
  const places = grid - position;
  if (places === 0) return level;
  if (places > 0) return `<span class="position-change" data-direction="gain">+${places}</span>`;
  return `<span class="position-change" data-direction="loss">&minus;${-places}</span>`;
}

/** The worded chip for each state that is not on track. */
const STATE_CHIP: Record<Exclude<DriverState, 'on-track'>, string> = {
  'pit-lane': 'Pit',
  'in-box': 'Box',
  'out-lap': 'Out',
  retired: 'Ret',
};

/**
 * The state chip — for every state except on track, which is nineteen rows in twenty and carries no
 * chip, so the screen keeps something to mark the exceptional state with (#12). The row's own
 * data-state carries the rest of the treatment; this cell is only the worded chip that repeats it
 * for anyone the row colour does not reach.
 */
function stateCell(state: DriverState): string {
  if (state === 'on-track') return '<span class="cell"></span>';
  return `<span class="cell"><span class="state-chip" data-state="${state}">${STATE_CHIP[state]}</span></span>`;
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

/** The compound letter drawn inside the tyre's ring — the sidewall marking, not a coloured dot. */
const COMPOUND_LETTER: Record<Compound, string> = {
  soft: 'S',
  medium: 'M',
  hard: 'H',
  intermediate: 'I',
  wet: 'W',
};

/**
 * The tyre a Driver is on, drawn as its compound ring (#11). A set the feed has not named yet is
 * the unknown ring rather than a blank cell, so an unknown compound reads as unknown and never as
 * an empty seat.
 */
function tyreCell(tyre: Tyre | undefined): string {
  const compound = tyre === undefined ? 'unknown' : tyre.compound;
  const letter = tyre === undefined ? '?' : COMPOUND_LETTER[tyre.compound];
  return `<span class="cell--centred"><span class="tyre-badge" data-compound="${compound}">${letter}</span></span>`;
}

/**
 * The tyre's age in laps — and the mark that says it was fitted with laps already on it, which is
 * true exactly when the rubber has turned more laps than the Stint has run. Age and Stint laps are
 * two numbers on purpose (CONTEXT.md, "Stint"), and the superscript is what makes a scrubbed set
 * legible without a second column.
 */
function tyreAgeCell(tyre: Tyre | undefined, stintLaps: number | undefined): string {
  if (tyre === undefined) return absent('cell--figure tyre-age');
  const fittedUsed = stintLaps !== undefined && tyre.ageInLaps > stintLaps;
  const marker = fittedUsed ? ' data-fitted-used="true"' : '';
  return `<span class="cell--figure tyre-age"${marker}>${tyre.ageInLaps}</span>`;
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

/**
 * The lap-time trend (#16): recent laps against the lap axis, read against the Driver's own best as
 * the dotted rule so the shape means something rather than floating. A lap the feed never timed is
 * absent from the run rather than drawn at zero, so the line breaks across it.
 */
function lapTrendCell(laps: readonly Lap[] | undefined, best: number | undefined): string {
  return trendCell(sparkline(plots(laps, (lap) => lap.time), 'Lap times, recent laps', best));
}

/**
 * The Gap trend (#16): the Gap to the leader over recent laps, read against the closest the Driver
 * has been within the window. A lap or more down carries no Gap here (session-state, "Lap"), so it is
 * a break in the line rather than a spike.
 */
function gapTrendCell(laps: readonly Lap[] | undefined): string {
  const points = plots(laps, (lap) => lap.gap);
  const best = points.length > 0 ? Math.min(...points.map((point) => point.value)) : undefined;
  return trendCell(sparkline(points, 'Gap to leader, recent laps', best));
}

/**
 * The tyre-age trend (#16): pace against the age of the set on the car now, so a stint's degradation
 * is a line the eye reads without arithmetic. Only the current Stint is drawn — a pit stop resets the
 * age, and plotting an earlier set's laps would send the axis backwards — and which laps those are is
 * the Stint the model stamped on each ([[session-state]]), not something re-derived here. There is no
 * datum, because pace against tyre age is read as a slope, not against a best.
 */
function degTrendCell(laps: readonly Lap[] | undefined): string {
  const recent = laps ?? [];
  const current = recent[recent.length - 1]?.stint;
  const points =
    current === undefined
      ? []
      : recent.flatMap((lap) =>
          lap.stint === current && lap.tyreAge !== undefined && lap.time !== undefined
            ? [{ at: lap.tyreAge, value: lap.time }]
            : [],
        );
  return trendCell(sparkline(points, 'Pace against tyre age'));
}

/** The laps that carry the measurement a trend draws, as points on the lap axis. A lap without it is
 *  left out, so its absence becomes a gap of the right width rather than a value invented for it. */
function plots(laps: readonly Lap[] | undefined, of: (lap: Lap) => number | undefined): Plot[] {
  return (laps ?? []).flatMap((lap) => {
    const value = of(lap);
    return value === undefined ? [] : [{ at: lap.number, value }];
  });
}

/** A sparkline in the cell the row lays out for it — the one place the team colour reaches inside a
 *  cell, on the head of the run, so the trend says which row it belongs to. */
function trendCell(drawn: string): string {
  return `<span class="cell">${drawn}</span>`;
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
    : `<span class="driver-name__tla">${escapeText(code)}</span>`;
}

/** A number the feed gave, or the mark for one it did not. Never a nought standing in. */
function figure(column: string, value: number | undefined): string {
  return value === undefined
    ? absent(column)
    : `<span class="${column}">${value}</span>`;
}
