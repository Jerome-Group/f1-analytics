// How this project writes a time down. Both the Timing screen's rows and the opened Driver's panel
// draw lap and sector times, so the shape they are written in lives here rather than once in each,
// where the two would eventually disagree about whether `1:02.550` keeps its minutes.

/**
 * Milliseconds as the timing screen reads them: `2.418`, `12.345`, and `1:02.550` once a minute is
 * crossed. The minutes place is dropped below a minute and the seconds are only padded once there is
 * a minute in front of them to pad against — a lone `2.418`, but a `1:02.550`.
 */
export function timeText(millis: number): string {
  const minutes = Math.floor(millis / 60_000);
  const seconds = Math.floor((millis % 60_000) / 1000);
  const thousandths = String(millis % 1000).padStart(3, '0');
  if (minutes === 0) return `${seconds}.${thousandths}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${thousandths}`;
}

/**
 * A moment on the Session's own clock, as hours, minutes and seconds. The feed dates everything in
 * UTC and the model carries those dates unchanged (domain/session-state.ts), so this reads them in
 * UTC too: a radio clip is placed against the Session it was broadcast in, not against the afternoon
 * the viewer happens to be watching it from.
 */
export function timeOfDay(at: number): string {
  return new Date(at).toISOString().slice(11, 19);
}
