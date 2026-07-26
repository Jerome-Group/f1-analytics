// The picker's render (#15), fed a catalogue the way seam 2 feeds the strip. The list is a pure
// function of the catalogue — a Backfilled Session is a link, a merely-known one is not — so it is
// checked here with a catalogue handed straight in.
//
//   node test/lib/picker-render.ts <<<'[ { "name": "...", "sessions": [...] } ]'
//
// Prints the list's markup, and nothing else, so the assertions live in test/picker.test.sh.

import type { Catalogue } from '../../domain/index.ts';
import { renderCatalogue } from '../../web/picker.ts';

let json = '';
for await (const chunk of process.stdin) json += chunk;
process.stdout.write(`${renderCatalogue(JSON.parse(json) as Catalogue)}\n`);
