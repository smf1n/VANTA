/* ============================================================
   VANTA — ui.js
   HUD, меню, пауза, смерть, сообщения
============================================================ */

/* ============================================================
   КОНСТАНТЫ ЭКРАНОВ
============================================================ */
export const SCREENS = {
  MENU:    'menu',
  PAUSE:   'pause',
  DEATH:   'death',
  LOADING: 'loading'
};

/* ============================================================
   КЭШ DOM-ЭЛЕМЕНТОВ
============================================================ */
const dom = {};

function cacheDom() {
  // экраны
  dom.menu        = document.getElementById('main-menu');
  dom.pause       = document.getElementById('pause-menu');
  dom.death       = document.getElementById('death-screen');
  dom.loading     = document.getElementById('loading-screen');

  // HUD
  dom.hud         = document.getElementById('hud');
  dom.hpFill      = document.getElementById('hp-fill');
  dom.hpText      = document.getElementById('hp-text');
  dom.score       = document.getElementById('score');
  dom.kills       = document.getElementById('kills');
  dom.ammo        = document.getElementById('ammo');
  dom.weaponName  = document.getElementById('weapon-name');
  dom.reloadHint  = document.getElementById('reload-hint');
  dom.waveNumber  = document.getElementById('wave-number');
  dom.enemiesLeft = document.getElementById('enemies-left');
  dom.centerMsg   = document.getElementById('center-msg');

  // кнопки меню
  dom.startBtn    = document.getElementById('start-btn');
  dom.resumeBtn   = document.getElementById('resume-btn');
  dom.restartBtn  = document.getElementById('restart-btn');
  dom.menuBtn     = document.getElementById('menu-btn');
  dom.retryBtn    = document.getElementById('retry-btn');
  dom.deathMenuBtn= document.getElementById('death-menu-btn');

  // статистика на экране смерти
  dom.deathKills  = document.getElementById('death-kills');
  dom.deathWave   = document.getElementById('death-wave');
  dom.deathScore  = document.getElementById('death-score');
}

/* ============================================================
   УПРАВЛЕНИЕ ЭКРАНАМИ
============================================================ */
export function showScreen(name, data) {
  if (!dom.menu) cacheDom();

  // скрываем все
  dom.menu.classList.add('hidden');
  dom.pause.classList.add('hidden');
  dom.death.classList.add('hidden');
  dom.loading.classList.add('hidden');

  // показываем нужный
  switch (name) {
    case SCREENS.MENU:
      dom.menu.classList.remove('hidden');
      break;

    case SCREENS.PAUSE:
      dom.pause.classList.remove('hidden');
      break;

    case SCREENS.DEATH:
      if (data) {
        dom.deathKills.textContent = data.kills ?? 0;
        dom.deathWave.textContent  = data.wave ?? 1;
        dom.deathScore.textContent = data.score ?? 0;
      }
      dom.death.classList.remove('hidden');
      break;

    case SCREENS.LOADING:
      dom.loading.classList.remove('hidden');
      break;
  }
}

export function hideAllScreens() {
  if (!dom.menu) cacheDom();
  dom.menu.classList.add('hidden');
  dom.pause.classList.add('hidden');
  dom.death.classList.add('hidden');
  dom.loading.classList.add('hidden');
}

/* ============================================================
   HUD — ПОКАЗ / СКРЫТИЕ
============================================================ */
export function showHUD() {
  if (!dom.hud) cacheDom();
  dom.hud.classList.remove('hidden');
}

export function hideHUD() {
  if (!dom.hud) cacheDom();
  dom.hud.classList.add('hidden');
}

/* ============================================================
   ОБНОВЛЕНИЕ HUD
   Принимает частичный объект:
   { hp, maxHp, ammo, weaponName, score, kills, wave, enemiesLeft, reloading }
============================================================ */
export function updateHUD(data) {
  if (!dom.hud) cacheDom();

  // здоровье
  if (data.hp !== undefined || data.maxHp !== undefined) {
    const hp = data.hp ?? currentHp;
    const maxHp = data.maxHp ?? currentMaxHp;
    currentHp = hp;
    currentMaxHp = maxHp;

    const pct = Math.max(0, Math.min(1, hp / maxHp)) * 100;
    dom.hpFill.style.width = pct + '%';
    dom.hpFill.classList.toggle('low', pct < 30);
    if (dom.hpText) dom.hpText.textContent = `${Math.max(0, Math.round(hp))} / ${maxHp}`;
  }

  // оружие и патроны
  if (data.ammo !== undefined) {
    dom.ammo.textContent = data.ammo;
    dom.ammo.classList.toggle('empty', data.ammo <= 0);
  }
  if (data.weaponName !== undefined) {
    dom.weaponName.textContent = data.weaponName;
  }
  if (data.reloading !== undefined) {
    dom.reloadHint.classList.toggle('hidden', !data.reloading);
  }

  // счёт и убийства
  if (data.score !== undefined) dom.score.textContent = data.score;
  if (data.kills !== undefined) dom.kills.textContent = `убийств: ${data.kills}`;

  // волна и враги
  if (data.wave !== undefined) dom.waveNumber.textContent = data.wave;
  if (data.enemiesLeft !== undefined) {
    dom.enemiesLeft.textContent = `врагов: ${data.enemiesLeft}`;
  }
}

