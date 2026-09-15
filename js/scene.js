/* ============================================================
   VANTA — scene.js
   Сцена, свет, камера, рендер, рендер-цикл, туман
============================================================ */

import * as THREE from 'three';

/* ============================================================
   ВНУТРЕННИЕ ПЕРЕМЕННЫЕ
============================================================ */
let scene = null;
let camera = null;
let renderer = null;
let sunLight = null;
let hemiLight = null;
let ambientLight = null;

let worldGroup = null;      // вся геометрия карты (очищается между играми)
let effectsGroup = null;    // частицы, вспышки, трассеры

let renderRAF = null;       // id requestAnimationFrame рендера
let isRendering = false;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
============================================================ */
export function initScene() {
  // ---------- Сцена ----------
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c14);
  scene.fog = new THREE.Fog(0x0a0c14, 45, 140);

  // ---------- Камера ----------
  camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    600
  );
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 1, 0);

  // ---------- Рендер ----------
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Вставляем канвас в контейнер
  const container = document.getElementById('game-container');
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // ---------- Свет ----------
  // полушарие — мягкое небо/земля
  hemiLight = new THREE.HemisphereLight(0x8fb4ff, 0x1a1a2a, 0.55);
  scene.add(hemiLight);

  // мягкая заливка
  ambientLight = new THREE.AmbientLight(0x404860, 0.4);
  scene.add(ambientLight);

  // основное солнце с тенями
  sunLight = new THREE.DirectionalLight(0xfff2d5, 1.35);
  sunLight.position.set(50, 80, 30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -90;
  sunLight.shadow.camera.right = 90;
  sunLight.shadow.camera.top = 90;
  sunLight.shadow.camera.bottom = -90;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 250;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // ---------- Группы ----------
  worldGroup = new THREE.Group();
  worldGroup.name = 'world';
  scene.add(worldGroup);

  effectsGroup = new THREE.Group();
  effectsGroup.name = 'effects';
  scene.add(effectsGroup);

  return { scene, camera, renderer };
}

/* ============================================================
   ГЕТТЕРЫ
============================================================ */
export function getScene()    { return scene; }
export function getCamera()   { return camera; }
export function getRenderer() { return renderer; }

export function getWorldGroup()   { return worldGroup; }
export function getEffectsGroup() { return effectsGroup; }

export function getSunLight() { return sunLight; }

/* ============================================================
   ОЧИСТКА МИРА
   Удаляет всю геометрию карты и эффектов между играми
============================================================ */
export function clearWorld() {
  if (!worldGroup || !effectsGroup) return;

  disposeGroup(worldGroup);
  disposeGroup(effectsGroup);
}

function disposeGroup(group) {
  // копируем массив, потому что remove мутирует children
  const children = [...group.children];
  for (const child of children) {
    group.remove(child);

    // рекурсивно освобождаем геометрию и материалы
    child.traverse?.((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach(disposeMaterial);
        } else {
          disposeMaterial(node.material);
        }
      }
    });

    // если это был просто Mesh без детей
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
      else disposeMaterial(child.material);
    }
  }
}

function disposeMaterial(mat) {
  // освобождаем текстуры, если есть
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) {
    if (mat[key]) mat[key].dispose();
  }
  mat.dispose();
}

/* ============================================================
   РЕНДЕР-ЦИКЛ
============================================================ */
export function startRenderLoop() {
  if (isRendering) return;
  isRendering = true;
  tick();
}

export function stopRenderLoop() {
  isRendering = false;
  if (renderRAF) {
    cancelAnimationFrame(renderRAF);
    renderRAF = null;
  }
}

function tick() {
  if (!isRendering) return;
  renderRAF = requestAnimationFrame(tick);
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

/* ============================================================
   РЕСАЙЗ
============================================================ */
export function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

/* ============================================================
   УТИЛИТЫ ДЛЯ ВНЕШНИХ МОДУЛЕЙ
============================================================ */

/**
 * Быстрое добавление меша в мир.
 */
export function addToWorld(mesh) {
  if (worldGroup) worldGroup.add(mesh);
}

/**
 * Быстрое добавление эффекта (вспышка, частица).
 */
export function addToEffects(obj) {
  if (effectsGroup) effectsGroup.add(obj);
}

/**
 * Обновить цель солнца (чтобы тени следовали за игроком).
 */
export function updateSunTarget(x, z) {
  if (!sunLight) return;
  sunLight.target.position.set(x, 0, z);
  sunLight.position.set(x + 50, 80, z + 30);
  sunLight.target.updateMatrixWorld();
}

/**
 * Сменить цвет тумана/фона (например, для бункера).
 */
export function setAtmosphere({ bg, fog, fogNear, fogFar, sunColor, sunIntensity, hemiSky, hemiGround }) {
  if (bg !== undefined && scene) scene.background = new THREE.Color(bg);
  if (scene && scene.fog) {
    if (fog !== undefined) scene.fog.color = new THREE.Color(fog);
    if (fogNear !== undefined) scene.fog.near = fogNear;
    if (fogFar !== undefined) scene.fog.far = fogFar;
  }
  if (sunLight) {
    if (sunColor !== undefined) sunLight.color = new THREE.Color(sunColor);
    if (sunIntensity !== undefined) sunLight.intensity = sunIntensity;
  }
  if (hemiLight) {
    if (hemiSky !== undefined || hemiGround !== undefined) {
      hemiLight.color = new THREE.Color(hemiSky ?? hemiLight.color.getHex());
      hemiLight.groundColor = new THREE.Color(hemiGround ?? hemiLight.groundColor.getHex());
    }
  }
}
