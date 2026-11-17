// Bots: one class for both teams. A bot patrols its site on a waypoint path,
// investigates gunfire, and on seeing an enemy stops, strafes and fires in
// bursts after a human-like reaction delay. Ash bots run to defuse a planted
// spike; Ember bots push the chosen site with the player.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover, hasLineOfSight } from './mover.js';
import { findPath } from './world.js';
import { WEAPONS } from './weapons.js';

const BODY = new THREE.BoxGeometry(0.52, 0.78, 0.3);
const HEAD = new THREE.SphereGeometry(0.155, 14, 10);
const GUN = new THREE.BoxGeometry(0.07, 0.09, 0.55);
const LEGS = new THREE.BoxGeometry(0.44, 0.6, 0.26);

function nameSprite(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(10,12,16,0.72)';
  g.fillRect(0, 0, 256, 48);
  g.fillStyle = color;
  g.font = 'bold 26px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 26);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.28, 1);
  return sprite;
}

export function createBot(scene, colliders, { name, team, spawn, weaponId = 'rifle', site = null, random }) {
  const color = team === 'ember' ? PALETTE.teal : PALETTE.ash;
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'ember' ? '#2e5a52' : '#5a2e30'), roughness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161a'), roughness: 0.8 });
  const group = new THREE.Group();
  const legs = new THREE.Mesh(LEGS, darkMat); legs.position.y = 0.3;
  const torso = new THREE.Mesh(BODY, torsoMat); torso.position.y = 1.0;
  const head = new THREE.Mesh(HEAD, headMat); head.position.y = 1.53;
  const gun = new THREE.Mesh(GUN, darkMat); gun.position.set(0.28, 1.05, -0.2);
  const tag = nameSprite(name, color); tag.position.y = 1.95;
  group.add(legs, torso, head, gun, tag);
  group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  group.position.copy(spawn);
  scene.add(group);
  const mover = createMover(colliders, spawn);
  const bot = {
    name, team, group, torso, head, mover, site, random,
    weapon: WEAPONS[weaponId],
    health: 100, alive: true, fall: 0,
    state: 'patrol', path: [], pathIndex: 0,
    idleUntil: 0, target: null, lastSeen: null, lastSeenAt: -99, reactAt: 0,
    burstLeft: 0, nextShotAt: 0, strafeDir: 1, strafeUntil: 0,
    defuseProgress: 0, heardAt: -99, heardPos: null,
    reset(pos, yaw) {
      bot.health = 100; bot.alive = true; bot.fall = 0;
      bot.group.rotation.set(0, 0, 0); bot.group.visible = true;
      bot.mover.reset(pos, yaw);
      bot.state = 'patrol'; bot.path = []; bot.pathIndex = 0;
      bot.target = null; bot.lastSeen = null; bot.defuseProgress = 0; bot.burstLeft = 0;
    },
    damage(amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health <= 0) { bot.health = 0; bot.alive = false; bot.fall = 0.0001; return true; }
      return false;
    },
  };
  return bot;
}

export function botEye(bot) {
  return new THREE.Vector3(bot.mover.body.position.x, bot.mover.body.position.y + bot.mover.body.eye, bot.mover.body.position.z);
}
export function botChest(bot) {
  return new THREE.Vector3(bot.mover.body.position.x, bot.mover.body.position.y + 1.0, bot.mover.body.position.z);
}
export function botHead(bot) {
  return new THREE.Vector3(bot.mover.body.position.x, bot.mover.body.position.y + 1.53, bot.mover.body.position.z);
}

function aimAt(bot, point) {
  const p = bot.mover.body.position;
  const dx = point.x - p.x, dy = point.y - (p.y + bot.mover.body.eye), dz = point.z - p.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  bot.mover.body.yaw = Math.atan2(-dx, -dz);
  bot.mover.body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
}

