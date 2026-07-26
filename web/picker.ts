// The picker (#15): the season's Meetings and Sessions, and the choice of which one to Replay. A
// Session that has been Backfilled is a link into the Timing screen; one the catalogue names but the
// Stores do not hold is shown all the same, plainly not chooseable — "known but not here", the state
// a season of ~123 Sessions and a handful on disk makes the common one.
//
// A pure function of the catalogue, like the Timing screen is of the Session state (timing-screen.ts):
// the fetch and the mounting are the bootstrap's (picker-main.ts), so the list itself is testable
// without a DOM.

import type { Catalogue, CatalogueMeeting, CatalogueSession } from '../domain/index.ts';
import { escapeText } from './escape.ts';

/** The whole list, or a plain note when the season has not been catalogued. */
export function renderCatalogue(catalogue: Catalogue): string {
  if (catalogue.length === 0) {
    return '<p class="picker__empty">Nothing catalogued for this season. Run <code>bin/catalogue &lt;year&gt;</code>.</p>';
  }
  return `<ul class="picker">${catalogue.map(meeting).join('')}</ul>`;
}

function meeting(meeting: CatalogueMeeting): string {
  return [
    '<li class="picker__meeting">',
    `<div class="picker__meeting-name">${escapeText(meeting.name)}</div>`,
    `<div class="picker__meeting-where">${where(meeting)}</div>`,
    `<ul class="picker__sessions">${meeting.sessions.map(session).join('')}</ul>`,
    '</li>',
  ].join('');
}

/** "Zandvoort &middot; Netherlands", each half shown only where the catalogue gave it. */
function where(meeting: CatalogueMeeting): string {
  const parts = [meeting.circuit, meeting.country]
    .filter((part): part is string => part !== undefined)
    .map(escapeText);
  return parts.length === 0 ? '<span class="picker__absent">&mdash;</span>' : parts.join(' &middot; ');
}

/**
 * A Backfilled Session links to the Timing screen keyed to it — `?session=<key>`, the key upstream
 * gave and the dashboard replays. A Session only catalogued is drawn beside its Replayable siblings
 * so the gap is visible, marked as not on disk and not a link.
 */
function session(session: CatalogueSession): string {
  if (session.backfilled) {
    return (
      `<li class="picker__session"><a class="picker__replay" href="index.html?session=${session.key}">` +
      `${escapeText(session.name)}</a></li>`
    );
  }
  return (
    `<li class="picker__session"><span class="picker__unavailable" aria-disabled="true">` +
    `${escapeText(session.name)}<span class="picker__note">not here</span></span></li>`
  );
}
