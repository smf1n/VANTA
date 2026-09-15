/* ============================================================
   VANTA — enemies.js
   Менеджер врагов: спавн, ИИ, стрельба, состояния, волны
============================================================ */

import * as THREE from 'three';
import { createEnemyMesh, animateWalk } from './characters.js';
import { getScene, getEffectsGroup, addToEffects } from './scene.js';
import { playShot, playHit, playEnemyDeath, playPlayerHurt } from './audio.js';
import { getPlayer, damagePlayer } from './player.js';

/* ============================================================
   ПАРАМЕТРЫ СЛОЖНОСТИ
   Каждый уровень меняет поведение, а не только цифры.
============================================================ */
export const DIFFICULTY = {
  easy: {
    // характеристики
    speed: 2.6,
    hp: 60,
    accuracy: 0.30,          // шанс попасть
    damage: 5,
    fireRate: 1.6,           // сек между выстрелами
    // восприятие
    visionRange: 30,
    hearingRange: 12,
    // поведение
    reactionTime: 0.9,       // сек до первого выстрела после обнаружения
    repositionChance: 0.05,  // шанс сменить позицию
    strafeChance: 0.1,       // шанс стрейфить при движении
    aimError: 0.35,          // ошибка прицеливания (радианы)
    retreatAtHp: 0.0,        // не отступает
    // визуал
    variants: ['grunt'],
    scale: 1.0
  },

  normal: {
    speed: 3.4,
    hp: 100,
    accuracy: 0.55,
    damage: 9,
    fireRate: 1.0,
    visionRange: 45,
    hearingRange: 20,
    reactionTime: 0.5,
    repositionChance: 0.15,
    strafeChance: 0.35,
    aimError: 0.18,
    retreatAtHp: 0.0,
    variants: ['grunt', 'scout', 'grunt'],
    scale: 1.0
  },

  hard: {
    speed: 4.4,
    hp: 130,
    accuracy: 0.8,
    damage: 13,
    fireRate: 0.65,
    visionRange: 60,
    hearingRange: 35,
    reactionTime: 0.25,
    repositionChance: 0.4,
    strafeChance: 0.7,
    aimError: 0.07,
    retreatAtHp: 0.25,       // отступает при HP < 25%
    variants: ['grunt', 'brute', 'scout', 'grunt'],
    scale: 1.05
  }
};

/* ============================================================
   ПАРАМЕТРЫ ВОЛН
============================================================ */
const WAVE_CONFIG = {
  baseCount: 4,           // врагов в 1-й волне
  increment: 2,           // +2 врага за волну
  maxAlive: 12,           // одновременно на карте
  spawnInterval: 1.2,     // сек между спавнами
  betweenDelay: 3.0       // пауза между волнами (сек)
};

