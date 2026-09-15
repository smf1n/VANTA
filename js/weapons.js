/* ============================================================
   VANTA — weapons.js
   Оружие: характеристики + визуальные модели
============================================================ */

import * as THREE from 'three';

/* ============================================================
   ХАРАКТЕРИСТИКИ ОРУЖИЯ
   damage — урон за выстрел (для дробовика — за дробинку)
   fireRate — секунды между выстрелами
   magSize — патронов в магазине
   reloadTime — секунды на перезарядку
   spread — разброс в радианах (0.01 = очень точное)
   range — дальность в метрах
   auto — автоматический огонь при удержании
   pellets — кол-во дробинок (для дробовика)
   sound — тип звука в audio.js
============================================================ */
export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'Пистолет',
    damage: 22,
    fireRate: 0.28,
    magSize: 12,
    reloadTime: 1.3,
    spread: 0.012,
    range: 80,
    auto: false,
    color: 0x2a2a30,
    accent: 0x8888aa,
    sound: 'pistol',
    score: 100
  },

  rifle: {
    id: 'rifle',
    name: 'Автомат',
    damage: 16,
    fireRate: 0.09,
    magSize: 30,
    reloadTime: 1.9,
    spread: 0.032,
    range: 110,
    auto: true,
    color: 0x3a3a2a,
    accent: 0x6a6a4a,
    sound: 'rifle',
    score: 100
  },

  shotgun: {
    id: 'shotgun',
    name: 'Дробовик',
    damage: 13,
    pellets: 8,
    fireRate: 0.85,
    magSize: 6,
    reloadTime: 2.3,
    spread: 0.15,
    range: 32,
    auto: false,
    color: 0x4a2a1a,
    accent: 0x9a7b5a,
    sound: 'shotgun',
    score: 100
  },

  sniper: {
    id: 'sniper',
    name: 'Снайперка',
    damage: 90,
    fireRate: 1.3,
    magSize: 5,
    reloadTime: 2.6,
    spread: 0.001,
    range: 300,
    auto: false,
    color: 0x1e2a1e,
    accent: 0x4a6a4a,
    sound: 'sniper',
    score: 150
  }
};

/* ============================================================
   ПОРЯДОК ОРУЖИЯ В РУКАХ (для быстрого переключения 1-4)
============================================================ */
export const WEAPON_ORDER = ['pistol', 'rifle', 'shotgun', 'sniper'];

/* ============================================================
   ГЕТТЕР ОРУЖИЯ ПО ID
============================================================ */
export function getWeapon(id) {
  return WEAPONS[id] || null;
}

/* ============================================================
   СОЗДАНИЕ ВИЗУАЛЬНОЙ МОДЕЛИ ОРУЖИЯ
   Возвращает Group, крепится к weaponMount персонажа.
============================================================ */
export function createWeaponMesh(weaponId) {
  const w = getWeapon(weaponId);
  if (!w) return new THREE.Group();

  const group = new THREE.Group();
  group.name = `weapon_${weaponId}`;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: w.color,
    roughness: 0.55,
    metalness: 0.65
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: w.accent,
    roughness: 0.4,
    metalness: 0.7
  });

  switch (weaponId) {
    case 'pistol':   buildPistol(group, bodyMat, accentMat); break;
    case 'rifle':    buildRifle(group, bodyMat, accentMat);  break;
    case 'shotgun':  buildShotgun(group, bodyMat, accentMat); break;
    case 'sniper':   buildSniper(group, bodyMat, accentMat); break;
  }

  return group;
}

/* ---------- Пистолет ---------- */
function buildPistol(g, bodyMat, accentMat) {
  // корпус
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.14, 0.42),
    bodyMat
  );
  body.position.z = -0.21;
  body.castShadow = true;
  g.add(body);

  // ствол
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.16),
    accentMat
  );
  barrel.position.set(0, 0.02, -0.44);
  barrel.castShadow = true;
  g.add(barrel);

  // рукоять
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.2, 0.1),
    bodyMat
  );
  grip.position.set(0, -0.16, -0.05);
  grip.rotation.x = -0.18;
  grip.castShadow = true;
  g.add(grip);
}

