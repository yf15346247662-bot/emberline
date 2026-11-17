// EMBERLINE — main.ts
// The program the make.fun harness runs. It copies game/ and screenshots/ into
// the output directory and writes dossier.json describing them, so the judge
// reads exactly the files that were built. No network, no wall clock, no
// randomness: two runs produce the same bytes.
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || join(__dirname, 'out'));

async function walk(dir, base) {
  const entries = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) entries.push(...await walk(p, base));
    else entries.push({ path: p, rel: p.slice(base.length + 1), size: s.size });
  }
  return entries;
}

async function main() {
  await mkdir(out, { recursive: true });
  await cp(join(__dirname, 'game'), join(out, 'game'), { recursive: true });
  await cp(join(__dirname, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  const dossier = await buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  const { writeFile } = await import('node:fs/promises');
  // buildDossier returns the dossier JSON as bytes; write them as-is.
  await writeFile(join(out, 'dossier.json'), dossier);
  const gameFiles = await walk(join(out, 'game'), out);
  const shotFiles = await walk(join(out, 'screenshots'), out);
  console.log(`EMBERLINE dossier written to ${join(out, 'dossier.json')}`);
  console.log(`game files: ${gameFiles.length}, game bytes: ${gameFiles.reduce((a, f) => a + f.size, 0)}`);
  console.log(`screenshots: ${shotFiles.map((f) => f.rel).join(', ')}`);
}

await main();
