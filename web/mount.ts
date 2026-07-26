// Find the one element a page draws a part of itself into, or fail with what was missing rather than
// with a null a hundred lines later. Both entry points — the Timing screen (main.ts) and the picker
// (picker-main.ts) — reach for their mounts the same way, so the way is written once here.

export function mount(selector: string, what: string): Element {
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`the page has no ${what} to draw into`);
  return element;
}
