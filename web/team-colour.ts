// Which livery a Driver's row wears.
//
// The feed names a constructor; the design system draws one. The two are not the same word —
// "Red Bull Racing" is drawn as --team-red-bull and "Haas F1 Team" as --team-haas — so the
// pairing is stated here rather than derived from the name, which would be right for nine
// constructors and wrong for the rest.
//
// A constructor with no livery of its own gets the grey one. A row with no bar reads as an
// empty seat, and a season this table has not caught up with should look unfamiliar, not empty.

const LIVERIES = new Map<string, string>([
  ['Alpine', '--team-alpine'],
  ['Aston Martin', '--team-aston-martin'],
  ['Audi', '--team-audi'],
  ['Cadillac', '--team-cadillac'],
  ['Ferrari', '--team-ferrari'],
  ['Haas F1 Team', '--team-haas'],
  ['Kick Sauber', '--team-kick-sauber'],
  ['McLaren', '--team-mclaren'],
  ['Mercedes', '--team-mercedes'],
  ['Racing Bulls', '--team-racing-bulls'],
  ['Red Bull Racing', '--team-red-bull'],
  ['Williams', '--team-williams'],
]);

/** The token a row sets --team-colour to, ready to be written into a style attribute. */
export function teamColour(team: string | undefined): string {
  return `var(${(team === undefined ? undefined : LIVERIES.get(team)) ?? '--team-unknown'})`;
}
