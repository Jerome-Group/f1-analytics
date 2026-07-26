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

import type { Driver, SessionState } from '../domain/index.ts';
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
    '</div>',
  ].join('');
}

function tla(code: string | undefined): string {
  return code === undefined
    ? '<span class="driver-name__tla absent">&mdash;</span>'
    : `<span class="driver-name__tla">${text(code)}</span>`;
}

/** A number the feed gave, or the mark for one it did not. Never a nought standing in. */
function figure(column: string, value: number | undefined): string {
  return value === undefined
    ? `<span class="${column} absent">&mdash;</span>`
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
