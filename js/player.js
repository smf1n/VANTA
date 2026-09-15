/* ============================================================
   VANTA — player.js
   Игрок: движение, камера от 3-го лица, стрельба, здоровье
============================================================ */

import * as THREE from 'three';
import { getCamera, getScene, updateSunTarget } from './scene.js';
import { animateWalk, playShootPose, getCharacterStats } from './characters.js';
import {
  WEAPONS,
  getWeapon, createWeaponMesh, applyWeaponToCharacter
} from './weapons.js';
import { playShot, playReload, playEmptyClick } from './audio.js';

/* ============================================================
   СОСТОЯНИЕ ИГРОКА
============================================================ */
export const player = {
  mesh: null,
  characterId: 'soldier',

  // позиция и движение
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  yaw: 0,               // поворот вокруг Y (мышь X)
  pitch: -0.18,         // наклон камеры (мышь Y)
  speedBase: 5.5,
  speedRun: 9.0,

  // физика
  radius: 0.48,
  height: 1.8,

  // здоровье
  hp: 100,
  maxHp: 100,
  alive: true,

  // оружие
  weapon: 'pistol',
  ammo: {},             // { pistol: 12, rifle: 30, ... }
  reloading: false,
  reloadEndAt: 0,
  lastShotAt: 0,

  // флаги ввода
  wantsShoot: false,
  wantsReload: false,
  isRunning: false,
  moving: false,
  speedRatio: 0,

  // камера
  camDistance: 4.6,
  camHeight: 2.3,
  camTargetHeight: 1.5,

  // коллизии (AABB массив из maps.js)
  colliders: [],

  // смещение камеры для плавности
  camCurrentPos: new THREE.Vector3(),
  camInitialized: false
};

/* ============================================================
   ВВОД
============================================================ */
const keys = Object.create(null);

/* ============================================================
   СОЗДАНИЕ ИГРОКА
============================================================ */
export function createPlayer({ mesh, spawn, characterId, colliders }) {
  // сброс
  Object.assign(player, {
    mesh,
    characterId,
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(),
    yaw: spawn.yaw || 0,
    pitch: -0.18,
    alive: true,
    weapon: 'pistol',
    reloading: false,
    lastShotAt: 0,
    wantsShoot: false,
    wantsReload: false,
    isRunning: false,
    moving: false,
    speedRatio: 0,
    colliders: colliders || [],
    camInitialized: false
  });

  const stats = getCharacterStats(characterId);
  player.hp = stats.hp;
  player.maxHp = stats.hp;
  player.speedBase = stats.speed;
  player.speedRun = stats.speed * (stats.runMult || 1.7);
  player.radius = stats.radius || 0.48;

  // заполняем боезапас
  player.ammo = {};
  for (const id in WEAPONS) {
    player.ammo[id] = WEAPONS[id].magSize;
  }

  // ставим меш
  mesh.position.copy(player.pos);
  mesh.rotation.y = player.yaw;

  // привязываем оружие в руке
  applyWeaponToCharacter(mesh, player.weapon);

  // первая инициализация камеры
  updateCamera(0.016, true);

  // ---------- Слушатели ввода ----------
  bindInput();
}

/* ============================================================
   ПРИВЯЗКА ВВОДА (один раз при создании)
============================================================ */
let inputBound = false;

function bindInput() {
  if (inputBound) return;
  inputBound = true;

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);

  document.addEventListener('pointerlockchange', onPointerLockChange);
}

function onKeyDown(e) {
  keys[e.code] = true;

  if (!player.alive) return;

  if (e.code === 'Digit1') switchWeapon('pistol');
  if (e.code === 'Digit2') switchWeapon('rifle');
  if (e.code === 'Digit3') switchWeapon('shotgun');
  if (e.code === 'Digit4') switchWeapon('sniper');

  if (e.code === 'KeyR') {
    player.wantsReload = true;
    startReload();
  }
}

