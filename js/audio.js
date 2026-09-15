/* ============================================================
   VANTA — audio.js
   Процедурный звук через Web Audio API. Без файлов.
============================================================ */

/* ============================================================
   ГЛОБАЛЬНОЕ СОСТОЯНИЕ
============================================================ */
let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;

let noiseBuffer = null;
let initialized = false;
let muted = false;

/* ============================================================
   ИНИЦИАЛИЗАЦИЯ
   Должна вызываться после клика пользователя (требование браузеров).
============================================================ */
export function initAudio() {
  if (initialized) {
    // если контекст заснул — будим
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    console.warn('[VANTA] Web Audio API не поддерживается');
    return;
  }

  ctx = new AC();

  // три шины: master → sfx / music
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.85;
  masterGain.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 1.0;
  sfxGain.connect(masterGain);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.35;
  musicGain.connect(masterGain);

  // белый шум — буфер для всех шумовых эффектов (выстрелы, взрывы)
  noiseBuffer = createNoiseBuffer(2);

  initialized = true;
}

function createNoiseBuffer(seconds = 2) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/* ============================================================
   УПРАВЛЕНИЕ ЗВУКОМ
============================================================ */
export function setMuted(value) {
  muted = !!value;
  if (masterGain) {
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.05);
  }
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

export function isMuted() { return muted; }

/* ============================================================
   ВНУТРЕННИЕ ПОМОЩНИКИ
============================================================ */
function now() { return ctx ? ctx.currentTime : 0; }

function ensure() {
  if (!ctx) {
    // ленивая инициализация — если пользователь не кликнул, не падаем
    try { initAudio(); } catch (e) { /* silent */ }
  }
  return !!ctx;
}

/**
 * Играть шумовой burst (для выстрелов, взрывов).
 */
function playNoiseBurst({ duration, attack = 0.001, decay = 0.08, filterFreq = 2000, filterQ = 1, gain = 0.4, type = 'lowpass' }) {
  if (!ensure()) return;

  const t = now();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  filter.Q.value = filterQ;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration + decay);

  src.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);

  src.start(t);
  src.stop(t + duration + decay + 0.05);
}

/**
 * Играть тон (синус/пила) с обёрткой.
 */
function playTone({ freq, freqEnd, duration, gain = 0.2, wave = 'sine', attack = 0.005, decay }) {
  if (!ensure()) return;

  const t = now();
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration + (decay ?? duration));

  osc.connect(g);
  g.connect(sfxGain);

  osc.start(t);
  osc.stop(t + duration + (decay ?? duration) + 0.05);
}

/* ============================================================
   ЗВУКИ ОРУЖИЯ
============================================================ */

/**
 * Единая точка вызова выстрела — маршрутизирует по типу оружия.
 * @param {string} type — 'pistol' | 'rifle' | 'shotgun' | 'sniper'
 */
export function playShot(type = 'pistol') {
  if (!ensure()) return;

  switch (type) {
    case 'pistol':   playPistol();  break;
    case 'rifle':    playRifle();   break;
    case 'shotgun':  playShotgun(); break;
    case 'sniper':   playSniper();  break;
    default:         playPistol();
  }
}

function playPistol() {
  // резкий щелчок: тон + шум
  playTone({ freq: 420, freqEnd: 90, duration: 0.06, gain: 0.22, wave: 'square' });
  playNoiseBurst({ duration: 0.05, decay: 0.04, filterFreq: 3800, gain: 0.28 });
}

function playRifle() {
  // короткий, но громкий, чуть ниже
  playTone({ freq: 340, freqEnd: 70, duration: 0.045, gain: 0.18, wave: 'sawtooth' });
  playNoiseBurst({ duration: 0.04, decay: 0.03, filterFreq: 4500, gain: 0.22 });
}

function playShotgun() {
  // мощный, широкий
  playTone({ freq: 180, freqEnd: 45, duration: 0.14, gain: 0.30, wave: 'sawtooth' });
  playNoiseBurst({ duration: 0.18, decay: 0.12, filterFreq: 2200, gain: 0.45, type: 'lowpass', filterQ: 0.7 });
}

function playSniper() {
  // резкий, звонкий, с длинным хвостом
  playTone({ freq: 620, freqEnd: 90, duration: 0.1, gain: 0.28, wave: 'square' });
  playNoiseBurst({ duration: 0.22, decay: 0.35, filterFreq: 5200, gain: 0.35 });
}

/* ============================================================
   ПЕРЕЗАРЯДКА
============================================================ */
export function playReload() {
  if (!ensure()) return;

  // два металлических щелчка — магазин вынули / вставили
  const t = now();

  // клик 1
  playNoiseBurst({ duration: 0.02, decay: 0.03, filterFreq: 3000, gain: 0.15, type: 'highpass' });

  // клик 2 через 120 мс
  setTimeout(() => {
    playNoiseBurst({ duration: 0.03, decay: 0.05, filterFreq: 2500, gain: 0.18, type: 'highpass' });
  }, 120);

  // тихий металлический тон
  playTone({ freq: 2400, freqEnd: 1800, duration: 0.03, gain: 0.05, wave: 'triangle' });
}

