/* ============================================================
   VANTA — main.js
   Точка входа: игровой цикл, состояния, связка модулей
============================================================ */

import * as THREE from 'three';

import {
  initScene, getScene, getCamera, getRenderer,
  clearWorld, startRenderLoop, stopRenderLoop,
  onWindowResize
} from './scene.js';

import { createPlayer, updatePlayer, getPlayer } from './player.js';
import { buildMap, getSpawnPoint } from './maps.js';
import { createEnemyManager } from './enemies.js';
import { createCharacterMesh } from './characters.js';
import { initAudio } from './audio.js';
import {
  updateHUD, showHUD, hideHUD, showCenterMsg,
  bindMenu, bindPause, bindDeath,
  showScreen, hideAllScreens, SCREENS
} from './ui.js';

/* ============================================================
   ГЛОБАЛЬНОЕ СОСТОЯНИЕ
============================================================ */
const state = {
  phase: 'menu',              // menu | playing | paused | dead
  difficulty: 'normal',       // easy | normal | hard
  mapId: 'city',              // arena | city | bunker
  characterId: 'soldier',     // scout | soldier | heavy
  score: 0,
  kills: 0,
  wave: 1,
  time: 0,
  lastTime: 0
};

let enemyManager = null;
let clock = null;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
============================================================ */
function boot() {
  initScene();
  clock = new THREE.Clock();

  // подписка на ресайз
  window.addEventListener('resize', onWindowResize);

  // привязка кнопок меню
  bindMenu({
    onDifficulty: (val) => { state.difficulty = val; },
    onMap:        (val) => { state.mapId = val; },
    onCharacter:  (val) => { state.characterId = val; },
    onStart:      () => startGame()
  });

  bindPause({
    onResume:  () => resumeGame(),
    onRestart: () => restartGame(),
    onMenu:    () => toMainMenu()
  });

  bindDeath({
    onRetry: () => restartGame(),
    onMenu:  () => toMainMenu()
  });

  // ESC — пауза
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && state.phase === 'playing') {
      pauseGame();
    } else if (e.code === 'Escape' && state.phase === 'paused') {
      resumeGame();
    }
  });

  // показываем главное меню
  showScreen(SCREENS.MENU);
  requestAnimationFrame(loop);
}

/* ============================================================
   УПРАВЛЕНИЕ ФАЗАМИ
============================================================ */
function startGame() {
  // сброс состояния
  state.score = 0;
  state.kills = 0;
  state.wave = 1;
  state.time = 0;

  // скрываем все оверлеи, показываем HUD
  hideAllScreens();
  showHUD();

  // строим карту
  const scene = getScene();
  clearWorld();
  const mapData = buildMap(state.mapId, scene);
  const spawn = getSpawnPoint(state.mapId);

  // создаём игрока
  const playerMesh = createCharacterMesh(state.characterId, 'player');
  scene.add(playerMesh);
  createPlayer({
    mesh: playerMesh,
    spawn,
    characterId: state.characterId,
    colliders: mapData.colliders
  });

  // создаём менеджер врагов
  if (enemyManager) enemyManager.dispose();
  enemyManager = createEnemyManager({
    scene,
    colliders: mapData.colliders,
    spawnPoints: mapData.enemySpawns,
    difficulty: state.difficulty,
    onPlayerHit: (dmg) => handlePlayerHit(dmg),
    onEnemyKilled: (enemy) => handleEnemyKilled(enemy)
  });
  enemyManager.startWave(1);

  // инициализируем звук после клика пользователя (требование браузеров)
  initAudio();

  // захватываем курсор
  const renderer = getRenderer();
  renderer.domElement.requestPointerLock();

  // обновляем HUD
  updateHUD({
    hp: 100, maxHp: 100,
    ammo: 0, weaponName: '—',
    score: 0, kills: 0, wave: 1, enemiesLeft: 0
  });

  // запускаем рендер-цикл
  startRenderLoop(renderer, getScene(), getCamera());

  state.phase = 'playing';
  state.lastTime = performance.now();
  console.log('[VANTA] Игра началась:', state.mapId, '/', state.difficulty, '/', state.characterId);
}

function pauseGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  stopRenderLoop();
  document.exitPointerLock?.();
  showScreen(SCREENS.PAUSE);
  hideHUD();
}

function resumeGame() {
  if (state.phase !== 'paused') return;
  hideAllScreens();
  showHUD();
  const renderer = getRenderer();
  renderer.domElement.requestPointerLock();
  startRenderLoop(renderer, getScene(), getCamera());
  state.lastTime = performance.now();
  state.phase = 'playing';
}

function restartGame() {
  if (enemyManager) { enemyManager.dispose(); enemyManager = null; }
  stopRenderLoop();
  hideAllScreens();
  startGame();
}

function toMainMenu() {
  if (enemyManager) { enemyManager.dispose(); enemyManager = null; }
  stopRenderLoop();
  clearWorld();
  document.exitPointerLock?.();
  hideHUD();
  showScreen(SCREENS.MENU);
  state.phase = 'menu';
}

/* ============================================================
   СОБЫТИЯ ИГРЫ
============================================================ */
function handlePlayerHit(dmg) {
  const player = getPlayer();
  if (!player || !player.alive) return;

  player.hp -= dmg;
  if (player.hp < 0) player.hp = 0;

  updateHUD({ hp: player.hp, maxHp: player.maxHp });
  showCenterMsg(`-${dmg}`, 'dmg');

  if (player.hp <= 0) {
    handlePlayerDeath();
  }
}

function handleEnemyKilled(enemy) {
  state.kills++;
  state.score += enemy.scoreValue || 100;
  showCenterMsg('+100', 'kill');
  updateHUD({
    score: state.score,
    kills: state.kills,
    enemiesLeft: enemyManager ? enemyManager.aliveCount() : 0
  });
}

function handlePlayerDeath() {
  state.phase = 'dead';
  stopRenderLoop();
  document.exitPointerLock?.();
  hideHUD();
  showScreen(SCREENS.DEATH, {
    kills: state.kills,
    wave: state.wave,
    score: state.score
  });
}

/* ============================================================
   ИГРОВОЙ ЦИКЛ
============================================================ */
let loopRunning = true;

function loop(now) {
  if (!loopRunning) return;
  requestAnimationFrame(loop);

  const dt = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;

  if (state.phase === 'playing') {
    state.time += dt;

    // игрок
    updatePlayer(dt);

    // враги
    if (enemyManager) {
      enemyManager.update(dt);

      // проверка окончания волны
      if (enemyManager.aliveCount() === 0 && !enemyManager.isSpawning()) {
        state.wave++;
        enemyManager.startWave(state.wave);
        updateHUD({ wave: state.wave });
        showCenterMsg(`ВОЛНА ${state.wave}`, 'kill');
      }

      updateHUD({
        enemiesLeft: enemyManager.aliveCount() + enemyManager.pendingCount()
      });
    }
  }
}

/* ============================================================
   СТАРТ
============================================================ */
window.addEventListener('DOMContentLoaded', boot);