function onKeyUp(e) {
  keys[e.code] = false;
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  player.wantsShoot = true;
}

function onMouseUp(e) {
  if (e.button !== 0) return;
  player.wantsShoot = false;
}

function onMouseMove(e) {
  if (document.pointerLockElement == null) return;
  const sens = 0.0022;
  player.yaw   -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  // ограничиваем наклон
  player.pitch = Math.max(-0.9, Math.min(0.7, player.pitch));
}

function onPointerLockChange() {
  // при выходе из лок-курсора сбрасываем стрельбу
  if (document.pointerLockElement == null) {
    player.wantsShoot = false;
    keys && Object.keys(keys).forEach(k => keys[k] = false);
  }
}

/* ============================================================
   ОБНОВЛЕНИЕ ИГРОКА (каждый кадр)
============================================================ */
export function updatePlayer(dt) {
  if (!player.mesh || !player.alive) {
    updateCamera(dt);
    return;
  }

  // ---------- Чтение ввода ----------
  const forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const strafe  = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  player.isRunning = !!keys['ShiftLeft'] || !!keys['ShiftRight'];

  // ---------- Направление движения в мировых координатах ----------
  // yaw = 0 → смотрим в -Z (Three.js стандарт)
  const sinY = Math.sin(player.yaw);
  const cosY = Math.cos(player.yaw);

  // forward-вектор: (-sinY, 0, -cosY); right-вектор: (cosY, 0, -sinY)
  let moveX = (-sinY) * forward + (cosY) * strafe;
  let moveZ = (-cosY) * forward + (-sinY) * strafe;

  const len = Math.hypot(moveX, moveZ);
  if (len > 0.0001) {
    moveX /= len;
    moveZ /= len;
    player.moving = true;
  } else {
    player.moving = false;
  }

  // ---------- Скорость ----------
  const targetSpeed = player.isRunning ? player.speedRun : player.speedBase;
  const targetVX = moveX * targetSpeed;
  const targetVZ = moveZ * targetSpeed;

  // плавная интерполяция скорости (инерция)
  const accel = player.moving ? 12 : 16;
  player.vel.x += (targetVX - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (targetVZ - player.vel.z) * Math.min(1, accel * dt);

  // ---------- Движение с коллизиями ----------
  const dx = player.vel.x * dt;
  const dz = player.vel.z * dt;
  moveWithCollision(dx, dz);

  // ---------- Обновление меша ----------
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.yaw;

  // ---------- Анимация ходьбы ----------
  const spd = Math.hypot(player.vel.x, player.vel.z);
  player.speedRatio = Math.min(spd / player.speedRun, 1.2);
  animateWalk(player.mesh, player.speedRatio, dt);

  // ---------- Стрельба / перезарядка ----------
  if (player.reloading) {
    if (performance.now() >= player.reloadEndAt) {
      finishReload();
    }
  } else if (player.wantsShoot) {
    tryShoot();
  }

  // ---------- Камера ----------
  updateCamera(dt);

  // ---------- Обновляем цель солнца (тени следуют за игроком) ----------
  updateSunTarget(player.pos.x, player.pos.z);
}

/* ============================================================
   ДВИЖЕНИЕ С КОЛЛИЗИЯМИ (AABB)
============================================================ */
function moveWithCollision(dx, dz) {
  const r = player.radius;
  const p = player.pos;

  // по X
  if (!collidesAt(p.x + dx, p.z, r)) {
    p.x += dx;
  } else {
    player.vel.x = 0;
  }

  // по Z
  if (!collidesAt(p.x, p.z + dz, r)) {
    p.z += dz;
  } else {
    player.vel.z = 0;
  }
}

function collidesAt(x, z, r) {
  for (let i = 0; i < player.colliders.length; i++) {
    const c = player.colliders[i];
    if (
      x + r > c.min.x &&
      x - r < c.max.x &&
      z + r > c.min.z &&
      z - r < c.max.z
    ) {
      return true;
    }
  }
  return false;
}

/* ============================================================
   КАМЕРА ОТ ТРЕТЬЕГО ЛИЦА
   Позиционируется сзади игрока, наклоняется по pitch,
   отталкивается от стен (простая проверка дистанции).
============================================================ */
function updateCamera(dt, snap = false) {
  const cam = getCamera();
  if (!cam) return;

  const px = player.pos.x;
  const pz = player.pos.z;
  const py = player.pos.y;

  // целевая точка — над плечом игрока
  const targetX = px;
  const targetY = py + player.camTargetHeight;
  const targetZ = pz;

  // сферические координаты: камера сзади на camDistance
  const horizDist = player.camDistance * Math.cos(player.pitch);
  const vertDist  = player.camHeight + player.camDistance * Math.sin(-player.pitch);

  const offsetX = Math.sin(player.yaw) * horizDist;
  const offsetZ = Math.cos(player.yaw) * horizDist;

  let desiredX = targetX + offsetX;
  let desiredY = targetY + vertDist;
  let desiredZ = targetZ + offsetZ;

  // простая проверка: если между игроком и камерой стена — подтягиваем камеру
  const maxDist = player.camDistance;
  const stepX = (desiredX - targetX) / maxDist;
  const stepZ = (desiredZ - targetZ) / maxDist;
  const r = 0.3;
  let allowed = maxDist;
  for (let d = 0.5; d <= maxDist; d += 0.3) {
    const cx = targetX + stepX * d;
    const cz = targetZ + stepZ * d;
    if (collidesAt(cx, cz, r)) {
      allowed = d - 0.3;
      break;
    }
  }
  if (allowed < maxDist) {
    const k = allowed / maxDist;
    desiredX = targetX + (desiredX - targetX) * k;
    desiredY = targetY + (desiredY - targetY) * k;
    desiredZ = targetZ + (desiredZ - targetZ) * k;
  }

  // плавное движение камеры
  if (snap || !player.camInitialized) {
    player.camCurrentPos.set(desiredX, desiredY, desiredZ);
    player.camInitialized = true;
  } else {
    const lerp = 1 - Math.pow(0.001, dt); // быстрая интерполяция
    player.camCurrentPos.x += (desiredX - player.camCurrentPos.x) * lerp;
    player.camCurrentPos.y += (desiredY - player.camCurrentPos.y) * lerp;
    player.camCurrentPos.z += (desiredZ - player.camCurrentPos.z) * lerp;
  }

  cam.position.copy(player.camCurrentPos);
  cam.lookAt(targetX, targetY + 0.15, targetZ);
}

/* ============================================================
   ОРУЖИЕ
============================================================ */
export function switchWeapon(id) {
  if (!WEAPONS[id]) return;
  if (player.reloading) return;
  if (player.weapon === id) return;

  player.weapon = id;
  applyWeaponToCharacter(player.mesh, id);
  playReload(); // короткий звук смены
}

export function tryShoot() {
  if (!player.alive) return;
  if (player.reloading) return;

  const w = getWeapon(player.weapon);
  if (!w) return;

  const now = performance.now();
  if (now - player.lastShotAt < w.fireRate * 1000) return;

  // авто-режим: если не auto, то стреляем только на «свежий» клик
  if (!w.auto && player.lastShotHeld) {
    // уже стреляли в этом удержании — ждём отпускания
    return;
  }
  player.lastShotHeld = true;

  const ammo = player.ammo[player.weapon] || 0;
  if (ammo <= 0) {
    playEmptyClick();
    // авто-перезарядка
    if (!player.reloading) startReload();
    return;
  }

  player.lastShotAt = now;
  player.ammo[player.weapon] = ammo - 1;

  // визуальный откат
  playShootPose(player.mesh);

  // звук
  playShot(w.sound || player.weapon);

  // луч из дула
  fireRay(w);

  // сигнал UI
  document.dispatchEvent(new CustomEvent('vanta:ammo-changed', {
    detail: {
      weapon: player.weapon,
      ammo: player.ammo[player.weapon],
      magSize: w.magSize
    }
  }));
}

// при отпускании мыши сбрасываем флаг
window.addEventListener('mouseup', () => {
  player.lastShotHeld = false;
});

/* ============================================================
   RAYCAST СТРЕЛЬБА
   Ищем попадание по врагам и по миру (коллайдеры).
   Событие 'vanta:hit-enemy' ловит enemies.js
============================================================ */
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function fireRay(weapon) {
  const cam = getCamera();
  if (!cam) return;

  // стреляем из точки чуть впереди камеры по направлению взгляда
  cam.getWorldPosition(_rayOrigin);
  cam.getWorldDirection(_rayDir);

  // небольшое смещение вперёд, чтобы не задеть игрока
  _rayOrigin.addScaledVector(_rayDir, 0.5);

  // разброс
  const spread = weapon.spread || 0;
  _rayDir.x += (Math.random() - 0.5) * spread;
  _rayDir.y += (Math.random() - 0.5) * spread;
  _rayDir.z += (Math.random() - 0.5) * spread;
  _rayDir.normalize();

  _raycaster.set(_rayOrigin, _rayDir);
  _raycaster.far = weapon.range || 100;

  // 1) проверяем попадание по врагам через событие (enemies.js сам посчитает)
  //    делаем это через пользовательское событие, чтобы не тянуть сюда enemies.js
  const hitEvent = new CustomEvent('vanta:fire-ray', {
    detail: {
      origin: _rayOrigin.clone(),
      dir: _rayDir.clone(),
      range: weapon.range || 100,
      damage: weapon.damage,
      pellets: weapon.pellets || 1,
      weaponId: player.weapon
    }
  });
  document.dispatchEvent(hitEvent);
}

/* ============================================================
   ПЕРЕЗАРЯДКА
============================================================ */
export function startReload() {
  if (!player.alive) return;
  if (player.reloading) return;

  const w = getWeapon(player.weapon);
  if (!w) return;

  const current = player.ammo[player.weapon] || 0;
  if (current >= w.magSize) return;

  player.reloading = true;
  player.reloadEndAt = performance.now() + w.reloadTime * 1000;

  playReload();

  document.dispatchEvent(new CustomEvent('vanta:reload-start', {
    detail: { weapon: player.weapon, duration: w.reloadTime }
  }));
}

function finishReload() {
  const w = getWeapon(player.weapon);
  if (!w) {
    player.reloading = false;
    return;
  }

  player.ammo[player.weapon] = w.magSize;
  player.reloading = false;

  document.dispatchEvent(new CustomEvent('vanta:ammo-changed', {
    detail: {
      weapon: player.weapon,
      ammo: player.ammo[player.weapon],
      magSize: w.magSize
    }
  }));
}

/* ============================================================
   УРОН ПО ИГРОКУ (вызывает enemies.js)
============================================================ */
export function damagePlayer(amount) {
  if (!player.alive) return;
  player.hp = Math.max(0, player.hp - amount);

  document.dispatchEvent(new CustomEvent('vanta:player-damaged', {
    detail: { hp: player.hp, maxHp: player.maxHp, amount }
  }));

  if (player.hp <= 0) {
    player.alive = false;
    document.dispatchEvent(new CustomEvent('vanta:player-died'));
  }
}

/* ============================================================
   ГЕТТЕРЫ
============================================================ */
export function getPlayer() { return player; }

export function getPlayerMuzzleWorld() {
  if (!player.mesh) return new THREE.Vector3();
  const muzzle = player.mesh.userData?.parts?.muzzle;
  if (!muzzle) return player.pos.clone();
  return muzzle.getWorldPosition(new THREE.Vector3());
}
