/* ============================================================
   VANTA — characters.js
   Модели персонажей и врагов из примитивов + их характеристики
============================================================ */

import * as THREE from 'three';

/* ============================================================
   ХАРАКТЕРИСТИКИ ПЕРСОНАЖЕЙ
============================================================ */
export const CHARACTERS = {
  scout: {
    id: 'scout',
    name: 'Разведчик',
    desc: 'Быстрый, но хрупкий',
    hp: 80,
    speed: 7.0,
    runMult: 1.8,
    radius: 0.42,
    colors: {
      body: 0x2e7d32,   // зелёный
      head: 0xf1c27d,   // кожа
      legs: 0x1a1a1a,
      accent: 0x66ff88
    },
    bodyScale: 0.95
  },

  soldier: {
    id: 'soldier',
    name: 'Солдат',
    desc: 'Баланс скорости и здоровья',
    hp: 120,
    speed: 5.6,
    runMult: 1.7,
    radius: 0.48,
    colors: {
      body: 0x3949ab,   // синий
      head: 0xf1c27d,
      legs: 0x1a1a2e,
      accent: 0x6fa8ff
    },
    bodyScale: 1.0
  },

  heavy: {
    id: 'heavy',
    name: 'Тяжёлый',
    desc: 'Медленный, много здоровья',
    hp: 180,
    speed: 4.0,
    runMult: 1.5,
    radius: 0.55,
    colors: {
      body: 0x8b1a1a,   // тёмно-красный
      head: 0xdba57b,
      legs: 0x2a1a1a,
      accent: 0xff6655
    },
    bodyScale: 1.15
  }
};

/* ============================================================
   МОДЕЛЬ ПЕРСОНАЖА
   Собираем из примитивов: капсула, сфера, кубы.
   Возвращаем Group с ссылками на части (для анимации).
============================================================ */
export function createCharacterMesh(characterId, role = 'player') {
  const cfg = CHARACTERS[characterId] || CHARACTERS.soldier;
  const group = new THREE.Group();
  group.name = `character_${characterId}_${role}`;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: cfg.colors.body,
    roughness: 0.75,
    metalness: 0.1
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: cfg.colors.head,
    roughness: 0.85
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: cfg.colors.legs,
    roughness: 0.9
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: cfg.colors.accent,
    emissive: cfg.colors.accent,
    emissiveIntensity: 0.35,
    roughness: 0.5
  });

  const s = cfg.bodyScale;

  // ---------- Торс (капсула) ----------
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4 * s, 0.9 * s, 6, 14),
    bodyMat
  );
  torso.position.y = 1.0 * s;
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // ---------- Голова ----------
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32 * s, 18, 18),
    headMat
  );
  head.position.y = 1.9 * s;
  head.castShadow = true;
  group.add(head);

  // ---------- Визор (акцентная полоска) ----------
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.42 * s, 0.08 * s, 0.05 * s),
    accentMat
  );
  visor.position.set(0, 1.9 * s, 0.3 * s);
  group.add(visor);

  // ---------- Ноги ----------
  const legs = [];
  for (const sx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * s, 0.7 * s, 0.22 * s),
      legMat
    );
    leg.position.set(sx * s, 0.35 * s, 0);
    leg.castShadow = true;
    leg.receiveShadow = true;
    group.add(leg);
    legs.push(leg);
  }

  // ---------- Руки ----------
  const arms = [];
  for (const sx of [-0.5, 0.5]) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * s, 0.7 * s, 0.18 * s),
      bodyMat
    );
    arm.position.set(sx * s, 1.25 * s, 0);
    arm.castShadow = true;
    group.add(arm);
    arms.push(arm);
  }

  // ---------- Оружие в руке (базовое) ----------
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.35 * s, 1.25 * s, -0.35 * s);
  group.add(weaponMount);

  const defaultGun = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.6 })
  );
  defaultGun.position.z = -0.4;
  defaultGun.castShadow = true;
  weaponMount.add(defaultGun);

  // ---------- Точка вылета пули (спереди) ----------
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.35 * s, 1.25 * s, -0.9 * s);
  group.add(muzzle);

  // ---------- Метка для имени над головой ----------
  const headAnchor = new THREE.Object3D();
  headAnchor.position.y = 2.4 * s;
  group.add(headAnchor);

  // ---------- Сохраняем ссылки для анимации ----------
  group.userData = {
    parts: { torso, head, visor, legs, arms, weaponMount, muzzle, headAnchor },
    config: cfg,
    role,
    animPhase: Math.random() * Math.PI * 2   // для разнообразия покачивания
  };

  return group;
}

