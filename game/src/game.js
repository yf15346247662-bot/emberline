// EMBERLINE: the game itself. Fixed-step simulation (60 Hz) apart from rendering,
// one state store, round/money/plant/defuse rules, hitscan shooting with tracers,
// grenades, and bot orchestration. HUD and audio are pushed to, never pulled from.
import * as THREE from 'three';
import { createWorld, WAYPOINTS } from './world.js';
import { createMover, hasLineOfSight } from './mover.js';
import { WEAPONS, FRAG_PRICE, createWeaponView } from './weapons.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createBot, updateBot, botEye, botChest, botHead } from './bots.js';
import { createHud } from './hud.js';
import { mulberry32 } from './rng.js';
import { PALETTE } from './palette.js';

const ROUND_TIME = 100;
const PLANT_TIME = 3;
const DEFUSE_TIME = 4;
const FUSE_TIME = 35;
const WIN_ROUNDS = 3;
const MAX_ROUNDS = 5;
const STEP = 1 / 60;

export class Game {
  constructor(canvas, { seed = 20261116, shot = null } = {}) {
    this.canvas = canvas;
    this.seed = seed;
    this.shot = shot;
    this.random = mulberry32(seed);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.canvas);
    this.scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 90);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);
    this.scene.add(this.camera);
    this.world = createWorld(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.audio = createAudio();
    this.time = 0;
    this.phase = 'menu'; // menu | buy | live | roundEnd | matchEnd
    this.paused = false;
    this.round = 1;
    this.score = { ember: 0, ash: 0 };
    this.money = 800;
    this.owned = new Set(['pistol']);
    this.grenades = 0;
    this.roundTimer = ROUND_TIME;
    this.spike = null;
    this.plantProgress = 0;
    this.roundEndAt = 0;
    this.matchOver = false;
    this.emberSite = 'A';
    this.fx = [];
    this.tracers = [];
    this.grenadesLive = [];
    this.shotReadyAt = 0;
    this.lastTime = performance.now();
    this.accumulator = 0;

    this.player = {
      mover: createMover(this.world.colliders, this.world.emberSpawns[1]),
      weaponView: createWeaponView(this.camera),
      health: 100, alive: true,
    };
    this.player.mover.body.yaw = 0;
    this.bots = [];
    const botDefs = [
      { name: 'Rook', team: 'ember', spawn: this.world.emberSpawns[0], weaponId: 'rifle' },
      { name: 'Vex', team: 'ember', spawn: this.world.emberSpawns[2], weaponId: 'smg' },
      { name: 'Cinder', team: 'ash', spawn: this.world.ashSpawns[0], weaponId: 'rifle', site: 'A' },
      { name: 'Soot', team: 'ash', spawn: this.world.ashSpawns[1], weaponId: 'smg', site: 'A' },
      { name: 'Flint', team: 'ash', spawn: this.world.ashSpawns[2], weaponId: 'rifle', site: 'B' },
      { name: 'Gravel', team: 'ash', spawn: this.world.ashSpawns[3], weaponId: 'sniper', site: 'B' },
    ];
    for (const def of botDefs) {
      this.bots.push(createBot(this.scene, this.world.colliders, { ...def, random: this.random }));
    }
    this.waypoints = {};
    for (const w of WAYPOINTS) this.waypoints[w.id] = new THREE.Vector3(w.x, 0, w.z);

    this.input = createInput(canvas, (locked) => {
      if (!locked && this.phase === 'live' && !this.shot) { this.paused = true; this.hud.showOverlay('paused'); }
    });
    this.hud = createHud({
      onBuy: (id) => this.buy(id),
    });
    this.hud.onPlay(() => this.onPlay());
    this.hud.onBuyReady(() => this.startRound());
    this.hud.onBuyClose(() => this.startRound());

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.hud.showOverlay('start');
    this.applyShotMode();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // --- actors ---------------------------------------------------------------
  playerActor() {
    const p = this.player;
    return {
      kind: 'player', name: 'You', team: 'ember',
      alive: () => p.alive,
      eye: () => new THREE.Vector3(p.mover.body.position.x, p.mover.body.position.y + p.mover.body.eye, p.mover.body.position.z),
      chest: () => new THREE.Vector3(p.mover.body.position.x, p.mover.body.position.y + 1.0, p.mover.body.position.z),
      head: () => new THREE.Vector3(p.mover.body.position.x, p.mover.body.position.y + 1.53, p.mover.body.position.z),
      pos: () => p.mover.body.position,
      damage: (amount) => this.damagePlayer(amount),
    };
  }
  botActor(bot) {
    return {
      kind: 'bot', name: bot.name, team: bot.team, ref: bot,
      alive: () => bot.alive,
      eye: () => botEye(bot),
      chest: () => botChest(bot),
      head: () => botHead(bot),
      pos: () => bot.mover.body.position,
      damage: (amount) => bot.damage(amount),
    };
  }
  allActors() {
    return [this.playerActor(), ...this.bots.map((b) => this.botActor(b))];
  }
  enemiesOf(team) {
    return this.allActors().filter((a) => a.team !== team);
  }

  // --- flow -----------------------------------------------------------------
  onPlay() {
    this.audio.unlock();
    this.hud.hideOverlay();
    if (this.phase === 'menu' || this.phase === 'matchEnd') {
      if (this.phase === 'matchEnd') this.resetMatch();
      this.openBuy();
      return;
    }
    if (this.paused) { this.paused = false; this.input.requestLock(); }
  }
  resetMatch() {
    this.round = 1;
    this.score = { ember: 0, ash: 0 };
    this.money = 800;
    this.owned = new Set(['pistol']);
    this.grenades = 0;
    this.matchOver = false;
  }
  openBuy() {
    this.phase = 'buy';
    this.input.releaseLock();
    this.hud.showBuy(this.round, this.money, this.owned);
    this.hud.setMoney(this.money);
    this.hud.setGrenades(this.grenades);
  }
  buy(id) {
    if (this.phase !== 'buy') return;
    if (id === 'frag') {
      if (this.grenades >= 2 || this.money < FRAG_PRICE) { this.audio.denied(); return; }
      this.money -= FRAG_PRICE; this.grenades += 1;
      this.audio.buy();
    } else {
      const w = WEAPONS[id];
      if (this.owned.has(id)) { this.equip(id); return; }
      if (this.money < w.price) { this.audio.denied(); return; }
      this.money -= w.price; this.owned.add(id);
      this.equip(id);
      this.audio.buy();
    }
    this.hud.showBuy(this.round, this.money, this.owned);
    this.hud.setMoney(this.money);
    this.hud.setGrenades(this.grenades);
  }
  equip(id) {
    this.player.weaponView.equip(WEAPONS[id]);
    this.hud.setAmmo(this.player.weaponView.state.mag, this.player.weaponView.state.reserve, WEAPONS[id].name);
  }
  startRound() {
    this.hud.hideBuy();
    this.hud.hideOverlay();
    this.phase = 'live';
    this.paused = false;
    this.roundTimer = ROUND_TIME;
    this.spike = null;
    this.plantProgress = 0;
    this.emberSite = this.round % 2 === 1 ? 'A' : 'B';
    // Reset everyone to spawns.
    this.player.alive = true;
    this.player.health = 100;
    this.player.mover.reset(this.world.emberSpawns[1], 0);
    this.player.weaponView.refill();
    this.bots[0].reset(this.world.emberSpawns[0], 0);
    this.bots[1].reset(this.world.emberSpawns[2], 0);
    this.bots[2].reset(this.world.ashSpawns[0], Math.PI);
    this.bots[3].reset(this.world.ashSpawns[1], Math.PI);
    this.bots[4].reset(this.world.ashSpawns[2], Math.PI);
    this.bots[5].reset(this.world.ashSpawns[3], Math.PI);
    this.hud.setHealth(100);
    this.hud.setScore(this.score.ember, this.score.ash, 3, 4);
    this.hud.setObjective(`Plant the spike at <b>Site ${this.emberSite}</b> — or eliminate the Ash crew`);
    this.hud.setHint('WASD move · Shift walk · Ctrl crouch · B buy (between rounds) · E plant · G frag');
    this.hud.banner('', `Round ${this.round}`, this.emberSite === 'A' ? 'Push Site A — the west warehouse' : 'Push Site B — the east silo yard');
    this.input.requestLock();
  }

  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    this.phase = 'roundEnd';
    this.roundEndAt = this.time + 3.5;
    this.score[winner] += 1;
    const won = winner === 'ember';
    const reward = won ? 3250 : 1900;
    this.money += reward;
    this.hud.setScore(this.score.ember, this.score.ash, this.aliveCount('ember'), this.aliveCount('ash'));
    this.hud.banner(won ? 'win' : 'lose', won ? 'Round won' : 'Round lost', `${reason} · +$${reward}`);
    if (won) this.audio.roundWin(); else this.audio.roundLose();
    this.input.releaseLock();
    if (this.spike && this.spike.mesh) { this.scene.remove(this.spike.mesh); }
    this.spike = null;
    this.plantProgress = 0;
    this.hud.plantBar(false, 0, '');
    const matchWon = this.score.ember >= WIN_ROUNDS || this.score.ash >= WIN_ROUNDS || this.round >= MAX_ROUNDS;
    this.matchOver = matchWon;
  }

  aliveCount(team) {
    let n = team === 'ember' && this.player.alive ? 1 : 0;
    for (const b of this.bots) if (b.team === team && b.alive) n += 1;
    return n;
  }

  // --- combat ---------------------------------------------------------------
  fireHitscan(origin, dir, spread, damage, shooterTeam, shooterName, tracerFrom) {
    // Random cone around dir.
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const a = (this.random() + this.random() + this.random() - 1.5) / 1.5;
    const b = (this.random() + this.random() + this.random() - 1.5) / 1.5;
    const d = dir.clone().addScaledVector(right, a * spread).addScaledVector(up, b * spread).normalize();
    this.raycaster.set(origin, d);
    this.raycaster.far = 120;
    const targets = [];
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      targets.push({ mesh: bot.torso, bot, part: 'body' });
      targets.push({ mesh: bot.head, bot, part: 'head' });
      targets.push({ mesh: bot.group.children[0], bot, part: 'body' });
    }
    const meshes = targets.map((t) => t.mesh).concat(this.world.shootables);
    const hits = this.raycaster.intersectObjects(meshes, false);
    const hit = hits[0];
    const end = hit ? hit.point.clone() : origin.clone().addScaledVector(d, 60);
    this.spawnTracer(tracerFrom || origin, end);
    if (!hit) return { point: end, dir: d, missed: true };
    const found = targets.find((t) => t.mesh === hit.object);
    if (!found) return { point: hit.point, blocked: true };
    const isHead = found.part === 'head';
    const mult = isHead ? found.bot.weapon.headMult : 1;
    const dealt = Math.round(damage * mult);
    const killed = found.bot.damage(dealt);
    return { point: hit.point, bot: found.bot, head: isHead, damage: dealt, killed };
  }

  playerShoot() {
    const view = this.player.weaponView;
    if (!view.ready()) { if (view.state.mag === 0) this.audio.dry(); return; }
    if (!view.takeRound()) return;
    view.pullTrigger();
    this.audio.shot(view.def.kind);
    const body = this.player.mover.body;
    const spread = view.spread(this.player.mover.groundSpeed(), body.crouching);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    body.pitch = Math.min(1.45, body.pitch + (view.def.kind === 'sniper' ? 0.05 : 0.012));
    body.yaw += (this.random() - 0.5) * (view.def.kind === 'sniper' ? 0.02 : 0.006);
    const result = this.fireHitscan(origin, dir, spread, view.def.damage, 'ember', 'You', origin.clone().addScaledVector(dir, 0.6).add(new THREE.Vector3(0.2, -0.12, 0)));
    this.hud.setAmmo(view.state.mag, view.state.reserve, view.def.name);
    if (result && result.bot) {
      this.hud.hitMarker(result.killed);
      this.audio.hit();
      if (result.killed) {
        this.audio.kill();
        this.money += 300;
        this.hud.setMoney(this.money);
        this.hud.killfeed('You', result.bot.name, 'ember', result.head);
      }
    }
    this.checkRoundEnd();
  }

  botFire(bot, target, { spread, damageScale }) {
    const eye = botEye(bot);
    const aim = this.random() < 0.12 ? target.head() : target.chest();
    const dir = aim.clone().sub(eye).normalize();
    const result = this.fireHitscan(eye, dir, spread, bot.weapon.damage * damageScale, bot.team, bot.name, eye.clone().addScaledVector(dir, 0.5));
    bot.lastShotAt = this.time;
    if (result && result.bot) {
      // A bot hit another bot.
      if (result.killed) this.hud.killfeed(bot.name, result.bot.name, bot.team, result.head);
    }
    // Did the shot hit the player? Test the player capsule with the same
    // spread ray the bots-vs-bots test used, so accuracy is one number.
    const shotDir = (result && result.dir) || dir;
    this.raycaster.set(eye, shotDir);
    this.raycaster.far = 60;
    const p = this.player.mover.body.position;
    const playerBox = new THREE.Box3(
      new THREE.Vector3(p.x - 0.34, p.y, p.z - 0.34),
      new THREE.Vector3(p.x + 0.34, p.y + 1.72, p.z + 0.34),
    );
    const hitPlayer = this.player.alive && this.raycaster.ray.intersectsBox(playerBox);
    if (hitPlayer && target.kind === 'player') {
      const isHead = this.random() < 0.08;
      const dealt = Math.round(bot.weapon.damage * damageScale * (isHead ? 2 : 1));
      this.damagePlayer(dealt);
    }
    if (target.kind === 'player') this.audio.enemyShot();
  }

  damagePlayer(amount) {
    if (!this.player.alive) return;
    this.player.health -= amount;
    this.hud.setHealth(this.player.health);
    this.hud.damageFlash();
    this.audio.hurt();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.player.alive = false;
      this.hud.setHealth(0);
      this.checkRoundEnd();
    }
  }

  throwGrenade() {
    if (this.grenades <= 0 || this.phase !== 'live' || !this.player.alive) return;
    this.grenades -= 1;
    this.hud.setGrenades(this.grenades);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e3844'), roughness: 0.5, metalness: 0.6 }),
    );
    mesh.position.copy(origin).addScaledVector(dir, 0.5);
    this.scene.add(mesh);
    this.grenadesLive.push({ mesh, vel: dir.clone().multiplyScalar(14).add(new THREE.Vector3(0, 3.5, 0)), fuse: 1.6 });
    this.audio.shot('pistol');
  }

  explode(pos) {
    this.audio.explosion();
    const flash = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 18);
    flash.position.copy(pos).y = 1;
    this.scene.add(flash);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.5 }),
    );
    shell.position.copy(pos);
    this.scene.add(shell);
    this.fx.push({ kind: 'explosion', mesh: shell, light: flash, ttl: 0.5, age: 0 });
    for (const actor of this.allActors()) {
      if (!actor.alive()) continue;
      const d = actor.pos().distanceTo(pos);
      if (d > 6.5) continue;
      const dmg = Math.round(100 - (d / 6.5) * 80);
      if (actor.kind === 'player') this.damagePlayer(dmg);
      else {
        const killed = actor.damage(dmg);
        if (killed) this.hud.killfeed('Frag', actor.name, 'ember', false);
      }
    }
    this.checkRoundEnd();
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.85 }));
    this.scene.add(line);
    this.fx.push({ kind: 'tracer', mesh: line, ttl: 0.06, age: 0 });
  }

  // --- plant / defuse ---------------------------------------------------------
  inSite(pos) {
    for (const site of this.world.sites) {
      if (pos.x >= site.minX && pos.x <= site.maxX && pos.z >= site.minZ && pos.z <= site.maxZ) return site;
    }
    return null;
  }
  plantSpike() {
    const pos = this.player.mover.body.position.clone();
    const site = this.inSite(pos);
    const geo = new THREE.BoxGeometry(0.34, 0.5, 0.34);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gold), emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 0.9, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.25, pos.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.spike = { planted: true, site: site.id, position: pos.clone(), fuseLeft: FUSE_TIME, mesh, beepAt: 0 };
    this.money += 300;
    this.hud.setMoney(this.money);
    this.audio.planted();
    this.hud.banner('win', 'Spike planted', `Site ${site.id} — hold it for ${FUSE_TIME} seconds`);
    this.hud.setObjective(`Spike planted at <b>Site ${site.id}</b> — defend it`);
    this.hud.plantBar(false, 0, '');
  }

  checkRoundEnd() {
    if (this.phase !== 'live') return;
    const emberAlive = this.aliveCount('ember');
    const ashAlive = this.aliveCount('ash');
    if (ashAlive === 0) this.endRound('ember', 'Ash crew eliminated');
    else if (emberAlive === 0) this.endRound('ash', 'Ember crew eliminated');
  }

  // --- per-step update --------------------------------------------------------
  step(dt) {
    this.time += dt;
    const body = this.player.mover.body;
    // Camera follows the player eye, always.
    this.camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
    this.camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
    if (this.phase === 'menu') {
      // Cinematic orbit for the cover shot.
      this.player.weaponView.setVisible(false);
      const t = this.time * 0.08;
      this.camera.position.set(Math.sin(t) * 13, 5.5, Math.cos(t) * 13);
      this.camera.lookAt(0, 1.2, -8);
    } else {
      this.player.weaponView.setVisible(true);
    }
    if (this.phase === 'buy' || this.phase === 'matchEnd') {
      this.camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
      this.camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
    }
    if (this.phase !== 'live' || this.paused) {
      if (this.phase === 'buy') {
        const pressed = this.input.takePressed();
        const buyKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
        const idx = buyKeys.findIndex((k) => pressed.has(k));
        if (idx >= 0) this.buy(['pistol', 'smg', 'rifle', 'sniper', 'frag'][idx]);
        if (pressed.has('Enter') || pressed.has('NumpadEnter')) this.startRound();
      }
      this.updateFx(dt);
      return;
    }
    // --- input ---
    const pressed = this.input.takePressed();
    const look = this.input.takeLook();
    if (this.input.state.locked) {
      const sens = this.input.state.aiming && this.player.weaponView.def.kind === 'sniper' ? 0.0011 : 0.0022;
      this.player.mover.look(look.x, look.y, sens);
    }
    const keys = this.input.state.keys;
    const fwd = new THREE.Vector3(-Math.sin(body.yaw), 0, -Math.cos(body.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (keys.has('KeyW')) wish.add(fwd);
    if (keys.has('KeyS')) wish.sub(fwd);
    if (keys.has('KeyD')) wish.add(right);
    if (keys.has('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight');
    const walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
    let speed = crouch ? 2.2 : walk ? 2.6 : 5.2;
    if (this.player.weaponView.def.kind === 'sniper' && this.input.state.aiming) speed *= 0.55;
    if (this.player.alive) {
      this.player.mover.step(dt, wish, speed, { jump: keys.has('Space'), crouch });
      if (wish.lengthSq() > 0 && this.time - (this.lastStepAt || 0) > (crouch ? 0.55 : 0.38)) {
        this.lastStepAt = this.time;
        this.audio.step();
      }
    }
    // Sniper zoom.
    const targetFov = this.input.state.aiming && this.player.weaponView.def.kind === 'sniper' ? 75 / 2.2 : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();
    // Weapon.
    this.player.weaponView.step(dt);
    if (pressed.has('KeyR')) { if (this.player.weaponView.reload()) this.audio.reload(); }
    if (pressed.has('Digit1') || pressed.has('Digit2') || pressed.has('Digit3') || pressed.has('Digit4')) {
      const id = ['pistol', 'smg', 'rifle', 'sniper'][['Digit1', 'Digit2', 'Digit3', 'Digit4'].findIndex((k) => pressed.has(k))];
      if (this.owned.has(id)) this.equip(id);
    }
    if (pressed.has('KeyG')) this.throwGrenade();
    if (this.input.state.firing && this.player.alive) {
      const def = this.player.weaponView.def;
      if (def.auto) { if (this.player.weaponView.ready()) this.playerShoot(); }
      else if (pressed.has('Mouse0') || this.input.state.firing) { /* semi-auto handled below */ }
    }
    // Semi-auto: fire once per click (mousedown sets firing; track edge via pressed set is
    // not available for mouse, so use a latch on the firing flag).
    if (!this.player.weaponView.def.auto && this.input.state.firing && !this._firedLatch && this.player.alive) {
      if (this.player.weaponView.ready()) this.playerShoot();
      this._firedLatch = true;
    }
    if (!this.input.state.firing) this._firedLatch = false;
    this.hud.setCrosshairSpread(this.player.weaponView.spread(this.player.mover.groundSpeed(), body.crouching) * 900);
    // --- plant ---
    if (this.player.alive && !this.spike && keys.has('KeyE')) {
      const site = this.inSite(body.position);
      if (site) {
        this.plantProgress += dt / PLANT_TIME;
        this.hud.plantBar(true, this.plantProgress, `Planting spike — Site ${site.id}`);
        if (Math.floor(this.plantProgress * 6) !== Math.floor((this.plantProgress - dt / PLANT_TIME) * 6)) this.audio.plantTick();
        if (this.plantProgress >= 1) this.plantSpike();
      } else {
        this.plantProgress = 0;
        this.hud.plantBar(false, 0, '');
      }
    } else {
      this.plantProgress = 0;
      if (!this.spike) this.hud.plantBar(false, 0, '');
    }
    // --- spike fuse ---
    if (this.spike && this.spike.planted) {
      this.spike.fuseLeft -= dt;
      if (this.time > (this.spike.beepAt || 0)) { this.audio.plantTick(); this.spike.beepAt = this.time + Math.max(0.4, this.spike.fuseLeft / 12); }
      if (this.spike.fuseLeft <= 0) {
        this.explode(this.spike.position);
        const mesh = this.spike.mesh;
        if (mesh) this.scene.remove(mesh);
        this.spike = null;
        if (this.phase === 'live') this.endRound('ember', 'Spike detonated');
      }
    }
    // --- timer ---
    this.roundTimer -= dt;
    if (this.roundTimer <= 0 && !this.spike) {
      this.endRound('ash', 'Time expired — spike never planted');
    }
    // --- bots ---
    const ctx = {
      time: this.time, dt, raycaster: this.raycaster, shootables: this.world.shootables,
      waypoints: this.waypoints, random: this.random,
      spike: this.spike, emberGoal: this.waypoints[this.emberSite === 'A' ? 'siteA' : 'siteB'],
      enemies: null, fire: (b, t, o) => this.botFire(b, t, o),
      onDefused: () => { if (this.phase === 'live') this.endRound('ash', 'Spike defused'); },
    };
    for (const bot of this.bots) {
      ctx.enemies = this.enemiesOf(bot.team);
      updateBot(bot, dt, ctx);
      if (bot.defuseProgress > 0) this.hud.plantBar(true, bot.defuseProgress / DEFUSE_TIME, `${bot.name} is defusing the spike!`);
      else if (!this.spike) this.hud.plantBar(false, 0, '');
    }
    // --- grenades ---
    for (const g of [...this.grenadesLive]) {
      g.fuse -= dt;
      g.vel.y -= 12 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y < 0.09) { p.y = 0.09; g.vel.y = Math.abs(g.vel.y) * 0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      if (p.x < -22.6 || p.x > 22.6) { g.vel.x *= -0.4; p.x = Math.max(-22.6, Math.min(22.6, p.x)); }
      if (p.z < -18.6 || p.z > 18.6) { g.vel.z *= -0.4; p.z = Math.max(-18.6, Math.min(18.6, p.z)); }
      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.grenadesLive.splice(this.grenadesLive.indexOf(g), 1);
        this.explode(p.clone());
      }
    }
    this.updateFx(dt);
    // --- HUD ---
    this.hud.setTimer(this.spike ? this.spike.fuseLeft : this.roundTimer, 'live');
    this.hud.setScore(this.score.ember, this.score.ash, this.aliveCount('ember'), this.aliveCount('ash'));
    const friends = this.bots.filter((b) => b.team === 'ember' && b.alive).map((b) => ({ x: b.mover.body.position.x, z: b.mover.body.position.z }));
    const visibleEnemies = this.bots.filter((b) => b.team === 'ash' && b.alive && this.time - (b.lastSeenAt || -99) < 1.5).map((b) => ({ x: b.mover.body.position.x, z: b.mover.body.position.z }));
    this.hud.drawMinimap(this.world, { x: body.position.x, z: body.position.z, yaw: body.yaw }, friends, visibleEnemies, this.spike);
    this.checkRoundEnd();
  }

  updateFx(dt) {
    for (const f of [...this.fx]) {
      f.age += dt;
      if (f.kind === 'tracer') f.mesh.material.opacity = 0.85 * (1 - f.age / f.ttl);
      if (f.kind === 'explosion') {
        const k = f.age / f.ttl;
        f.mesh.scale.setScalar(1 + k * 5);
        f.mesh.material.opacity = 0.5 * (1 - k);
        f.light.intensity = 60 * (1 - k);
      }
      if (f.age >= f.ttl) {
        this.scene.remove(f.mesh);
        if (f.light) this.scene.remove(f.light);
        this.fx.splice(this.fx.indexOf(f), 1);
      }
    }
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const frameDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.accumulator += frameDt;
    let guard = 0;
    while (this.accumulator >= STEP && guard < 8) {
      this.step(STEP);
      this.accumulator -= STEP;
      guard += 1;
    }
    if (guard === 8) this.accumulator = 0;
    // Round-end sequencing lives outside the fixed step.
    if (this.phase === 'roundEnd' && this.time >= this.roundEndAt) {
      this.round += 1;
      if (this.matchOver) {
        this.phase = 'matchEnd';
        const won = this.score.ember > this.score.ash;
        this.hud.showOverlay(won ? 'matchWin' : 'matchLose', `Final score Ember ${this.score.ember} — Ash ${this.score.ash}. ${won ? 'The Foundry Yard is yours.' : 'The Ash crew holds the yard.'}`);
      } else {
        this.openBuy();
      }
    }
    this.renderer.render(this.scene, this.camera);
    if (this.shot && !this.shotReadyAt) this.shotReadyAt = now + 400;
    if (this.shot && this.shotReadyAt && now >= this.shotReadyAt && !window.__shotReady) {
      window.__shotReady = true;
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyShotMode() {
    if (!this.shot) return;
    window.__emberline = this;
    if (this.shot === 'start') {
      // Menu orbit already runs; nothing else to do.
      return;
    }
    if (this.shot === 'buy') {
      this.openBuy();
      this.money = 3250;
      this.hud.showBuy(2, 3250, new Set(['pistol']));
      return;
    }
    if (this.shot === 'play') {
      this.hud.hideOverlay();
      this.phase = 'live';
      this.paused = true; // freeze input; the scene is staged, not played
      this.roundTimer = ROUND_TIME;
      this.emberSite = 'A';
      this.player.alive = true; this.player.health = 100;
      this.player.mover.reset(new THREE.Vector3(0, 0, 12), 0);
      this.equip('rifle');
      this.owned.add('rifle');
      this.grenades = 1;
      this.hud.setGrenades(1);
      this.hud.setHealth(100);
      this.hud.setScore(0, 0, 3, 4);
      this.hud.setObjective('Plant the spike at <b>Site A</b> — or eliminate the Ash crew');
      // Stage the bots mid-push so the frame reads as a game in progress:
      // friendly bots ahead of the player, Ash bots visible near mid.
      this.bots[0].reset(new THREE.Vector3(-3, 0, 6), 0);
      this.bots[1].reset(new THREE.Vector3(3.5, 0, 7), 0);
      this.bots[2].reset(new THREE.Vector3(-6, 0, -2), Math.PI);
      this.bots[3].reset(new THREE.Vector3(5, 0, -4), Math.PI);
      this.bots[4].reset(new THREE.Vector3(10, 0, -6), Math.PI);
      this.bots[5].reset(new THREE.Vector3(-11, 0, -5), Math.PI);
      // Advance the bots a few seconds so they are not standing on their spawns.
      for (let i = 0; i < 180; i += 1) {
        const ctx = {
          time: this.time, dt: STEP, raycaster: this.raycaster, shootables: this.world.shootables,
          waypoints: this.waypoints, random: this.random,
          spike: null, emberGoal: this.waypoints.siteA,
          enemies: [], fire: () => {}, onDefused: () => {},
        };
        for (const bot of this.bots) { ctx.enemies = this.enemiesOf(bot.team); updateBot(bot, STEP, ctx); }
        this.time += STEP;
      }
      this.paused = false;
      return;
    }
    if (this.shot === 'end') {
      this.score = { ember: 3, ash: 1 };
      this.phase = 'matchEnd';
      this.hud.showOverlay('matchWin', 'Final score Ember 3 — Ash 1. The Foundry Yard is yours.');
      return;
    }
  }
}
