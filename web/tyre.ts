// The tyre badge — the compound ring with its sidewall letter inside. Drawn on every Driver's row
// for the set they are on now (#11) and again for every set in an opened Driver's Stint history
// (#18), so the badge is built here once: two renderers writing the same span is how one of them
// ends up with a compound the other does not have.

import type { Compound } from '../domain/index.ts';

/** The compound letter drawn inside the ring — the sidewall marking, not a coloured dot. */
const COMPOUND_LETTER: Record<Compound, string> = {
  soft: 'S',
  medium: 'M',
  hard: 'H',
  intermediate: 'I',
  wet: 'W',
};

/**
 * The badge for a compound, or the unknown ring for a set the feed has not named. Unknown is a ring
 * and a question mark rather than a blank, so an unnamed compound reads as unknown and never as an
 * empty seat.
 */
export function tyreBadge(compound: Compound | undefined): string {
  const named = compound === undefined ? 'unknown' : compound;
  const letter = compound === undefined ? '?' : COMPOUND_LETTER[compound];
  return `<span class="tyre-badge" data-compound="${named}">${letter}</span>`;
}