// ctx: { time, dt, raycaster, shootables, enemies(bot)->actors, fire(shooter, target, opts),
//       spike, siteId, random, onNoise }
// enemies: array of { kind:'player'|'bot', ref, alive(), eye(), chest(), head(), pos() }
export function updateBot(bot, dt, ctx) {
  const body = bot.mover.body;
  if (!bot.alive) {
    if (bot.fall > 0 && bot.fall < 1) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
    }
    return;
  }
  const time = ctx.time;
  // --- sensing: nearest visible enemy ---
  let seen = null; let seenDist = Infinity;
  const eye = botEye(bot);
  for (const e of ctx.enemies) {
    if (!e.alive()) continue;
    const ep = e.eye();
    const dist = eye.distanceTo(ep);
    if (dist > 40) continue;
    if (hasLineOfSight(ctx.raycaster, eye, ep, ctx.shootables)) {
      if (dist < seenDist) { seenDist = dist; seen = e; }
    }
  }
  if (seen) {
    if (bot.target !== seen) { bot.target = seen; bot.reactAt = time + 0.45 + bot.random() * 0.35; bot.burstLeft = 0; }
    bot.lastSeen = seen.eye(); bot.lastSeenAt = time;
  } else if (bot.target && time - bot.lastSeenAt > 2.5) {
    bot.target = null;
  }
  // --- defuse duty beats everything for Ash when the spike is planted ---
  const spike = ctx.spike;
  if (bot.team === 'ash' && spike && spike.planted && !spike.exploded) {
    const sp = spike.position;
    const d = Math.hypot(body.position.x - sp.x, body.position.z - sp.z);
    if (d < 1.8) {
      bot.state = 'defuse';
      aimAt(bot, new THREE.Vector3(sp.x, 0.6, sp.z));
      bot.defuseProgress += dt;
      if (bot.defuseProgress >= 4) ctx.onDefused(bot);
      bot.group.position.copy(body.position);
      bot.group.rotation.y = body.yaw;
      return;
    }
    bot.state = 'defuse-run';
    followPath(bot, dt, sp, ctx, 3.6);
    bot.group.position.copy(body.position);
    bot.group.rotation.y = body.yaw;
    return;
  }
  bot.defuseProgress = 0;
  // --- combat ---
  if (bot.target) {
    const tp = bot.lastSeen;
    aimAt(bot, tp);
    const wish = new THREE.Vector3();
    if (time > bot.strafeUntil) { bot.strafeDir = bot.random() < 0.5 ? -1 : 1; bot.strafeUntil = time + 0.7 + bot.random() * 0.9; }
    const sin = Math.sin(body.yaw), cos = Math.cos(body.yaw);
    wish.set(cos * bot.strafeDir, 0, -sin * bot.strafeDir);
    bot.mover.step(dt, wish, 1.6, {});
    if (time >= bot.reactAt) {
      if (bot.burstLeft <= 0) {
        if (time >= bot.nextShotAt) { bot.burstLeft = 3 + Math.floor(bot.random() * 3); bot.nextShotAt = time + 0.55 + bot.random() * 0.55; }
      } else if (time >= bot.nextShotAt) {
        bot.nextShotAt = time + 0.13;
        bot.burstLeft -= 1;
        ctx.fire(bot, bot.target, { spread: 0.024 + bot.random() * 0.012, damageScale: 0.62 });
      }
    }
    bot.group.position.copy(body.position);
    bot.group.rotation.y = body.yaw;
    return;
  }
  // --- movement: follow the objective path, or patrol the home site ---
  let goal = null; let speed = 3.4;
  if (bot.team === 'ember') {
    goal = ctx.emberGoal; // a waypoint id or a Vector3
  } else {
    // Ash holds its site: drift between two patrol nodes near the site.
    if (!bot.patrolTarget || time > bot.idleUntil) {
      const nodes = bot.site === 'A' ? ['siteA', 'northA', 'west'] : ['siteB', 'northB', 'east'];
      bot.patrolTarget = nodes[Math.floor(bot.random() * nodes.length)];
      bot.idleUntil = time + 4 + bot.random() * 4;
    }
    goal = bot.patrolTarget;
  }
  if (goal) {
    const target = typeof goal === 'string' ? ctx.waypoints[goal] : goal;
    followPath(bot, dt, target, ctx, speed);
  }
  bot.group.position.copy(body.position);
  bot.group.rotation.y = body.yaw;
}

function followPath(bot, dt, target, ctx, speed) {
  if (!target) return;
  const body = bot.mover.body;
  const dx = target.x - body.position.x;
  const dz = target.z - body.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.6) { bot.path = []; return; }
  // Steer along the waypoint graph when far away; direct when close.
  if (dist > 6) {
    if (!bot.path.length || bot.pathIndex >= bot.path.length) {
      const nodes = findPath(body.position, nearestWaypointId(target));
      bot.path = nodes; bot.pathIndex = 0;
    }
    const node = bot.path[bot.pathIndex];
    if (node) {
      const ndx = node.x - body.position.x, ndz = node.z - body.position.z;
      if (Math.hypot(ndx, ndz) < 0.8) { bot.pathIndex += 1; }
      else { moveToward(bot, dt, node.x, node.z, speed); return; }
    }
  }
  moveToward(bot, dt, target.x, target.z, speed);
}

function nearestWaypointId(target) {
  // Map a site target to its waypoint id.
  if (target.x < -10) return 'siteA';
  if (target.x > 10) return 'siteB';
  return 'mid';
}

function moveToward(bot, dt, x, z, speed) {
  const body = bot.mover.body;
  const dx = x - body.position.x, dz = z - body.position.z;
  const len = Math.hypot(dx, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  const wish = new THREE.Vector3(dx / len, 0, dz / len);
  bot.mover.step(dt, wish, speed, {});
}
