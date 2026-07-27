// One sector time, coloured purple, green or yellow to a meaning everyone already knows (#10).
//
// Drawn in the row for the lap in progress and again for every lap of an opened Driver (#18), so it
// is written here once. The status is settled above the row, against the whole field; this only
// draws the colour it is given, so nothing that draws a sector has to know what anyone else did.

import type { Sector } from '../domain/index.ts';
import { timeText } from './time-text.ts';

/** A sector time, or the absent mark for one not yet set — never a nought and never the time from
 *  the lap before, which is the one thing this must not do (story: "a sector not yet set reads as
 *  absent"). */
export function sectorTime(sector: Sector | undefined): string {
  if (sector === undefined) return '<span class="sector-time" data-status="absent">&mdash;</span>';
  return `<span class="sector-time" data-status="${sector.status}">${timeText(sector.millis)}</span>`;
}
