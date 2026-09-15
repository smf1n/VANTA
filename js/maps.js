/* ============================================================
   VANTA — maps.js
   Три карты: Арена (открытая), Город (средняя), Бункер (тесная).
   Каждая возвращает: { colliders, enemySpawns, playerSpawn }
============================================================ */

import * as THREE from 'three';
import { getScene, getWorldGroup, setAtmosphere } from './scene.js';

/* ============================================================
   ПАЛИТРА МАТЕРИАЛОВ (общая для всех карт)
============================================================ */
const MAT = {
  ground:      () => new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 1 }),
  groundSand:  () => new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 }),
  groundConcrete: () => new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.9 }),

  wallLight:   () => new THREE.MeshStandardMaterial({ color: 0x8b7b5a, roughness: 0.85 }),
  wallDark:    () => new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }),
  wallConcrete:() => new THREE.MeshStandardMaterial({ color: 0x606068, roughness: 0.85 }),
  wallMetal:   () => new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.6, metalness: 0.6 }),

  crate:       () => new THREE.MeshStandardMaterial({ color: 0xa0763e, roughness: 0.9 }),
  crateMetal:  () => new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.5, metalness: 0.7 }),

  pillar:      () => new THREE.MeshStandardMaterial({ color: 0x707080, roughness: 0.7 })
};

/* ============================================================
   ВНУТРЕННИЕ ПОМОЩНИКИ
   Кладём меш в мир и регистрируем AABB-коллайдер.
============================================================ */
function addBox(world, colliders, x, y, z, w, h, d, material) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);

  colliders.push({
    min: new THREE.Vector3(x - w / 2, y, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h, z + d / 2)
  });

  return mesh;
}

function addCylinder(world, colliders, x, z, radius, height, material) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 20);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);

  // AABB-приближение для коллизий
  colliders.push({
    min: new THREE.Vector3(x - radius, 0, z - radius),
    max: new THREE.Vector3(x + radius, height, z + radius)
  });

  return mesh;
}

function makeGround(world, size, material) {
  const geo = new THREE.PlaneGeometry(size, size);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

function makeGrid(world, size, divisions = 40) {
  const grid = new THREE.GridHelper(size, divisions, 0x000000, 0x444444);
  grid.material.opacity = 0.12;
  grid.material.transparent = true;
  grid.position.y = 0.01;
  world.add(grid);
  return grid;
}

/* ============================================================
   ТОЧКИ СПАВНА ВРАГОВ ПО ПЕРИМЕТРУ
============================================================ */
function ringSpawns(radius, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    arr.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius });
  }
  return arr;
}

/* ============================================================
   КАРТА 1 — АРЕНА
   Открытое пространство с колоннами, мало укрытий.
   Рекомендовано: снайперка, автомат.
============================================================ */
function buildArena(world, colliders) {
  const SIZE = 140;

  makeGround(world, SIZE, MAT.groundSand());
  makeGrid(world, SIZE, 35);

  // Внешняя стена — низкое ограждение по периметру
  const wallH = 2.4;
  const wallT = 1.2;
  const half = SIZE / 2;

  addBox(world, colliders, 0, 0, -half, SIZE, wallH, wallT, MAT.wallDark());
  addBox(world, colliders, 0, 0,  half, SIZE, wallH, wallT, MAT.wallDark());
  addBox(world, colliders, -half, 0, 0, wallT, wallH, SIZE, MAT.wallDark());
  addBox(world, colliders,  half, 0, 0, wallT, wallH, SIZE, MAT.wallDark());

  // Центральный обелиск
  addBox(world, colliders, 0, 0, 0, 4, 10, 4, MAT.wallConcrete());

  // 6 колонн вокруг центра
  const pillarRadius = 18;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * pillarRadius;
    const z = Math.sin(a) * pillarRadius;
    addCylinder(world, colliders, x, z, 1.4, 8, MAT.pillar());
  }

  // 4 длинные низкие стены-укрытия (для стрельбы из-за угла)
  const walls = [
    { x: -30, z: -30, w: 12, h: 1.6, d: 2 },
    { x:  30, z: -30, w: 2,  h: 1.6, d: 12 },
    { x: -30, z:  30, w: 2,  h: 1.6, d: 12 },
    { x:  30, z:  30, w: 12, h: 1.6, d: 2 },
  ];
  walls.forEach(w => addBox(world, colliders, w.x, 0, w.z, w.w, w.h, w.d, MAT.wallLight()));

  // Разбросанные ящики-одиночки
  const crates = [
    [-15, 10], [15, -10], [-22, -18], [22, 18],
    [8, -25], [-8, 25], [25, -5], [-25, 5],
    [40, 20], [-40, -20], [35, -35], [-35, 35]
  ];
  crates.forEach(([x, z]) => addBox(world, colliders, x, 0, z, 2, 2, 2, MAT.crate()));

  // Атмосфера: дневная пустыня, тёплое солнце
  setAtmosphere({
    bg: 0xc8b088,
    fog: 0xc8b088,
    fogNear: 50,
    fogFar: 180,
    sunColor: 0xfff0d8,
    sunIntensity: 1.5,
    hemiSky: 0xa8c8ff,
    hemiGround: 0x8a7a5a
  });

  return {
    playerSpawn: { x: 0, z: 30, yaw: Math.PI },
    enemySpawns: [
      ...ringSpawns(55, 12),
      { x: -45, z: 0 }, { x: 45, z: 0 },
      { x: 0, z: -45 }, { x: 0, z: 45 }
    ]
  };
}