/* ---------- Автомат ---------- */
function buildRifle(g, bodyMat, accentMat) {
  // корпус
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.16, 0.7),
    bodyMat
  );
  body.position.z = -0.35;
  body.castShadow = true;
  g.add(body);

  // ствол
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.4),
    accentMat
  );
  barrel.position.set(0, 0.02, -0.9);
  barrel.castShadow = true;
  g.add(barrel);

  // магазин
  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.22, 0.14),
    bodyMat
  );
  mag.position.set(0, -0.18, -0.2);
  mag.castShadow = true;
  g.add(mag);

  // рукоять
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.2, 0.12),
    bodyMat
  );
  grip.position.set(0, -0.16, 0.02);
  grip.rotation.x = -0.15;
  grip.castShadow = true;
  g.add(grip);

  // приклад
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.14, 0.28),
    bodyMat
  );
  stock.position.set(0, -0.02, 0.2);
  stock.castShadow = true;
  g.add(stock);
}

/* ---------- Дробовик ---------- */
function buildShotgun(g, bodyMat, accentMat) {
  // длинный корпус
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.16, 0.9),
    bodyMat
  );
  body.position.z = -0.45;
  body.castShadow = true;
  g.add(body);

  // ствол (широкий и длинный)
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12),
    accentMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, -1.15);
  barrel.castShadow = true;
  g.add(barrel);

  // помпа
  const pump = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.22),
    bodyMat
  );
  pump.position.set(0, -0.04, -0.7);
  pump.castShadow = true;
  g.add(pump);

  // рукоять
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.2, 0.13),
    bodyMat
  );
  grip.position.set(0, -0.16, 0.02);
  grip.rotation.x = -0.18;
  grip.castShadow = true;
  g.add(grip);

  // приклад
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.15, 0.3),
    bodyMat
  );
  stock.position.set(0, -0.03, 0.28);
  stock.castShadow = true;
  g.add(stock);
}

/* ---------- Снайперка ---------- */
function buildSniper(g, bodyMat, accentMat) {
  // корпус
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.14, 1.1),
    bodyMat
  );
  body.position.z = -0.55;
  body.castShadow = true;
  g.add(body);

  // длинный тонкий ствол
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.7, 10),
    accentMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -1.45);
  barrel.castShadow = true;
  g.add(barrel);

  // прицел
  const scope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.4, 12),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.9 })
  );
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.16, -0.4);
  scope.castShadow = true;
  g.add(scope);

  // линза прицела (синеватое свечение)
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.045, 12),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  lens.position.set(0, 0.16, -0.61);
  g.add(lens);

  // магазин
  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.18, 0.12),
    bodyMat
  );
  mag.position.set(0, -0.15, -0.35);
  mag.castShadow = true;
  g.add(mag);

  // рукоять
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.2, 0.12),
    bodyMat
  );
  grip.position.set(0, -0.16, 0.04);
  grip.rotation.x = -0.15;
  grip.castShadow = true;
  g.add(grip);

  // приклад с подщёчником
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.15, 0.4),
    bodyMat
  );
  stock.position.set(0, -0.02, 0.32);
  stock.castShadow = true;
  g.add(stock);
}

/* ============================================================
   ПРИВЯЗКА ОРУЖИЯ К ПЕРСОНАЖУ
   Заменяет модель в weaponMount, удаляя старую.
============================================================ */
export function applyWeaponToCharacter(characterMesh, weaponId) {
  if (!characterMesh || !characterMesh.userData?.parts) return;
  const mount = characterMesh.userData.parts.weaponMount;
  if (!mount) return;

  // удаляем старое
  const old = [...mount.children];
  for (const child of old) {
    mount.remove(child);
    child.traverse?.((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material.dispose();
      }
    });
  }

  // добавляем новое
  const newWeapon = createWeaponMesh(weaponId);
  mount.add(newWeapon);
}

/* ============================================================
   УТИЛИТЫ
============================================================ */

/**
 * Возвращает все оружие в виде массива (для меню/UI).
 */
export function getAllWeapons() {
  return WEAPON_ORDER.map(id => WEAPONS[id]);
}

/**
 * Общее количество патронов для HUD.
 */
export function getAmmoInfo(player) {
  if (!player || !player.weapon) return null;
  const w = getWeapon(player.weapon);
  if (!w) return null;
  return {
    weaponName: w.name,
    ammo: player.ammo[player.weapon] || 0,
    magSize: w.magSize,
    reloading: player.reloading
  };
}

/**
 * Средний DPS оружия (для отображения в меню, отладки).
 */
export function getWeaponDPS(id) {
  const w = getWeapon(id);
  if (!w) return 0;
  const pellets = w.pellets || 1;
  return (w.damage * pellets) / w.fireRate;
}
