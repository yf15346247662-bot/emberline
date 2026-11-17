// One movement model for the player and every bot: acceleration, friction,
// gravity, jump and crouch, resolved as a box against the world's colliders one
// axis at a time, so a wall never swallows a body and sliding along it works.
import * as THREE from 'three';

const RADIUS = 0.34;
const GRAVITY = 20;

export function createMover(colliders, start) {
  const body = {
    position: start.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    eye: 1.6, onGround: true, crouching: false, height: 1.72,
  };
  const probe = new THREE.Box3();
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }
  // wish: unit xz direction. speed: target speed. dt: fixed step.
  function step(dt, wish, speed, { jump = false, crouch = false, accel = 42, friction = 9 } = {}) {
    const standH = 1.72, crouchH = 1.12;
    if (crouch && !body.crouching) { body.crouching = true; body.height = crouchH; }
    else if (!crouch && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, standH, 0.02)) {
      body.crouching = false; body.height = standH;
    }
    const eyeTarget = body.crouching ? 1.02 : 1.6;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);
    const blend = Math.min(1, (body.onGround ? accel : 9) * dt / Math.max(speed, 0.1));
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - friction * dt);
      body.velocity.x *= damp; body.velocity.z *= damp;
    }
    if (jump && body.onGround) { body.velocity.y = 6.2; body.onGround = false; }
    body.velocity.y -= GRAVITY * dt;
    const nx = body.position.x + body.velocity.x * dt;
    if (!overlaps(nx, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nx; else body.velocity.x = 0;
    const nz = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nz, body.height, 0.04)) body.position.z = nz; else body.velocity.z = 0;
    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) { body.position.y = hit.max.y; body.velocity.y = 0; body.onGround = true; }
    else if (hit) { body.position.y = hit.min.y - body.height; body.velocity.y = 0; }
    if (body.position.y < 0) { body.position.y = 0; body.velocity.y = 0; body.onGround = true; }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }
  return {
    body, step,
    look(dx, dy, sensitivity = 0.0022) {
      body.yaw -= dx * sensitivity;
      body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
    },
    recoil(pitchKick, yawKick) {
      body.pitch = Math.min(1.45, body.pitch + pitchKick);
      body.yaw += yawKick;
    },
    groundSpeed() { return Math.hypot(body.velocity.x, body.velocity.z); },
    reset(pos, yaw = 0) {
      body.position.copy(pos); body.velocity.set(0, 0, 0);
      body.yaw = yaw; body.pitch = 0; body.eye = 1.6; body.height = 1.72; body.crouching = false;
    },
  };
}

// Line of sight between two eye positions, blocked by any shootable mesh.
export function hasLineOfSight(raycaster, from, to, shootables) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  raycaster.set(from, dir.normalize());
  raycaster.far = dist - 0.3;
  return raycaster.intersectObjects(shootables, false).length === 0;
}
