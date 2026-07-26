// Seam 2, the other half: Session state in, the session-global strip out (#13).
//
// Everything true of the Session rather than of a Driver lives here — status and clock, the flag
// condition, race control, the weather — so that the twenty-two rows below stay a table and the
// answer to "why is this happening" is always on screen. The strip is a function of the state like
// the rows are, which is what lets it survive a red flag and a Session restart without a reload: a
// restarted Session is simply the next state, drawn.

import type {
  Flag,
  RaceControlMessage,
  SessionClock,
  SessionIdentity,
  SessionState,
  Weather,
} from '../domain/index.ts';

/** The whole strip, drawn from the Session-global part of the state. */
export function sessionStrip(state: SessionState): string {
  const flag = state.flag;
  return [
    `<div class="session-strip"${flag === undefined ? '' : ` data-flag="${flag}"`}>`,
    identityBlock(state.identity, state.status, state.clock, flag),
    raceControlBlock(state.raceControl),
    weatherBlock(state.weather),
    modeBlock(state.mode),
    '</div>',
  ].join('');
}

/** Identity, the always-visible Session status and clock, and the worded flag condition. */
function identityBlock(
  identity: SessionIdentity | undefined,
  status: string | undefined,
  clock: SessionClock | undefined,
  flag: Flag | undefined,
): string {
  return [
    '<div>',
    `<div class="session-identity__meeting">${meeting(identity)}</div>`,
    `<div class="session-identity__session">${sessionAndCircuit(identity)}</div>`,
    '<div class="session-clock">',
    `<span class="session-clock__remaining">${value(clock?.remaining)}</span>`,
    `<span class="session-clock__laps">${lapCount(clock)}</span>`,
    '</div>',
    `<div><span class="strip-label">Status</span> ${value(status)}</div>`,
    `<span class="flag-state">${flagText(flag)}</span>`,
    '</div>',
  ].join('');
}

/** Race control, newest first — what just happened, which explains what the screen shows now. */
function raceControlBlock(messages: readonly RaceControlMessage[] | undefined): string {
  const lines =
    messages === undefined || messages.length === 0
      ? `<div class="race-control__message">${value(undefined)}</div>`
      : messages.map(raceControlMessage).join('');
  return `<div class="race-control"><div class="strip-label">Race control</div>${lines}</div>`;
}

function raceControlMessage(message: RaceControlMessage): string {
  const time =
    message.time === undefined
      ? ''
      : `<span class="race-control__time">${text(message.time)}</span>`;
  return `<div class="race-control__message">${time}<span>${text(message.text)}</span></div>`;
}

/** Track and air temperature, humidity, wind and rainfall — the five readings, always in the strip. */
function weatherBlock(weather: Weather | undefined): string {
  return [
    '<div class="weather">',
    reading('Track', degrees(weather?.trackTemp)),
    reading('Air', degrees(weather?.airTemp)),
    reading('Humidity', percent(weather?.humidity)),
    reading('Wind', metresPerSecond(weather?.windSpeed)),
    reading('Rain', rainfall(weather?.raining)),
    '</div>',
  ].join('');
}

function reading(label: string, drawn: string): string {
  return `<div class="weather__reading"><span class="strip-label">${label}</span>${drawn}</div>`;
}

/**
 * Live or Replay, and — during a Live window only — the four Gated streams listed as unavailable,
 * because a silently empty stream reads as broken (#3). Once a Session has finished nothing is
 * Gated, so in Replay they are simply gone.
 */
function modeBlock(mode: SessionState['mode']): string {
  if (mode === undefined) return '<div class="session-mode"></div>';
  const badge = `<span class="mode-badge" data-mode="${mode}">${mode === 'live' ? 'Live' : 'Replay'}</span>`;
  return `<div class="session-mode">${badge}${mode === 'live' ? gatedStreams() : ''}</div>`;
}

const GATED = ['Positions', 'DRS', 'Standings', 'Stop times'];

function gatedStreams(): string {
  const streams = GATED.map(
    (name) => `<span class="gated-streams__stream">${name}</span>`,
  ).join('');
  return `<div class="gated-streams">${streams}</div>`;
}

function meeting(identity: SessionIdentity | undefined): string {
  return identity?.meeting === undefined
    ? '<span class="absent">&mdash;</span>'
    : text(identity.meeting);
}

/** "Race &middot; Circuit", each half shown only where the feed gave it. */
function sessionAndCircuit(identity: SessionIdentity | undefined): string {
  const parts = [identity?.session, identity?.circuit]
    .filter((part): part is string => part !== undefined)
    .map(text);
  return parts.length === 0 ? '<span class="absent">&mdash;</span>' : parts.join(' &middot; ');
}

function lapCount(clock: SessionClock | undefined): string {
  if (clock?.currentLap === undefined || clock.totalLaps === undefined) {
    return '<span class="absent">&mdash;</span>';
  }
  return `Lap ${clock.currentLap} / ${clock.totalLaps}`;
}

const FLAG_TEXT: Record<Flag, string> = {
  green: 'Track clear',
  yellow: 'Yellow flag',
  red: 'Red flag',
  'safety-car': 'Safety car',
  chequered: 'Chequered',
};

function flagText(flag: Flag | undefined): string {
  return flag === undefined ? '<span class="absent">&mdash;</span>' : FLAG_TEXT[flag];
}

function degrees(celsius: number | undefined): string {
  return celsius === undefined ? absentValue() : `<span class="strip-value">${celsius}&deg;C</span>`;
}

function percent(value: number | undefined): string {
  return value === undefined ? absentValue() : `<span class="strip-value">${value}%</span>`;
}

function metresPerSecond(speed: number | undefined): string {
  return speed === undefined ? absentValue() : `<span class="strip-value">${speed} m/s</span>`;
}

function rainfall(raining: boolean | undefined): string {
  return raining === undefined
    ? absentValue()
    : `<span class="strip-value">${raining ? 'Yes' : 'No'}</span>`;
}

/** A strip value the feed gave, or the absent mark wearing the same class. */
function value(shown: string | undefined): string {
  return shown === undefined ? absentValue() : `<span class="strip-value">${text(shown)}</span>`;
}

function absentValue(): string {
  return '<span class="strip-value absent">&mdash;</span>';
}

/** Upstream's text, drawn as text. A circuit name or a race control message is not markup. */
function text(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ENTITIES[character] ?? character);
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