let currentHp = 100;
let currentMaxHp = 100;

/* ============================================================
   ЦЕНТРАЛЬНЫЕ СООБЩЕНИЯ
   type: 'hit' | 'kill' | 'dmg' | 'info'
============================================================ */
let centerTimer = null;

export function showCenterMsg(text, type = 'info', duration = 700) {
  if (!dom.centerMsg) cacheDom();

  dom.centerMsg.textContent = text;
  dom.centerMsg.className = 'center-msg ' + type + ' show';

  if (centerTimer) clearTimeout(centerTimer);
  centerTimer = setTimeout(() => {
    dom.centerMsg.classList.remove('show');
  }, duration);
}

/* ============================================================
   ПРИВЯЗКА МЕНЮ
============================================================ */
export function bindMenu({ onDifficulty, onMap, onCharacter, onStart }) {
  if (!dom.menu) cacheDom();

  bindOptionGroup('difficulty-row', onDifficulty);
  bindOptionGroup('map-row',        onMap);
  bindOptionGroup('char-row',       onCharacter);

  dom.startBtn.addEventListener('click', () => {
    if (onStart) onStart();
  });
}

/* ============================================================
   ПРИВЯЗКА ПАУЗЫ
============================================================ */
export function bindPause({ onResume, onRestart, onMenu }) {
  if (!dom.pause) cacheDom();

  dom.resumeBtn.addEventListener('click',  () => onResume && onResume());
  dom.restartBtn.addEventListener('click', () => onRestart && onRestart());
  dom.menuBtn.addEventListener('click',    () => onMenu && onMenu());
}

/* ============================================================
   ПРИВЯЗКА ЭКРАНА СМЕРТИ
============================================================ */
export function bindDeath({ onRetry, onMenu }) {
  if (!dom.death) cacheDom();

  dom.retryBtn.addEventListener('click',    () => onRetry && onRetry());
  dom.deathMenuBtn.addEventListener('click', () => onMenu && onMenu());
}

/* ============================================================
   ХЕЛПЕР — группы опций (сложность/карта/персонаж)
============================================================ */
function bindOptionGroup(rowId, callback) {
  const row = document.getElementById(rowId);
  if (!row) return;

  const opts = row.querySelectorAll('.option');
  opts.forEach(opt => {
    opt.addEventListener('click', () => {
      // снять active со всех
      opts.forEach(o => o.classList.remove('active'));
      // поставить на кликнутом
      opt.classList.add('active');
      // вызвать колбэк
      const value = opt.dataset.value;
      if (value !== undefined && callback) callback(value);
    });
  });
}

/* ============================================================
   СЛУШАЕМ СОБЫТИЯ ИГРЫ (из player.js / enemies.js)
============================================================ */
document.addEventListener('vanta:ammo-changed', (ev) => {
  const { ammo, magSize } = ev.detail;
  updateHUD({ ammo });

  document.dispatchEvent(new CustomEvent('vanta:weapon-info', {
    detail: { ammo, magSize }
  }));
});

document.addEventListener('vanta:reload-start', (ev) => {
  updateHUD({ reloading: true });
  setTimeout(() => {
    updateHUD({ reloading: false });
  }, (ev.detail?.duration ?? 1.5) * 1000);
});

document.addEventListener('vanta:player-damaged', (ev) => {
  const { hp, maxHp, amount } = ev.detail;
  updateHUD({ hp, maxHp });
  showCenterMsg(`-${amount}`, 'dmg');
});

document.addEventListener('vanta:player-died', () => {
  hideHUD();
});

document.addEventListener('vanta:wave-start', (ev) => {
  const { wave } = ev.detail;
  showCenterMsg(`ВОЛНА ${wave}`, 'kill', 1400);
  updateHUD({ wave });
});

document.addEventListener('vanta:enemy-hit-player', (ev) => {
  // уже обработано через player-damaged, но можно добавить визуал
});

/* ============================================================
   АВТО-ИНИЦИАЛИЗАЦИЯ КЭША ПРИ ЗАГРУЗКЕ
============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cacheDom);
} else {
  cacheDom();
               }
