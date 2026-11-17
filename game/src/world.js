// Foundry Yard: an original industrial map, 46 x 38 m. Ember attacks from the
// south gate; Ash holds two sites in the north — Site A, the west warehouse, and
// Site B, the east silo yard — with a foundry hall and three lanes between them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITES = [
  { id: 'A', name: 'Site A', center: new THREE.Vector3(-16, 0, -10), minX: -20.5, maxX: -11.5, minZ: -14.5, maxZ: -5.5 },
  { id: 'B', name: 'Site B', center: new THREE.Vector3(16, 0, -10), minX: 11.5, maxX: 20.5, minZ: -14.5, maxZ: -5.5 },
];

export const WAYPOINTS = [
  { id: 'gate', x: 0, z: 15, links: ['sw', 'se', 'midS'] },
  { id: 'sw', x: -8, z: 10, links: ['gate', 'west', 'midS'] },
  { id: 'se', x: 8, z: 10, links: ['gate', 'east', 'midS'] },
  { id: 'midS', x: 0, z: 8, links: ['gate', 'sw', 'se', 'mid'] },
  { id: 'mid', x: 0, z: 0, links: ['midS', 'west', 'east', 'midN'] },
  { id: 'west', x: -14, z: 2, links: ['sw', 'mid', 'siteA'] },
  { id: 'east', x: 14, z: 2, links: ['se', 'mid', 'siteB'] },
  { id: 'midN', x: 0, z: -8, links: ['mid', 'northA', 'northB'] },
  { id: 'siteA', x: -16, z: -10, links: ['west', 'northA'] },
  { id: 'siteB', x: 16, z: -10, links: ['east', 'northB'] },
  { id: 'northA', x: -8, z: -13, links: ['midN', 'siteA', 'northB'] },
  { id: 'northB', x: 8, z: -13, links: ['midN', 'siteB', 'northA'] },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {};
  for (const [name, hex] of Object.entries(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: name === 'ink' ? 0.55 : 0.9, metalness: 0.05 });
  }
  const colliders = [];
  const shootables = [];
  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  function cylinder(r, h, x, z, mat, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), mats[mat]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  // Ground and perimeter, 5 m walls, open dusk sky.
  box(46.4, 0.4, 38.4, 0, -0.2, 0, 'floor');
  box(0.4, 5, 38.4, -23.2, 2.5, 0, 'wall');
  box(0.4, 5, 38.4, 23.2, 2.5, 0, 'wall');
  box(46.4, 5, 0.4, 0, 2.5, -19.2, 'wall');
  box(46.4, 5, 0.4, 0, 2.5, 19.2, 'wall');
  // Site A warehouse: low roof slab on columns, open front, crates inside.
  box(9, 0.5, 9, -16, 3.6, -10, 'wall');
  box(0.5, 3.6, 0.5, -20.2, 1.8, -14.2, 'wall');
  box(0.5, 3.6, 0.5, -11.8, 1.8, -14.2, 'wall');
  box(0.5, 3.6, 0.5, -20.2, 1.8, -5.8, 'wall');
  box(2.2, 1.1, 1.2, -18.5, 0.55, -12.5, 'crate');
  box(1.2, 1.1, 2.2, -13.5, 0.55, -8, 'crate');
  box(1.2, 2.2, 1.2, -19, 1.1, -7.5, 'container');
  // Site B silo yard: two tall silos, a container stack, barrels.
  cylinder(2.2, 6.5, 18.5, -13, 'container');
  cylinder(2.2, 6.5, 13.5, -13.5, 'containerB');
  box(2.4, 1.2, 1.2, 16, 0.6, -7, 'crate');
  box(1.2, 1.2, 2.4, 13, 0.6, -11.5, 'crate');
  box(2.4, 2.4, 1.2, 19.5, 1.2, -8, 'containerB');
  cylinder(0.55, 1.1, 14.5, -6.5, 'crate');
  cylinder(0.55, 1.1, 15.6, -6.5, 'crate');
  // Foundry hall, mid: furnace block, pillars, gantry beam.
  box(4, 3.4, 2.4, 0, 1.7, -4.5, 'wall');
  box(1, 4.6, 1, -4, 2.3, -1, 'wall');
  box(1, 4.6, 1, 4, 2.3, -1, 'wall');
  box(9, 0.6, 1, 0, 4.4, -1, 'hairline');
  box(3.4, 1.1, 1.2, -6.5, 0.55, 4, 'crate');
  box(1.2, 1.1, 3.4, 6.5, 0.55, 4, 'crate');
  // Lane cover: containers and crates down the west, mid and east lanes.
  box(3, 2.6, 1.4, -14, 1.3, 6, 'container');
  box(1.4, 1.1, 1.4, -11, 0.55, -3, 'crate');
  box(3, 2.6, 1.4, 14, 1.3, 6, 'containerB');
  box(1.4, 1.1, 1.4, 11, 0.55, -3, 'crate');
  box(2, 0.9, 2, -3, 0.45, 11, 'crate');
  box(2, 0.9, 2, 3, 0.45, 11, 'crate');
  box(1.6, 1.6, 1.6, -18, 0.8, 3, 'container');
  box(1.6, 1.6, 1.6, 18, 0.8, 3, 'containerB');
  // Site markers: glowing floor plates so a site reads at a glance.
  for (const site of SITES) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(site.maxX - site.minX, 0.06, site.maxZ - site.minZ),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gold), emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 0.25, roughness: 0.6 }),
    );
    plate.position.set(site.center.x, 0.03, site.center.z);
    plate.receiveShadow = true;
    group.add(plate);
  }
  // Dusk light: low orange sun from the west, cool fill, warm site lamps.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#5a6b7d'), new THREE.Color('#1a1410'), 1.15));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.6);
  sun.position.set(-18, 16, 10);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 60; sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d90a8'), 0.5);
  fill.position.set(14, 10, 14);
  scene.add(fill);
  for (const site of SITES) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.gold), 12, 14);
    lamp.position.set(site.center.x, 3.4, site.center.z);
    scene.add(lamp);
  }
  return {
    colliders, shootables, sites: SITES, group,
    emberSpawns: [new THREE.Vector3(-5, 0, 15.5), new THREE.Vector3(0, 0, 16.5), new THREE.Vector3(5, 0, 15.5)],
    ashSpawns: [new THREE.Vector3(-16, 0, -13), new THREE.Vector3(-10, 0, -16), new THREE.Vector3(16, 0, -13), new THREE.Vector3(10, 0, -16)],
    bounds: { minX: -22.6, maxX: 22.6, minZ: -18.6, maxZ: 18.6 },
  };
}

// Breadth-first path over the waypoint graph, from the node nearest `from`.
export function findPath(from, toId) {
  let start = WAYPOINTS[0];
  let best = Infinity;
  for (const node of WAYPOINTS) {
    const d = (node.x - from.x) ** 2 + (node.z - from.z) ** 2;
    if (d < best) { best = d; start = node; }
  }
  const prev = new Map([[start.id, null]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    if (node.id === toId) break;
    for (const link of node.links) {
      if (!prev.has(link)) {
        prev.set(link, node.id);
        queue.push(WAYPOINTS.find((w) => w.id === link));
      }
    }
  }
  if (!prev.has(toId)) return [WAYPOINTS.find((w) => w.id === toId)];
  const path = [];
  let id = toId;
  while (id) { path.unshift(WAYPOINTS.find((w) => w.id === id)); id = prev.get(id); }
  return path;
}
