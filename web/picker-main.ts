// The picker's bootstrap (#15): read which season to show from the page's own query, fetch that
// season's catalogue from the port this page came from, and draw it. The drawing is the picker's own
// pure function (picker.ts); this file is only the fetch and the mount, which is why it is here and
// not there — the same split the Timing screen keeps between its render and `main.ts`.

import type { Catalogue } from '../domain/index.ts';
import { renderCatalogue } from './picker.ts';
import { mount } from './mount.ts';

/** The season shown when the page names none. The seasons on disk are whichever have been catalogued
 * and Backfilled; 2025 is the first the project carried, so it is where the picker opens. */
const DEFAULT_YEAR = 2025;

const list = mount('.picker-mount', 'catalogue');
const params = new URLSearchParams(location.search);
const year = Number(params.get('year')) || DEFAULT_YEAR;

// The season and the way to the ones either side of it — the catalogue is a year at a time, so moving
// between them is moving between pages.
const heading = document.querySelector('.picker-season');
if (heading !== null) heading.textContent = String(year);
const previous = document.querySelector('.picker-previous');
if (previous !== null) previous.setAttribute('href', `?year=${year - 1}`);
const following = document.querySelector('.picker-following');
if (following !== null) following.setAttribute('href', `?year=${year + 1}`);

async function load(): Promise<void> {
  list.innerHTML = '<p class="picker__empty">Reading the catalogue&hellip;</p>';
  try {
    const response = await fetch(`/catalogue?year=${year}`);
    if (!response.ok) throw new Error(String(response.status));
    list.innerHTML = renderCatalogue((await response.json()) as Catalogue);
  } catch {
    // The ordinary reason is the stack being down, and the picker cannot fill itself without it.
    list.innerHTML =
      '<p class="picker__empty">The catalogue could not be read. Is the stack up (<code>bin/up</code>)?</p>';
  }
}

void load();
