# EMBERLINE — Foundry Yard

A round-based tactical FPS for the make.fun `threejs-fps-01` bounty ($1,000,
deadline 2026-11-23 17:00 UTC). Single-player against bots, desktop browser,
three.js 0.187.0, static files only — no build step, no network requests.

## The game

You are Ember, attacking the Foundry Yard at dusk. The Ash crew holds two
sites: **Site A**, the west warehouse, and **Site B**, the east silo yard.
Plant the spike at either site and hold it, or wipe out the Ash crew.
First to 3 rounds (max 5) takes the match.

- **Rounds & economy** — start with $800; kills pay $300, a round win $3,250,
  a loss $1,900, a plant $300. Spend it in the buy menu between rounds.
- **Weapons** — P9 Sidearm (free), KX-9 Wasp SMG ($1,500), AR-7 Vulture
  rifle ($2,700), DMR-9 Longshot sniper ($4,500, right-click to scope), plus
  frag grenades ($300, max 2). Spread grows with movement and sustained
  fire; crouching and standing still tighten it.
- **Bots** — two Ember teammates (Rook, Vex) push the chosen site with you;
  four Ash bots (Cinder, Soot, Flint, Gravel) patrol and hold the sites,
  react to sight and sound, strafe and fire in bursts, and run to defuse a
  planted spike.
- **Tactics** — plant (hold E, 3 s) and defuse (4 s), a 35 s fuse, a 100 s
  round timer, a minimap that only shows enemies your team has recently
  seen, and a kill feed.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock the pointer) |
| Left click | Fire |
| Right click | Scope (sniper) |
| R | Reload |
| 1–4 | Switch weapon |
| G | Throw frag |
| E (hold) | Plant the spike |
| B | Buy menu (between rounds) |
| Shift | Walk quietly · Ctrl | Crouch · Space | Jump |

## Run it locally

```bash
node game/serve.ts        # serves http://localhost:8080
```

Open the page in desktop Chrome (WebGL 2), click **Click to play**, buy,
and go. Screenshots are deterministic: `?shot=start|play|buy|end&seed=N`
stages a fixed scene and sets `window.__shotReady` when the frame is ready.

## Build the dossier (what the make.fun harness runs)

```bash
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and
writes `dossier.json` with the kit's `buildDossier`. It is deterministic:
two runs write identical bytes.

## Files

- `game/index.html` — page, HUD, import map
- `game/src/game.js` — rounds, economy, shooting, grenades, plant/defuse
- `game/src/world.js` — the Foundry Yard map, waypoints, lighting
- `game/src/bots.js` — bot AI (patrol, engage, defuse)
- `game/src/weapons.js` — weapon defs and the first-person view model
- `game/src/mover.js` — shared movement and collision
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/hud.js` — HUD, minimap, buy menu
- `game/src/audio.js` — synthesised WebAudio sounds, no audio files
- `game/vendor/three/` — three.js 0.187.0, byte-for-byte from the kit
- `vendor/makefun-threejs.ts` — the kit's dossier builder, unchanged
- `screenshots/` — 3–4 real renders of the game's own code

## License

MIT. three.js files under `game/vendor/three/` keep their own MIT license.