/* ============================================================
   КАРТА 2 — ГОРОД
   Средняя плотность. Здания, переулки, ящики.
   Рекомендовано: универсал.
============================================================ */
function buildCity(world, colliders) {
  const SIZE = 130;

  makeGround(world, SIZE, MAT.groundConcrete());
  makeGrid(world, SIZE, 32);

  const half = SIZE / 2;

  // Внешняя высокая стена (город обнесён)
  const wallH = 6;
  const wallT = 1.5;
  addBox(world, colliders, 0, 0, -half, SIZE, wallH, wallT, MAT.wallConcrete());
  addBox(world, colliders, 0, 0,  half, SIZE, wallH, wallT, MAT.wallConcrete());
  addBox(world, colliders, -half, 0, 0, wallT, wallH, SIZE, MAT.wallConcrete());
  addBox(world, colliders,  half, 0, 0, wallT, wallH, SIZE, MAT.wallConcrete());

  // Здания по углам
  const buildings = [
    // [x, z, w, h, d]
    [-35, -35, 20, 10, 20],
    [ 35, -35, 16, 12, 16],
    [-35,  35, 18, 8, 22],
    [ 35,  35, 22, 14, 18],
    [-45,   0,  8,  6, 18],
    [ 45,   0,  8,  6, 18],
    [  0, -45, 24,  5,  8],
    [  0,  45, 24,  5,  8],
  ];
  buildings.forEach(b => addBox(world, colliders, b[0], 0, b[1], b[2], b[3], b[4], MAT.wallLight()));

  // Центральный блок — 4 стены и внутренний проход
  addBox(world, colliders, -6, 0, -6, 6, 5, 6, MAT.wallConcrete());
  addBox(world, colliders,  6, 0, -6, 6, 5, 6, MAT.wallConcrete());
  addBox(world, colliders, -6, 0,  6, 6, 5, 6, MAT.wallConcrete());
  addBox(world, colliders,  6, 0,  6, 6, 5, 6, MAT.wallConcrete());

  // Ящики в переулках
  const crates = [
    [-15, 5], [15, -5], [-12, -18], [12, 18],
    [-22, 12], [22, -12], [25, 25], [-25, -25],
    [18, -28], [-18, 28], [30, -18], [-30, 18],
    [40, 15], [-40, -15]
  ];
  crates.forEach(([x, z]) => addBox(world, colliders, x, 0, z, 2, 2, 2, MAT.crate()));

  // Металлические контейнеры для тактики
  const containers = [
    [-20, -8, 6, 2.6, 2.4],
    [ 20,  8, 6, 2.6, 2.4],
    [ -8, 20, 2.4, 2.6, 6],
    [  8, -20, 2.4, 2.6, 6],
  ];
  containers.forEach(c => addBox(world, colliders, c[0], 0, c[1], c[2], c[3], c[4], MAT.crateMetal()));

  // Атмосфера: сумерки, прохладные тона
  setAtmosphere({
    bg: 0x5a6478,
    fog: 0x5a6478,
    fogNear: 40,
    fogFar: 140,
    sunColor: 0xe8d8c0,
    sunIntensity: 1.1,
    hemiSky: 0x8090c0,
    hemiGround: 0x3a3a44
  });

  return {
    playerSpawn: { x: 0, z: 35, yaw: Math.PI },
    enemySpawns: [
      ...ringSpawns(50, 10),
      { x: -48, z: -48 }, { x: 48, z: -48 },
      { x: -48, z:  48 }, { x: 48, z:  48 },
      { x: 0, z: -40 }, { x: 0, z: 40 },
    ]
  };
}

