// Weapons: four guns with different damage, spread, recoil, fire rate and price,
// plus the frag grenade. Stopping to aim pays: spread grows with movement speed
// and with sustained fire, and crouching tightens it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'P9 Sidearm', key: '1', price: 0, kind: 'pistol', mag: 12, reserve: 36, damage: 34, headMult: 2.2, gap: 0.16, reload: 1.1, spreadStill: 0.003, spreadMove: 0.02, auto: false, zoom: 1 },
  smg: { id: 'smg', name: 'KX-9 Wasp SMG', key: '2', price: 1500, kind: 'smg', mag: 30, reserve: 90, damage: 22, headMult: 2, gap: 0.075, reload: 1.6, spreadStill: 0.006, spreadMove: 0.024, auto: true, zoom: 1 },
  rifle: { id: 'rifle', name: 'AR-7 Vulture', key: '3', price: 2700, kind: 'rifle', mag: 25, reserve: 75, damage: 33, headMult: 2.4, gap: 0.1, reload: 1.9, spreadStill: 0.002, spreadMove: 0.026, auto: true, zoom: 1 },
  sniper: { id: 'sniper', name: 'DMR-9 Longshot', key: '4', price: 4500, kind: 'sniper', mag: 5, reserve: 15, damage: 88, headMult: 2.5, gap: 0.9, reload: 2.6, spreadStill: 0.0006, spreadMove: 0.05, auto: false, zoom: 2.2 },
};
export const FRAG_PRICE = 300;

export function createWeaponView(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2, emissive: new THREE.Color('#14181d'), emissiveIntensity: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#aab4bd'), roughness: 0.4, metalness: 0.5, emissive: new THREE.Color('#14181d'), emissiveIntensity: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23272d'), roughness: 0.6, metalness: 0.3, emissive: new THREE.Color('#0e1114'), emissiveIntensity: 0.7 });
  const model = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.22, -0.98);
  flash.rotation.z = Math.PI / 4;
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.15, -0.6);
  camera.add(flashLight);
  let def = WEAPONS.pistol;
  function rebuild() {
    model.clear();
    const len = def.kind === 'sniper' ? 0.62 : def.kind === 'pistol' ? 0.26 : 0.46;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), metal);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, len * 0.7), grip);
    barrel.position.set(0, 0.025, -len * 0.7);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, len * 0.5);
    model.add(receiver, barrel, stock);
    if (def.kind === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, 0.05);
      model.add(scope);
    }
    if (def.kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.07), dark);
      mag.position.set(0, -0.14, -0.05);
      model.add(mag);
    }
    model.position.set(0.26, -0.24, -0.5);
    model.rotation.set(0, -0.08, 0);
    model.scale.setScalar(0.55);
  }
  rebuild();
  camera.add(model);
  const state = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0 };
  return {
    state,
    get def() { return def; },
    setVisible(v) { model.visible = v; if (!v) flash.visible = false; },
    equip(next) {
      def = next;
      state.mag = next.mag; state.reserve = next.reserve;
      state.cooldown = 0; state.reloadLeft = 0; state.flash = 0; state.kick = 0; state.bloom = 0;
      rebuild();
    },
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.bloom = Math.max(0, state.bloom - dt * 0.9);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      model.position.z = -0.5 + state.kick;
      model.rotation.x = state.kick * 2.4;
      flash.visible = state.flash > 0;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const take = Math.min(def.mag - state.mag, state.reserve);
          state.mag += take; state.reserve -= take;
        }
      }
    },
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() { state.cooldown = def.gap; state.flash = 0.06; state.kick = def.kind === 'sniper' ? 0.11 : 0.055; state.bloom = Math.min(1, state.bloom + (def.kind === 'sniper' ? 0.5 : 0.16)); },
    takeRound() { if (state.mag <= 0) return false; state.mag -= 1; return true; },
    reload() { if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false; state.reloadLeft = def.reload; return true; },
    refill() { state.mag = def.mag; state.reserve = def.reserve; state.cooldown = 0; state.reloadLeft = 0; state.flash = 0; state.kick = 0; state.bloom = 0; },
    spread(speed, crouching) {
      const move = Math.min(1, speed / 5.2);
      let s = def.spreadStill + move * def.spreadMove + state.bloom * 0.012;
      if (crouching) s *= 0.7;
      return s;
    },
  };
}
