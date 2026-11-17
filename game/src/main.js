// Boot: read ?shot=… for deterministic captures, start the game, and expose a
// small debug hook so play-tests can drive the game from the console.
import { Game } from './game.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || '20261116');

const canvas = document.getElementById('scene');
const game = new Game(canvas, { seed, shot });

window.__emberline = game;
// Debug hook for play-testing: __emberline.debug.state(), .winRound(),
// .loseRound(), .teleport(x, z), .give(money).
game.debug = {
  state() {
    return {
      phase: game.phase, round: game.round, score: game.score, money: game.money,
      health: game.player.health, alive: game.player.alive,
      timer: game.roundTimer, spike: game.spike ? { site: game.spike.site, fuse: game.spike.fuseLeft } : null,
      bots: game.bots.map((b) => ({ name: b.name, team: b.team, hp: b.health, alive: b.alive, state: b.state })),
      pos: game.player.mover.body.position.toArray().map((n) => Math.round(n * 100) / 100),
    };
  },
  winRound() { for (const b of game.bots) if (b.team === 'ash' && b.alive) b.damage(999); game.checkRoundEnd(); },
  loseRound() { game.player.health = 1; game.damagePlayer(999); for (const b of game.bots) if (b.team === 'ember' && b.alive) b.damage(999); game.checkRoundEnd(); },
  teleport(x, z) { game.player.mover.body.position.set(x, 0, z); },
  give(money) { game.money = money; game.hud.setMoney(money); },
};