/* ============================================================
   КАРТА 3 — БУНКЕР
   Тесные коридоры, много стен. Противники близко.
   Рекомендовано: дробовик, пистолет.
============================================================ */
function buildBunker(world, colliders) {
  const SIZE = 90;

  makeGround(world, SIZE, MAT.groundConcrete());
  makeGrid(world, SIZE, 30);

  const half = SIZE / 2;
  const wallH = 4;

  // Внешние стены (высокие, тёмные)
  addBox(world, colliders, 0, 0, -half, SIZE, wallH, 2, MAT.wallMetal());
  addBox(world, colliders, 0, 0,  half, SIZE, wallH, 2, MAT.wallMetal());
  addBox(world, colliders, -half, 0, 0, 2, wallH, SIZE, MAT.wallMetal());
  addBox(world, colliders,  half, 0, 0, 2, wallH, SIZE, MAT.wallMetal());

  // Разделительные стены — создают коридоры
  const walls = [
    // [x, z, w, h, d]
    [-15, -25, 2, 4, 24],
    [ 15, -25, 2, 4, 24],
    [-15,  25, 2, 4, 24],
    [ 15,  25, 2, 4, 24],

    [-25, -10, 24, 4, 2],
    [ 25, -10, 24, 4, 2],
    [-25,  10, 24, 4, 2],
    [ 25,  10, 24, 4, 2],

    [0, -18, 18, 4, 2],
    [0,  18, 18, 4, 2],

    // Внутренние перегородки
    [-8, 0, 2, 4, 10],
    [ 8, 0, 2, 4, 10],
  ];
  walls.forEach(w => addBox(world, colliders, w[0], 0, w[1], w[2], w[3], w[4], MAT.wallDark()));

  // Металлические ящики
  const crates = [
    [-20, -5], [20, 5], [-8, -12], [8, 12],
    [-10, 20], [10, -20], [-30, 0], [30, 0],
    [0, 30], [0, -30]
  ];
  crates.forEach(([x, z]) => addBox(world, colliders, x, 0, z, 2, 2, 2, MAT.crateMetal()));

  // Центральная комната — 4 колонны
  addCylinder(world, colliders, -3, -3, 1, 4, MAT.pillar());
  addCylinder(world, colliders,  3, -3, 1, 4, MAT.pillar());
  addCylinder(world, colliders, -3,  3, 1, 4, MAT.pillar());
  addCylinder(world, colliders,  3,  3, 1, 4, MAT.pillar());

  // Атмосфера: тёмный тех-бункер, холодный свет
  setAtmosphere({
    bg: 0x10141a,
    fog: 0x10141a,
    fogNear: 15,
    fogFar: 70,
    sunColor: 0x88a0c8,
    sunIntensity: 0.7,
    hemiSky: 0x404860,
    hemiGround: 0x14161c
  });

  return {
    playerSpawn: { x: 0, z: 35, yaw: Math.PI },
    enemySpawns: [
      { x: -35, z: -35 }, { x: 35, z: -35 },
      { x: -35, z:  35 }, { x: 35, z:  35 },
      { x: 0, z: -35 }, { x: 0, z: 35 },
      { x: -35, z: 0 }, { x: 35, z: 0 },
      { x: -25, z: 25 }, { x: 25, z: -25 },
    ]
  };
}

/* ============================================================
   РЕЕСТР КАРТ
============================================================ */
const MAPS = {
  arena: {
    id: 'arena',
    name: 'Арена',
    desc: 'Открытая · для снайперки и автомата',
    build: buildArena
  },
  city: {
    id: 'city',
    name: 'Город',
    desc: 'Средняя · универсальная',
    build: buildCity
  },
  bunker: {
    id: 'bunker',
    name: 'Бункер',
    desc: 'Тесная · для дробовика и пистолета',
    build: buildBunker
  }
};

/* ============================================================
   ПУБЛИЧНОЕ API
============================================================ */

/**
 * Построить карту по id. Очищает worldGroup в scene.js
 * (вызов clearWorld делает main.js до этого).
 *
 * @param {string} mapId — 'arena' | 'city' | 'bunker'
 * @returns {{ colliders, playerSpawn, enemySpawns }}
 */
export function buildMap(mapId) {
  const map = MAPS[mapId] || MAPS.city;
  const world = getWorldGroup();

  const colliders = [];
  const data = map.build(world, colliders);

  return {
    id: map.id,
    name: map.name,
    colliders,
    playerSpawn: data.playerSpawn,
    enemySpawns: data.enemySpawns
  };
}

/**
 * Получить точку спавна игрока для карты (без полной сборки).
 * Используется, если нужно показать превью в меню.
 */
export function getSpawnPoint(mapId) {
  const map = MAPS[mapId] || MAPS.city;

  // маленький трюк: спавн известен, потому что все карты его возвращают
  // статично — можно держать здесь таблицу, но проще дёрнуть build
  // в лёгком режиме. Чтобы не строить всю карту, используем константы.
  const spawns = {
    arena:  { x: 0, z: 30, yaw: Math.PI },
    city:   { x: 0, z: 35, yaw: Math.PI },
    bunker: { x: 0, z: 35, yaw: Math.PI }
  };
  return spawns[map.id] || spawns.city;
}

/**
 * Список карт для меню.
 */
export function getAllMaps() {
  return Object.values(MAPS).map(m => ({ id: m.id, name: m.name, desc: m.desc }));
}