/* ============================================================
   МЕНЕДЖЕР ВРАГОВ
============================================================ */
export function createEnemyManager({ scene, colliders, spawnPoints, difficulty, onEnemyKilled }) {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;

  const enemies = [];
  const pendingSpawns = [];       // очередь спавнов { time, variant }
  const collidersLocal = colliders || [];
  const spawnPointsLocal = spawnPoints || [];

  let waveNumber = 1;
  let waveActive = false;
  let disposed = false;
  let lastSpawnAt = 0;
  let spawnQueueIndex = 0;

  /* ------------------------------------------------------------
     СПАВН ОДНОГО ВРАГА
  ------------------------------------------------------------ */
  function pickSpawnPoint() {
    // стараемся спавнить подальше от игрока
    const player = getPlayer();
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;

    let best = spawnPointsLocal[0] || { x: 0, z: 0 };
    let bestDist = -Infinity;

    // 4 случайных кандидата, выбираем самый далёкий
    for (let i = 0; i < 4; i++) {
      const p = spawnPointsLocal[Math.floor(Math.random() * spawnPointsLocal.length)];
      if (!p) continue;
      const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
      if (d > bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function spawnEnemy(variant) {
    if (disposed) return null;

    const spawn = pickSpawnPoint();

    // сдвигаем спавн, если точка занята коллайдером
    let sx = spawn.x + (Math.random() - 0.5) * 4;
    let sz = spawn.z + (Math.random() - 0.5) * 4;
    let tries = 0;
    while (collidesAt(sx, sz, 0.6, collidersLocal) && tries < 20) {
      sx = spawn.x + (Math.random() - 0.5) * 12;
      sz = spawn.z + (Math.random() - 0.5) * 12;
      tries++;
    }

    const mesh = createEnemyMesh(variant);
    mesh.scale.setScalar(cfg.scale);
    mesh.position.set(sx, 0, sz);
    scene.add(mesh);

    // корректируем HP под вариант
    const variantCfg = mesh.userData.config;
    const hp = Math.round(cfg.hp * (variantCfg.hp / 100));

    const enemy = {
      id: Math.random().toString(36).slice(2, 9),
      mesh,
      variant,
      pos: new THREE.Vector3(sx, 0, sz),
      vel: new THREE.Vector3(),
      hp,
      maxHp: hp,
      alive: true,
      radius: 0.5 * cfg.scale,

      // поведение
      state: 'idle',           // idle | chase | attack | reposition | dead
      stateTime: 0,
      lastSeenPlayer: -999,    // последний раз видел игрока (таймстамп)
      lastSeenPos: new THREE.Vector3(sx, 0, sz),
      firstSeenAt: -1,         // когда впервые увидел игрока (для reactionTime)
      nextShotAt: 0,
      nextDecisionAt: 0,
      strafeDir: 0,            // -1 | 0 | 1
      strafeUntil: 0,
      targetPos: new THREE.Vector3(sx, 0, sz),
      wanderAngle: Math.random() * Math.PI * 2,

      // анимация
      speedRatio: 0,
      hitFlashUntil: 0,

      scoreValue: 100,
      cfg // ссылка на конфиг сложности
    };

    enemies.push(enemy);
    return enemy;
  }

  /* ------------------------------------------------------------
     СТАРТ ВОЛНЫ
  ------------------------------------------------------------ */
  function startWave(n) {
    waveNumber = n;
    waveActive = true;
    spawnQueueIndex = 0;

    const total = WAVE_CONFIG.baseCount + WAVE_CONFIG.increment * (n - 1);

    // формируем очередь спавнов: чередуем варианты из cfg.variants
    pendingSpawns.length = 0;
    const variants = cfg.variants.length ? cfg.variants : ['grunt'];

    for (let i = 0; i < total; i++) {
      const variant = variants[i % variants.length];
      pendingSpawns.push({
        spawnAt: performance.now() + i * WAVE_CONFIG.spawnInterval * 1000,
        variant
      });
    }

    lastSpawnAt = performance.now();

    document.dispatchEvent(new CustomEvent('vanta:wave-start', {
      detail: { wave: n, total }
    }));
  }

  /* ------------------------------------------------------------
     ОБНОВЛЕНИЕ (каждый кадр)
  ------------------------------------------------------------ */
  function update(dt) {
    if (disposed) return;

    const player = getPlayer();
    const playerAlive = player && player.alive;
    const now = performance.now();

    // 1) спавним из очереди
    processPendingSpawns(now);

    // 2) обрабатываем врагов
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e.alive) {
        // уже удалён
        continue;
      }
      updateEnemy(e, dt, now, player, playerAlive);
    }

    // 3) чистим мёртвых
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (!enemies[i].alive) {
        scene.remove(enemies[i].mesh);
        disposeMesh(enemies[i].mesh);
        enemies.splice(i, 1);
      }
    }
  }

  function processPendingSpawns(now) {
    const alive = aliveCount();
    while (
      pendingSpawns.length > 0 &&
      alive + pendingSpawns.filter(p => p.spawned).length < WAVE_CONFIG.maxAlive
    ) {
      const next = pendingSpawns[0];
      if (now < next.spawnAt) break;
      pendingSpawns.shift();
      spawnEnemy(next.variant);
    }
  }

  /* ------------------------------------------------------------
     ИИ ОДНОГО ВРАГА
  ------------------------------------------------------------ */
  function updateEnemy(e, dt, now, player, playerAlive) {
    e.stateTime += dt;

    // если игрок мёртв — враги уходят в idle
    if (!playerAlive) {
      e.state = 'idle';
      e.speedRatio = 0;
      animateWalk(e.mesh, 0, dt);
      return;
    }

    // дистанция до игрока
    const dx = player.pos.x - e.pos.x;
    const dz = player.pos.z - e.pos.z;
    const distSq = dx * dx + dz * dz;
    const dist = Math.sqrt(distSq);

    // попадание под зрение?
    const sees = canSeePlayer(e, player, dist, distSq);

    // обновляем память
    if (sees) {
      if (e.firstSeenAt < 0) e.firstSeenAt = now;
      e.lastSeenPlayer = now;
      e.lastSeenPos.set(player.pos.x, 0, player.pos.z);
    } else if (e.firstSeenAt > 0 && now - e.lastSeenPlayer > 4000) {
      // давно не видел — сбрасываем реакцию
      e.firstSeenAt = -1;
    }

    // конечный автомат
    switch (e.state) {
      case 'idle':    updateIdle(e, dt, now, player, sees, dist); break;
      case 'chase':   updateChase(e, dt, now, player, sees, dist); break;
      case 'attack':  updateAttack(e, dt, now, player, sees, dist); break;
      case 'reposition': updateReposition(e, dt, now, player); break;
    }

    // поворот в сторону цели / движения
    applyRotation(e, dt, player, sees);

    // движение с коллизиями
    applyMovement(e, dt, collidersLocal);

    // анимация ходьбы
    const spd = Math.hypot(e.vel.x, e.vel.z);
    e.speedRatio = Math.min(spd / cfg.speed, 1.3);
    animateWalk(e.mesh, e.speedRatio, dt);

    // синхронизация меша
    e.mesh.position.copy(e.pos);
    e.mesh.rotation.y = e.mesh.userData.facingYaw ?? 0;

    // визуальная вспышка при попадании
    updateHitFlash(e, now);
  }

  /* --- IDLE: патрулирует, пока не увидит игрока --- */
  function updateIdle(e, dt, now, player, sees, dist) {
    // заметил?
    if (sees) {
      // есть ли реакция? (время reactionTime)
      if (now - e.firstSeenAt >= cfg.reactionTime * 1000) {
        e.state = 'chase';
        e.stateTime = 0;
        e.nextDecisionAt = now + 400 + Math.random() * 400;
        return;
      }
    }

    // патрулирование: медленно идём в случайную точку
    if (now > e.nextDecisionAt) {
      e.wanderAngle += (Math.random() - 0.5) * Math.PI;
      e.targetPos.set(
        e.pos.x + Math.cos(e.wanderAngle) * 6,
        0,
        e.pos.z + Math.sin(e.wanderAngle) * 6
      );
      e.nextDecisionAt = now + 2000 + Math.random() * 2000;
    }

    const toX = e.targetPos.x - e.pos.x;
    const toZ = e.targetPos.z - e.pos.z;
    const d = Math.hypot(toX, toZ);
    if (d > 0.4) {
      const s = cfg.speed * 0.35; // медленно
      e.vel.x = (toX / d) * s;
      e.vel.z = (toZ / d) * s;
      e.mesh.userData.facingYaw = Math.atan2(e.vel.x, e.vel.z);
    } else {
      e.vel.set(0, 0, 0);
    }
  }

  /* --- CHASE: преследует игрока, стреляет на ходу --- */
  function updateChase(e, dt, now, player, sees, dist) {
    // дошёл до дистанции атаки?
    const attackRange = cfg.visionRange * 0.6;
    if (sees && dist < attackRange) {
      e.state = 'attack';
      e.stateTime = 0;
      return;
    }

    // цель — последняя известная позиция игрока
    const tx = sees ? player.pos.x : e.lastSeenPos.x;
    const tz = sees ? player.pos.z : e.lastSeenPos.z;

    const toX = tx - e.pos.x;
    const toZ = tz - e.pos.z;
    const d = Math.hypot(toX, toZ);

    if (d < 0.6) {
      // дошёл до последней точки — если не видит, вернуться в idle
      if (!sees && now - e.lastSeenPlayer > 3000) {
        e.state = 'idle';
        e.nextDecisionAt = 0;
        return;
      }
    }

    // стрейф (для normal/hard)
    if (now > e.strafeUntil && Math.random() < cfg.strafeChance * dt) {
      e.strafeDir = Math.random() < 0.5 ? -1 : 1;
      e.strafeUntil = now + 400 + Math.random() * 600;
    } else if (now > e.strafeUntil) {
      e.strafeDir = 0;
    }

    // направление движения
    const nx = toX / (d || 1);
    const nz = toZ / (d || 1);
    const perpX = -nz * e.strafeDir;
    const perpZ =  nx * e.strafeDir;

    const speed = cfg.speed * (sees ? 1 : 0.75);
    e.vel.x = (nx + perpX * 0.6) * speed;
    e.vel.z = (nz + perpZ * 0.6) * speed;

    // стреляем на ходу, если видим
    if (sees) tryEnemyShoot(e, now, player, dist);
  }

  /* --- ATTACK: держит дистанцию, стреляет --- */
  function updateAttack(e, dt, now, player, sees, dist) {
    // потерял игрока?
    if (!sees && now - e.lastSeenPlayer > 2000) {
      e.state = 'chase';
      return;
    }

    // HP низкое — отступить (только hard)
    if (cfg.retreatAtHp > 0 && e.hp / e.maxHp <= cfg.retreatAtHp) {
      if (Math.random() < 0.02) {
        e.state = 'reposition';
        e.stateTime = 0;
        pickRepositionTarget(e, player);
        return;
      }
    }

    // меняем позицию время от времени
    if (now > e.nextDecisionAt) {
      if (Math.random() < cfg.repositionChance) {
        e.state = 'reposition';
        e.stateTime = 0;
        pickRepositionTarget(e, player);
        return;
      }
      // решаем — стрейфить
      if (Math.random() < cfg.strafeChance) {
        e.strafeDir = Math.random() < 0.5 ? -1 : 1;
        e.strafeUntil = now + 500 + Math.random() * 600;
      } else {
        e.strafeDir = 0;
      }
      e.nextDecisionAt = now + 700 + Math.random() * 700;
    }

    // подходим/отходим к оптимальной дистанции
    const optimalDist = cfg.visionRange * 0.5;
    const tx = player.pos.x;
    const tz = player.pos.z;
    const toX = tx - e.pos.x;
    const toZ = tz - e.pos.z;
    const d = Math.hypot(toX, toZ) || 1;

    let moveDir = 0;
    if (d > optimalDist * 1.2) moveDir = 1;      // подойти
    else if (d < optimalDist * 0.6) moveDir = -1; // отойти

    const nx = toX / d;
    const nz = toZ / d;
    const perpX = -nz * e.strafeDir;
    const perpZ =  nx * e.strafeDir;

    const speed = cfg.speed * 0.7;
    e.vel.x = (nx * moveDir + perpX * 0.9) * speed;
    e.vel.z = (nz * moveDir + perpZ * 0.9) * speed;

    // стреляем
    if (sees) tryEnemyShoot(e, now, player, dist);
  }

  /* --- REPOSITION: бежит в укрытие --- */
  function updateReposition(e, dt, now, player) {
    const toX = e.targetPos.x - e.pos.x;
    const toZ = e.targetPos.z - e.pos.z;
    const d = Math.hypot(toX, toZ);

    if (d < 0.8 || e.stateTime > 2.0) {
      e.state = 'attack';
      e.stateTime = 0;
      e.nextDecisionAt = now + 300;
      return;
    }

    const s = cfg.speed * 1.1;
    e.vel.x = (toX / d) * s;
    e.vel.z = (toZ / d) * s;

    // стреляем на бегу (реже)
    if (Math.random() < 0.3) tryEnemyShoot(e, now, player, d);
  }

  function pickRepositionTarget(e, player) {
    // ищем точку в 8-12 метрах от игрока вбок/назад
    const angle = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * 6;
    e.targetPos.set(
      player.pos.x + Math.cos(angle) * dist,
      0,
      player.pos.z + Math.sin(angle) * dist
    );
  }

  /* ------------------------------------------------------------
     ВИДИМОСТЬ ИГРОКА
     Простая проверка: расстояние + луч не блокирован стеной.
  ------------------------------------------------------------ */
  function canSeePlayer(e, player, dist, distSq) {
    if (dist > cfg.visionRange) return false;

    // проверка угла зрения (враг смотрит в facingYaw)
    const facing = e.mesh.userData.facingYaw ?? 0;
    const angleToPlayer = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
    let diff = angleToPlayer - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // +-100° конус
    if (Math.abs(diff) > Math.PI * 0.55 && dist > 4) return false;

    // проверка линии видимости через коллайдеры (упрощённая по 2D)
    if (!lineBlocked(e.pos.x, e.pos.z, player.pos.x, player.pos.z, collidersLocal)) {
      return true;
    }

    // слышимость: если игрок бежит или стреляет рядом
    if (distSq < cfg.hearingRange * cfg.hearingRange) {
      // шумный игрок? (running)
      if (player.isRunning || player.speedRatio > 0.7) return true;
    }

    return false;
  }

  function lineBlocked(x1, z1, x2, z2, colliders) {
    // разбиваем отрезок на 12 шагов
    const steps = 12;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      if (collidesAt(x, z, 0.1, colliders)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------
     СТРЕЛЬБА
  ------------------------------------------------------------ */
  function tryEnemyShoot(e, now, player, dist) {
    if (now < e.nextShotAt) return;

    // реакция после обнаружения
    if (now - e.firstSeenAt < cfg.reactionTime * 1000) return;

    e.nextShotAt = now + cfg.fireRate * 1000 + (Math.random() - 0.5) * 200;

    // визуальный откат
    const mount = e.mesh.userData.parts.weaponMount;
    if (mount) {
      const origZ = mount.position.z;
      mount.position.z = origZ + 0.1;
      const t0 = now;
      const anim = () => {
        const k = (performance.now() - t0) / 100;
        if (k >= 1) { mount.position.z = origZ; return; }
        mount.position.z = origZ + 0.1 * (1 - k);
        requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }

    playShot('rifle'); // у врагов один тип

    // попадение?
    // базовая точность + модификатор по дистанции
    const distFactor = Math.max(0, 1 - dist / (cfg.visionRange * 1.5));
    const hitChance = cfg.accuracy * distFactor * 1.2;
    const roll = Math.random();

    if (roll < hitChance) {
      // попал
      damagePlayer(cfg.damage);
      playPlayerHurt();
      // вспышка урона на экране — ловит ui.js
      document.dispatchEvent(new CustomEvent('vanta:enemy-hit-player', {
        detail: { damage: cfg.damage }
      }));
    } else {
      // промах — визуальный трассер уходит мимо
      spawnTracer(e, player, false);
    }
  }

  /* ------------------------------------------------------------
     ТРАССЕР (визуальная линия выстрела врага)
  ------------------------------------------------------------ */
  function spawnTracer(e, player, hit) {
    const from = e.mesh.userData.parts.muzzle
      ? e.mesh.userData.parts.muzzle.getWorldPosition(new THREE.Vector3())
      : e.pos.clone().setY(1.3);
    const to = new THREE.Vector3(player.pos.x, 1.3, player.pos.z);
    // если промах — смещаем
    if (!hit) {
      to.x += (Math.random() - 0.5) * 4;
      to.z += (Math.random() - 0.5) * 4;
    }

    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.85
    });
    const line = new THREE.Line(geo, mat);
    addToEffects(line);

    // исчезает через 80 мс
    const start = performance.now();
    const dur = 80;
    const fade = () => {
      const k = (performance.now() - start) / dur;
      if (k >= 1) {
        mat.opacity = 0;
        if (line.parent) line.parent.remove(line);
        geo.dispose();
        mat.dispose();
        return;
      }
      mat.opacity = 0.85 * (1 - k);
      requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }

  /* ------------------------------------------------------------
     ДВИЖЕНИЕ + КОЛЛИЗИИ
  ------------------------------------------------------------ */
  function applyMovement(e, dt, colliders) {
    const r = e.radius;
    const dx = e.vel.x * dt;
    const dz = e.vel.z * dt;

    if (!collidesAt(e.pos.x + dx, e.pos.z, r, colliders)) {
      e.pos.x += dx;
    } else {
      // лёгкое скольжение вдоль стены
      e.vel.x *= -0.4;
      e.mesh.userData.facingYaw += Math.PI * 0.3;
    }

    if (!collidesAt(e.pos.x, e.pos.z + dz, r, colliders)) {
      e.pos.z += dz;
    } else {
      e.vel.z *= -0.4;
      e.mesh.userData.facingYaw += Math.PI * 0.3;
    }

    // ограничение по миру (страховка)
    const LIMIT = 100;
    e.pos.x = Math.max(-LIMIT, Math.min(LIMIT, e.pos.x));
    e.pos.z = Math.max(-LIMIT, Math.min(LIMIT, e.pos.z));
  }

  function collidesAt(x, z, r, colliders) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x + r > c.min.x && x - r < c.max.x &&
          z + r > c.min.z && z - r < c.max.z) {
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------
     ПОВОРОТ
  ------------------------------------------------------------ */
  function applyRotation(e, dt, player, sees) {
    let targetYaw;

    if (sees || (e.state === 'attack' && performance.now() - e.lastSeenPlayer < 1500)) {
      // смотрим на игрока
      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      targetYaw = Math.atan2(dx, dz);
    } else if (e.vel.x !== 0 || e.vel.z !== 0) {
      // смотрим по направлению движения
      targetYaw = Math.atan2(e.vel.x, e.vel.z);
    } else {
      return;
    }

    const current = e.mesh.userData.facingYaw ?? 0;
    let diff = targetYaw - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const speed = sees ? 8 : 4;
    e.mesh.userData.facingYaw = current + diff * Math.min(1, speed * dt);
  }

  /* ------------------------------------------------------------
     ВИЗУАЛЬНАЯ ВСПЫШКА ПРИ ПОПАДАНИИ
  ------------------------------------------------------------ */
  function updateHitFlash(e, now) {
    if (e.hitFlashUntil <= now) return;
    // возвращаем цвет материала обратно
    const parts = e.mesh.userData.parts;
    const bodyMat = parts.torso.material;
    const k = (e.hitFlashUntil - now) / 100;
    bodyMat.emissive = new THREE.Color(0xff2020);
    bodyMat.emissiveIntensity = k * 1.5;
  }

  /* ------------------------------------------------------------
     УРОН ПО ВРАГУ (вызывается из main.js через событие)
  ------------------------------------------------------------ */
  function damageEnemy(enemy, amount) {
    if (!enemy || !enemy.alive) return;

    enemy.hp -= amount;
    enemy.hitFlashUntil = performance.now() + 100;
    playHit();

    if (enemy.hp <= 0) {
      killEnemy(enemy);
    }
  }

  function killEnemy(enemy) {
    enemy.alive = false;
    enemy.state = 'dead';
    playEnemyDeath();

    // взрыв-эффект из частиц
    spawnDeathBurst(enemy.pos);

    if (onEnemyKilled) onEnemyKilled(enemy);
  }

  /* ------------------------------------------------------------
     ЭФФЕКТ СМЕРТИ — разлетающиеся кубики
  ------------------------------------------------------------ */
  function spawnDeathBurst(pos) {
    const group = new THREE.Group();
    group.position.set(pos.x, 1, pos.z);
    addToEffects(group);

    const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const pieces = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      const m = new THREE.Mesh(g, mat);
      const vx = (Math.random() - 0.5) * 6;
      const vy = Math.random() * 5 + 2;
      const vz = (Math.random() - 0.5) * 6;
      m.userData = { vx, vy, vz };
      group.add(m);
      pieces.push(m);
    }

    const start = performance.now();
    const dur = 900;
    const anim = () => {
      const k = (performance.now() - start) / dur;
      const dt = 0.016;
      for (const m of pieces) {
        m.userData.vy -= 12 * dt;
        m.position.x += m.userData.vx * dt;
        m.position.y += m.userData.vy * dt;
        m.position.z += m.userData.vz * dt;
        m.rotation.x += 5 * dt;
        m.rotation.y += 5 * dt;
      }
      if (k >= 1) {
        if (group.parent) group.parent.remove(group);
        pieces.forEach(p => p.geometry.dispose());
        mat.dispose();
        return;
      }
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  /* ------------------------------------------------------------
     СЛУШАЕМ СОБЫТИЕ СТРЕЛЬБЫ ИГРОКА (raycast по врагам)
  ------------------------------------------------------------ */
  function onPlayerFire(ev) {
    const { origin, dir, range, damage, pellets, weaponId } = ev.detail;

    if (!playerAliveCheck()) return;

    const shots = Math.max(1, pellets || 1);
    const damagePerShot = pellets ? damage : damage;

    for (let s = 0; s < shots; s++) {
      // небольшой разброс для дробинок
      let dx = dir.x, dy = dir.y, dz = dir.z;
      if (pellets && pellets > 1) {
        const spread = 0.05;
        dx += (Math.random() - 0.5) * spread;
        dy += (Math.random() - 0.5) * spread;
        dz += (Math.random() - 0.5) * spread;
        const len = Math.hypot(dx, dy, dz);
        dx /= len; dy /= len; dz /= len;
      }

      // ищем ближайшего врага вдоль луча
      let bestHit = null;
      let bestT = range;

      for (const e of enemies) {
        if (!e.alive) continue;
        const t = raySphere(origin, { x: dx, y: dy, z: dz },
          { x: e.pos.x, y: 1.1, z: e.pos.z }, 0.7);
        if (t !== null && t < bestT) {
          // проверка препятствий между игроком и врагом
          const hitX = origin.x + dx * t;
          const hitZ = origin.z + dz * t;
          if (!lineBlocked(origin.x, origin.z, hitX, hitZ, collidersLocal)) {
            bestT = t;
            bestHit = e;
          }
        }
      }

      if (bestHit) {
        damageEnemy(bestHit, damagePerShot);
      }
    }
  }

  function playerAliveCheck() {
    const p = getPlayer();
    return p && p.alive;
  }

  /* ------------------------------------------------------------
     RAY-SPHERE INTERSECTION
     origin — точка начала, dir — единичный вектор,
     center — центр сферы, radius — радиус.
     Возвращает t (расстояние) или null.
  ------------------------------------------------------------ */
  function raySphere(origin, dir, center, radius) {
    const ox = origin.x - center.x;
    const oy = origin.y - center.y;
    const oz = origin.z - center.z;

    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;

    const disc = b * b - c;
    if (disc < 0) return null;

    const sqrtD = Math.sqrt(disc);
    const t1 = -b - sqrtD;
    const t2 = -b + sqrtD;

    if (t1 > 0.1) return t1;
    if (t2 > 0.1) return t2;
    return null;
  }

  /* ------------------------------------------------------------
     СЛУШАТЕЛИ
  ------------------------------------------------------------ */
  document.addEventListener('vanta:fire-ray', onPlayerFire);

  /* ------------------------------------------------------------
     ПУБЛИЧНОЕ API МЕНЕДЖЕРА
  ------------------------------------------------------------ */
  function aliveCount() {
    let c = 0;
    for (const e of enemies) if (e.alive) c++;
    return c;
  }

  function pendingCount()