/* ============================================================
   ПУСТОЙ ЩЕЛЧОК (нет патронов)
============================================================ */
export function playEmptyClick() {
  if (!ensure()) return;
  playNoiseBurst({ duration: 0.015, decay: 0.02, filterFreq: 5000, gain: 0.12, type: 'highpass' });
  playTone({ freq: 3200, freqEnd: 2400, duration: 0.02, gain: 0.04, wave: 'triangle' });
}

/* ============================================================
   ПОПАДАНИЕ ПО ВРАГУ
============================================================ */
export function playHit() {
  if (!ensure()) return;
  // глухой удар
  playTone({ freq: 180, freqEnd: 60, duration: 0.08, gain: 0.18, wave: 'sine' });
  playNoiseBurst({ duration: 0.06, decay: 0.05, filterFreq: 900, gain: 0.12 });
}

/* ============================================================
   СМЕРТЬ ВРАГА
============================================================ */
export function playEnemyDeath() {
  if (!ensure()) return;
  // зловещий нисходящий тон
  playTone({ freq: 220, freqEnd: 55, duration: 0.35, gain: 0.2, wave: 'sawtooth', decay: 0.15 });
  playNoiseBurst({ duration: 0.25, decay: 0.2, filterFreq: 700, gain: 0.18 });
}

/* ============================================================
   УРОН ПО ИГРОКУ
============================================================ */
export function playPlayerHurt() {
  if (!ensure()) return;
  // глухой удар + низкий тон
  playTone({ freq: 110, freqEnd: 40, duration: 0.18, gain: 0.25, wave: 'sawtooth' });
  playNoiseBurst({ duration: 0.12, decay: 0.1, filterFreq: 500, gain: 0.22 });
}

/* ============================================================
   СМЕРТЬ ИГРОКА
============================================================ */
export function playPlayerDeath() {
  if (!ensure()) return;
  // длинный нисходящий тон + шум
  playTone({ freq: 400, freqEnd: 40, duration: 1.2, gain: 0.3, wave: 'sawtooth', decay: 0.4 });
  playNoiseBurst({ duration: 0.8, decay: 0.5, filterFreq: 400, gain: 0.22 });
}

/* ============================================================
   НАЧАЛО ВОЛНЫ
============================================================ */
export function playWaveStart() {
  if (!ensure()) return;
  // восходящий аккорд
  const t = now();

  [220, 330, 440, 660].forEach((freq, i) => {
    setTimeout(() => {
      playTone({ freq, duration: 0.12, gain: 0.14, wave: 'triangle', attack: 0.01 });
    }, i * 70);
  });
}

/* ============================================================
   ПОБЕДА (все волны пройдены, если такое будет)
============================================================ */
export function playVictory() {
  if (!ensure()) return;

  const notes = [523, 659, 784, 1047]; // C-E-G-C
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone({ freq, duration: 0.35, gain: 0.18, wave: 'triangle', attack: 0.02 });
    }, i * 130);
  });
}

/* ============================================================
   ФОНОВАЯ МУЗЫКА (простой эмбиент-дрон)
   Работает постоянно, пока идёт игра. Можно выключить.
============================================================ */
let droneNodes = null;

export function startAmbientDrone() {
  if (!ensure()) return;
  if (droneNodes) return;

  const t = now();

  // два слегка расстроенных осциллятора — густой низкий гул
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 55;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 55 * 1.005; // небольшой детюн

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 200;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.08, t + 3);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(g);
  g.connect(musicGain);

  osc1.start(t);
  osc2.start(t);

  droneNodes = { osc1, osc2, filter, gain: g };
}

export function stopAmbientDrone() {
  if (!droneNodes) return;
  const t = now();

  droneNodes.gain.gain.cancelScheduledValues(t);
  droneNodes.gain.gain.setValueAtTime(droneNodes.gain.gain.value, t);
  droneNodes.gain.gain.linearRampToValueAtTime(0, t + 0.8);

  const nodes = droneNodes;
  droneNodes = null;

  setTimeout(() => {
    try {
      nodes.osc1.stop();
      nodes.osc2.stop();
      nodes.osc1.disconnect();
      nodes.osc2.disconnect();
      nodes.filter.disconnect();
      nodes.gain.disconnect();
    } catch (e) { /* уже остановлен */ }
  }, 1000);
}

/* ============================================================
   ПАУЗА / ВОЗОБНОВЛЕНИЕ АУДИО-КОНТЕКСТА
============================================================ */
export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend();
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

/* ============================================================
   ГЕТТЕРЫ (для отладки)
============================================================ */
export function getAudioContext() { return ctx; }
export function isInitialized() { return initialized; }
