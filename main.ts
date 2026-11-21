// Midnight Gallery — a top-down stealth game, handed in by this program.
//
// The game itself is plain static files under game/ (game/index.html plus its ES
// modules, no library, no network request at all), and this program copies game/
// and screenshots/ from beside this file into the output directory and writes
// /output/dossier.json with the make.fun library, so the judge can read the
// game. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally for play-testing with any static server pointed at
// game/ (for example `python3 -m http.server` inside game/), then open
// http://localhost:8000 in a desktop browser.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's own caps: only text_max_bytes shapes the dossier's bytes; the rest
// refuse an entry the scorer would refuse (more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files in all, or a
// path under game/ over 1000 bytes — game/ shares /output's own 1000-entry cap
// with screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