/* ============================================================
   МОДЕЛЬ ВРАГА
   Отдельная функция — враг визуально отличается (красный визор,
   угрожающая палитра).
============================================================ */
export function createEnemyMesh(variant = 'grunt') {
  const variants = {
    grunt: {
      body: 0x6a1f2a,     // тёмно-бордовый
      head: 0xd9a07a,
      legs: 0x1a0f0f,
      accent: 0xff2a44,
      scale: 1.0,
      hp: 100
    },
    brute: {
      body: 0x4a1018,
      head: 0xb88060,
      legs: 0x0f0a0a,
      accent: 0xff5533,
      scale: 1.25,
      hp: 180
    },
    scout: {
      body: 0x803a20,
      head: 0xf0c090,
      legs: 0x1a0f0a,
      accent: 0xffaa33,
      scale: 0.9,
      hp: 70
    }
  };

  const v = variants[variant] || variants.grunt;
  const group = new THREE.Group();
  group.name = `enemy_${variant}`;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: v.body, roughness: 0.8, metalness: 0.15
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: v.head, roughness: 0.9
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: v.legs, roughness: 0.95
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: v.accent,
    emissive: v.accent,
    emissiveIntensity: 0.85,
    roughness: 0.4
  });

  const s = v.scale;

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4 * s, 0.9 * s, 6, 14),
    bodyMat
  );
  torso.position.y = 1.0 * s;
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32 * s, 18, 18),
    headMat
  );
  head.position.y = 1.9 * s;
  head.castShadow = true;
  group.add(head);

  // Красный визор — сразу видно, что враг
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.44 * s, 0.09 * s, 0.05 * s),
    accentMat
  );
  visor.position.set(0, 1.9 * s, 0.3 * s);
  group.add(visor);

  const legs = [];
  for (const sx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * s, 0.7 * s, 0.22 * s),
      legMat
    );
    leg.position.set(sx * s, 0.35 * s, 0);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }

  const arms = [];
  for (const sx of [-0.5, 0.5]) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * s, 0.7 * s, 0.18 * s),
      bodyMat
    );
    arm.position.set(sx * s, 1.25 * s, 0);
    arm.castShadow = true;
    group.add(arm);
    arms.push(arm);
  }

  // Оружие врага
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.35 * s, 1.25 * s, -0.35 * s);
  group.add(weaponMount);

  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 })
  );
  gun.position.z = -0.4;
  gun.castShadow = true;
  weaponMount.add(gun);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.35 * s, 1.25 * s, -0.9 * s);
  group.add(muzzle);

  const headAnchor = new THREE.Object3D();
  headAnchor.position.y = 2.4 * s;
  group.add(headAnchor);

  group.userData = {
    parts: { torso, head, visor, legs, arms, weaponMount, muzzle, headAnchor },
    config: v,
    variant,
    hp: v.hp,
    animPhase: Math.random() * Math.PI * 2
  };

  return group;
}

/* ============================================================
   АНИМАЦИЯ ХОДЬБЫ
   Вызывается каждый кадр из player.js / enemies.js.
   Покачивает руки, ноги, торс в зависимости от скорости.
============================================================ */
export function animateWalk(mesh, speedRatio, dt) {
  if (!mesh || !mesh.userData?.parts) return;
  const { legs, arms, torso } = mesh.userData.parts;
  const phase = mesh.userData.animPhase;

  if (speedRatio < 0.01) {
    // стоя — плавный возврат в исходную позу
    legs.forEach((leg, i) => {
      leg.rotation.x *= 0.85;
    });
    arms.forEach((arm) => {
      arm.rotation.x *= 0.85;
    });
    if (torso) torso.position.y += (1.0 * (mesh.userData.config.bodyScale || 1) - torso.position.y) * 0.2;
    return;
  }

  // бег — качаем ноги и руки в противофазе
  const t = performance.now() * 0.001 * (6 + speedRatio * 6) + phase;
  const amp = 0.5 * Math.min(speedRatio, 1.4);

  legs[0].rotation.x = Math.sin(t) * amp;
  legs[1].rotation.x = Math.sin(t + Math.PI) * amp;

  arms[0].rotation.x = Math.sin(t + Math.PI) * amp * 0.7;
  arms[1].rotation.x = Math.sin(t) * amp * 0.7;

  // лёгкое подпрыгивание торса
  const baseY = 1.0 * (mesh.userData.config.bodyScale || 1);
  if (torso) torso.position.y = baseY + Math.abs(Math.sin(t)) * 0.04;
}

/* ============================================================
   ПОЗА СТРЕЛЬБЫ
   Лёгкий откат оружия и рук при выстреле.
============================================================ */
export function playShootPose(mesh) {
  if (!mesh || !mesh.userData?.parts) return;
  const { arms, weaponMount } = mesh.userData.parts;

  const originalZ = weaponMount.position.z;
  weaponMount.position.z = originalZ + 0.12;

  // плавный возврат через небольшой таймер
  const start = performance.now();
  const dur = 90; // мс
  const tick = () => {
    const k = (performance.now() - start) / dur;
    if (k >= 1) {
      weaponMount.position.z = originalZ;
      return;
    }
    weaponMount.position.z = originalZ + 0.12 * (1 - k);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ============================================================
   ПОЛУЧИТЬ ХАРАКТЕРИСТИКИ ПЕРСОНАЖА
============================================================ */
export function getCharacterStats(characterId) {
  return CHARACTERS[characterId] || CHARACTERS.soldier;
    }
