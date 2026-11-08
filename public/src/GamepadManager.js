/**
 * FleischiNeverSleeps - Xbox Controller & Gamepad Manager (v4)
 * - Fix: Single-Dispatch für [E] / A-Taste (verhindert sofortiges Wieder-Schließen des Laptops)
 * - Laptop / MitternachtTerminal Support (Button-Navigation + Virtueller Cursor + On-Screen Code-Pad)
 * - Deutlich höhere, direkte Umschau-Empfindlichkeit (Standard 5.0, bis 14.0 einstellbar)
 * - Standard: Linker Stick = Laufen (Spiel) & Navigieren (Menü/Laptop) | Rechter Stick = Umschauen
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'fleischi_gamepad_config_v4';

  const DEFAULT_CONFIG = {
    swapSticks: false,       // false = Links: Laufen | Rechts: Umschauen
    lookSensitivity: 5.0,    // Schnelle, direkte Standard-Empfindlichkeit (Skala 1.0 - 14.0)
    deadzone: 0.14,
    invertY: false,
    bindings: {
      interact: 0,           // A
      sprint: 4,             // LB
      jump: 3,               // Y
      crouch: 1,             // B
      flashlight: 2,         // X
      mainMenu: 9            // 3 Striche (Xbox Menu-Taste) -> Hauptmenü
    }
  };

  const BUTTON_NAMES = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'ANSICHT (2 QUADRATE)',
    9: 'MENÜ (3 STRICHE)',
    10: 'STICK LINKS (L3)',
    11: 'STICK RECHTS (R3)',
    12: 'STEUERKREUZ HOCH',
    13: 'STEUERKREUZ RUNTER',
    14: 'STEUERKREUZ LINKS',
    15: 'STEUERKREUZ RECHTS'
  };

  const ACTION_LABELS = {
    interact: 'Interagieren [E]',
    sprint: 'Sprinten [SHIFT]',
    crouch: 'Schleichen [CTRL]',
    jump: 'Springen [SPACE]',
    flashlight: 'Taschenlampe [F]',
    mainMenu: 'Hauptmenü (3 Striche)'
  };

  const ACTION_TO_KEY = {
    interact: { key: 'e', code: 'KeyE', keyCode: 69 },
    sprint: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
    crouch: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
    jump: { key: ' ', code: 'Space', keyCode: 32 },
    flashlight: { key: 'f', code: 'KeyF', keyCode: 70 }
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          bindings: { ...DEFAULT_CONFIG.bindings, ...(parsed.bindings || {}) }
        };
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {}
  }

  let config = loadConfig();
  let activeGamepadIndex = null;
  let rebindingAction = null;

  // --- THREE.JS CAMERA HOOK ---
  let trackedCamera = null;
  let cameraHooked = false;

  function ensureCameraHook() {
    const THREE = window.THREE;
    if (!THREE || cameraHooked) return;
    if (THREE.WebGLRenderer && THREE.WebGLRenderer.prototype) {
      const origRender = THREE.WebGLRenderer.prototype.render;
      THREE.WebGLRenderer.prototype.render = function (scene, camera) {
        if (camera && camera.isPerspectiveCamera) {
          trackedCamera = camera;
        }
        return origRender.apply(this, arguments);
      };
      cameraHooked = true;
    }
  }

  // --- HOVER-STYLING, VIRTUELLER CURSOR & EINSTELLUNGEN-CSS ---
  let stylesInjected = false;
  function injectGamepadStyles() {
    if (stylesInjected && document.getElementById('fns-gamepad-hover-styles')) return;

    let extraHoverCss = '';
    try {
      Array.from(document.styleSheets).forEach(sheet => {
        let rules;
        try {
          rules = sheet.cssRules || sheet.rules;
        } catch (e) {
          return;
        }
        if (!rules) return;
        Array.from(rules).forEach(rule => {
          if (rule.selectorText && rule.selectorText.includes(':hover')) {
            const mapped = rule.selectorText
              .split(',')
              .map(s => s.includes(':hover') ? s.replace(/:hover/g, '.fns-gp-hover') : null)
              .filter(Boolean)
              .join(', ');
            if (mapped) {
              extraHoverCss += `${mapped} { ${rule.style.cssText} }\n`;
            }
          }
        });
      });
    } catch (e) {}

    let styleEl = document.getElementById('fns-gamepad-hover-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'fns-gamepad-hover-styles';
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      ${extraHoverCss}
      .fns-gp-hover {
        border-color: #ffea00 !important;
        color: #ffea00 !important;
        box-shadow: 0 0 14px rgba(255, 234, 0, 0.45), inset 0 0 8px rgba(255, 234, 0, 0.2) !important;
        outline: 1px solid #ffea00 !important;
      }

      #fns-gp-status-pill {
        position: fixed;
        bottom: 14px;
        left: 14px;
        z-index: 99998;
        background: rgba(8, 8, 10, 0.94);
        border: 1px solid #9e2a1c;
        color: #ffea00;
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.74rem;
        letter-spacing: 0.08em;
        padding: 6px 12px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.25s ease;
        text-transform: uppercase;
      }
      #fns-gp-status-pill.show {
        opacity: 1;
      }

      /* Virtueller Controller-Cursor für Laptop / Terminal */
      #fns-gp-virtual-cursor {
        display: none;
        position: fixed;
        width: 18px;
        height: 18px;
        margin-left: -9px;
        margin-top: -9px;
        border: 2px solid #ffea00;
        background: rgba(255, 234, 0, 0.25);
        box-shadow: 0 0 10px rgba(255, 234, 0, 0.8);
        border-radius: 50%;
        pointer-events: none;
        z-index: 100000;
      }
      #fns-gp-virtual-cursor::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 4px;
        height: 4px;
        margin-left: -2px;
        margin-top: -2px;
        background: #ffffff;
        border-radius: 50%;
      }

      /* On-Screen Controller-Nummernblock für Laptop-Eingabefelder */
      #fns-gp-numpad {
        display: none;
        position: fixed;
        bottom: 18px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99995;
        background: rgba(8, 8, 12, 0.96);
        border: 1px solid #9e2a1c;
        box-shadow: 0 0 24px rgba(0, 0, 0, 0.9);
        padding: 8px 10px;
        font-family: 'Courier New', Courier, monospace;
      }
      .fns-gp-numpad-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
      }
      .fns-gp-key {
        background: rgba(20, 14, 14, 0.95);
        border: 1px solid #ca8a04;
        color: #ffea00;
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.85rem;
        font-weight: 700;
        padding: 6px 10px;
        cursor: pointer;
        text-align: center;
      }

      #fns-controller-settings-box {
        width: 100%;
        margin-top: 26px;
        box-sizing: border-box;
        font-family: 'Courier New', Courier, monospace;
        color: #ffffff;
        clear: both;
      }
      .fns-gp-section-header {
        color: #eab308;
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding-bottom: 6px;
        margin-bottom: 14px;
        border-bottom: 1px solid rgba(158, 42, 28, 0.45);
      }
      .fns-gp-slider-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        gap: 16px;
      }
      .fns-gp-slider-label {
        font-size: 0.92rem;
        color: #e5e5e5;
      }
      .fns-gp-range {
        -webkit-appearance: none;
        appearance: none;
        width: 44%;
        height: 6px;
        background: #444;
        border-radius: 4px;
        outline: none;
        accent-color: #eab308;
        cursor: pointer;
      }
      .fns-gp-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #eab308;
        cursor: pointer;
      }
      .fns-gp-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        width: 100%;
      }
      @media (max-width: 680px) {
        .fns-gp-grid {
          grid-template-columns: 1fr;
        }
      }
      .fns-gp-cell {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(14, 10, 10, 0.75);
        border: 1px solid rgba(158, 42, 28, 0.38);
        padding: 12px 14px;
        box-sizing: border-box;
      }
      .fns-gp-cell-label {
        font-size: 0.88rem;
        color: #e5e5e5;
      }
      .fns-gp-bind-btn {
        background: rgba(20, 14, 10, 0.95);
        border: 1px solid #ca8a04;
        color: #facc15;
        font-family: 'Courier New', Courier, monospace;
        font-size: 0.8rem;
        font-weight: 700;
        padding: 6px 12px;
        min-width: 110px;
        text-align: center;
        cursor: pointer;
        text-transform: uppercase;
      }
      .fns-gp-bind-btn:hover {
        border-color: #ffea00;
        box-shadow: 0 0 10px rgba(250, 204, 21, 0.35);
      }
      .fns-gp-bind-btn.listening {
        background: #9e2a1c !important;
        color: #ffffff !important;
        border-color: #ffea00 !important;
      }
    `;
    stylesInjected = true;
  }

  function showGamepadStatus(msg) {
    injectGamepadStyles();
    let pill = document.getElementById('fns-gp-status-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'fns-gp-status-pill';
      document.body.appendChild(pill);
    }
    pill.textContent = msg;
    pill.classList.add('show');
    clearTimeout(pill._t);
    pill._t = setTimeout(() => pill.classList.remove('show'), 3200);
  }

  window.addEventListener('gamepadconnected', e => {
    activeGamepadIndex = e.gamepad.index;
    showGamepadStatus('XBOX CONTROLLER VERBUNDEN');
  });

  window.addEventListener('gamepaddisconnected', e => {
    if (activeGamepadIndex === e.gamepad.index) {
      activeGamepadIndex = null;
      releaseAllVirtualKeys();
      showGamepadStatus('XBOX CONTROLLER GETRENNT');
    }
  });

  // --- SICHTBARKEITS- & LAPTOP/TERMINAL-ERKENNUNG ---
  function isElementVisible(el) {
    if (!el || !el.isConnected || el.disabled) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.05) return false;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ps = window.getComputedStyle(p);
      if (ps.display === 'none' || ps.visibility === 'hidden' || parseFloat(ps.opacity) < 0.05) return false;
      p = p.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < window.innerHeight;
  }

  // Erkennt, ob der Laptop / das Mitternacht-Terminal (oder ein anderes In-Game-Terminal/Puzzle-UI) gerade offen ist!
  function getActiveLaptopOrTerminalOverlay() {
    // 1. Prüfe ob eine bekannte Terminal-Instanz offen ist
    if (window.__fnsActiveTerminalInstance) {
      const inst = window.__fnsActiveTerminalInstance;
      if (inst.isOpen || inst.active || inst.visible || inst.isActive) {
        if (inst.container && isElementVisible(inst.container)) return inst.container;
        if (inst.overlay && isElementVisible(inst.overlay)) return inst.overlay;
        if (inst.element && isElementVisible(inst.element)) return inst.element;
      }
    }

    // 2. Suche im DOM nach sichtbaren Laptop-/Terminal-/Computer-/Code-Overlays
    const terminalSelectors = [
      '[id*="terminal" i]',
      '[class*="terminal" i]',
      '[id*="laptop" i]',
      '[class*="laptop" i]',
      '[id*="mitternacht" i]',
      '[class*="mitternacht" i]',
      '[id*="computer" i]',
      '[class*="computer" i]',
      '[id*="desktop" i]',
      '[class*="desktop" i]',
      '[id*="monitor" i]',
      '[class*="monitor" i]',
      '[id*="keypad" i]',
      '[class*="keypad" i]'
    ];
    const candidates = Array.from(document.querySelectorAll(terminalSelectors.join(','))).filter(el => {
      if (!isElementVisible(el)) return false;
      const r = el.getBoundingClientRect();
      // Muss ein echtes UI-Panel sein (nicht ein kleiner HUD-Hinweis)
      return r.width >= 160 && r.height >= 100;
    });
    if (candidates.length > 0) return candidates[0];

    // 3. Prüfe ob ein Text-/Zahlen-Inputfeld auf dem Bildschirm sichtbar ist (z.B. im Laptop-Terminal)
    const inputs = Array.from(document.querySelectorAll('input:not([type="range"]):not([type="checkbox"]):not([type="hidden"]), textarea')).filter(isElementVisible);
    if (inputs.length > 0) {
      return inputs[0].closest('div') || document.body;
    }

    return null;
  }

  function isTrueMenuScreenOpen() {
    if (getActiveLaptopOrTerminalOverlay()) return true;

    const stickerView = document.getElementById('fns-sticker-menu-view');
    if (stickerView && isElementVisible(stickerView)) return true;

    const ctrlSettings = document.getElementById('fns-controller-settings-box');
    if (ctrlSettings && isElementVisible(ctrlSettings)) return true;

    const buttons = Array.from(document.querySelectorAll('button, .menu-btn, .btn, [role="button"]')).filter(isElementVisible);
    let hasPlay = false;
    let hasLevels = false;
    let hasSettings = false;
    let hasBack = false;

    for (let i = 0; i < buttons.length; i++) {
      const t = (buttons[i].textContent || '').trim().toUpperCase();
      if (t === 'PLAY' || t === 'SPIELEN' || t === 'START') hasPlay = true;
      if (t === 'LEVELS' || t === 'LEVELAUSWAHL') hasLevels = true;
      if (t === 'EINSTELLUNGEN' || t === 'SETTINGS') hasSettings = true;
      if (t === 'ZURÜCK' || t === 'BACK' || t === 'SCHLIESSEN' || t === 'EXIT' || t === 'X') hasBack = true;
    }

    if ((hasPlay && (hasLevels || hasSettings)) || hasBack) {
      return true;
    }

    return false;
  }

  // --- ON-SCREEN CONTROLLER NUMPAD FÜR LAPTOP TEXT-/ZAHLENEINGABEN ---
  function ensureLaptopNumpad(laptopContainer) {
    let pad = document.getElementById('fns-gp-numpad');
    const visibleInput = Array.from(document.querySelectorAll('input:not([type="range"]):not([type="checkbox"]):not([type="hidden"]), textarea')).find(isElementVisible);

    if (!laptopContainer || !visibleInput) {
      if (pad) pad.style.display = 'none';
      return;
    }

    if (!pad) {
      pad = document.createElement('div');
      pad.id = 'fns-gp-numpad';
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', 'DEL', 'ENTER', 'ESC'];
      pad.innerHTML = `
        <div class="fns-gp-numpad-grid">
          ${keys.map(k => `<button type="button" class="fns-gp-key" data-gp-char="${k}">${k}</button>`).join('')}
        </div>
      `;
      document.body.appendChild(pad);

      pad.querySelectorAll('.fns-gp-key').forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const ch = btn.getAttribute('data-gp-char');
          const inp = Array.from(document.querySelectorAll('input:not([type="range"]):not([type="checkbox"]):not([type="hidden"]), textarea')).find(isElementVisible);
          if (ch === 'ESC') {
            triggerMenuBackButton();
            return;
          }
          if (ch === 'ENTER') {
            if (inp) {
              inp.focus();
              inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              const form = inp.closest('form');
              if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
            fireSingleKey('Enter', 'Enter', 13);
            return;
          }
          if (ch === 'DEL') {
            if (inp) {
              inp.value = inp.value.slice(0, -1);
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
            fireSingleKey('Backspace', 'Backspace', 8);
            return;
          }
          if (inp) {
            inp.value += ch;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          fireSingleKey(ch, `Digit${ch}`, ch.charCodeAt(0));
        });
      });
    }

    pad.style.display = 'block';
  }

  // --- VIRTUELLER CURSOR FÜR LAPTOP & MENÜS ---
  let vCursorX = window.innerWidth / 2;
  let vCursorY = window.innerHeight / 2;
  let vCursorActive = false;

  function updateVirtualCursor(stickX, stickY, dt, active) {
    let cursorEl = document.getElementById('fns-gp-virtual-cursor');
    if (!active) {
      if (cursorEl) cursorEl.style.display = 'none';
      vCursorActive = false;
      return;
    }

    if (!cursorEl) {
      injectGamepadStyles();
      cursorEl = document.createElement('div');
      cursorEl.id = 'fns-gp-virtual-cursor';
      document.body.appendChild(cursorEl);
    }

    const dz = 0.16;
    if (Math.hypot(stickX, stickY) >= dz) {
      vCursorActive = true;
      const speed = 520 * dt;
      vCursorX = Math.max(10, Math.min(window.innerWidth - 10, vCursorX + stickX * speed));
      vCursorY = Math.max(10, Math.min(window.innerHeight - 10, vCursorY + stickY * speed));

      cursorEl.style.display = 'block';
      cursorEl.style.left = `${vCursorX}px`;
      cursorEl.style.top = `${vCursorY}px`;

      // Element unter dem virtuellen Cursor automatisch mit Hover versehen
      const under = document.elementFromPoint(vCursorX, vCursorY);
      if (under) {
        const clickable = under.closest('button, input, a, [onclick], [role="button"], .menu-btn, .btn, .fns-gp-key, [class*="btn" i], [class*="key" i], [class*="tab" i], [class*="item" i]') || under;
        if (clickable && clickable !== document.body && clickable !== document.documentElement) {
          setMenuFocus(clickable);
        }
      }
    } else if (!vCursorActive) {
      cursorEl.style.display = 'none';
    }
  }

  function triggerReturnToMainMenu() {
    releaseAllVirtualKeys();

    const allBtns = Array.from(document.querySelectorAll('button, .menu-btn, .btn, a, div[role="button"]')).filter(isElementVisible);
    const mainMenuBtn = allBtns.find(b => {
      const t = (b.textContent || '').trim().toUpperCase();
      return t.includes('HAUPTMENÜ') || t === 'MENÜ' || t === 'MAIN MENU' || t === 'EXIT' || t === 'BEENDEN';
    });

    if (mainMenuBtn) {
      mainMenuBtn.click();
      setTimeout(() => ensureMenuFocus(), 150);
      return;
    }

    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) {}
    }
    fireSingleKey('Escape', 'Escape', 27);
  }

  // --- MENÜ- & LAPTOP-FOKUS NAVIGATION ---
  let focusedEl = null;

  function getFocusableMenuElements() {
    if (!isTrueMenuScreenOpen()) return [];

    const laptopOverlay = getActiveLaptopOrTerminalOverlay();
    const selectors = [
      'button',
      '.menu-btn',
      '.btn',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      'a[href]',
      '[onclick]',
      '[role="button"]',
      '.fns-sticker-card.gold-unlocked',
      '.fns-gp-bind-btn',
      '.fns-gp-key',
      '.level-card',
      '.level-item',
      '[class*="btn" i]',
      '[class*="button" i]',
      '[class*="key" i]',
      '[class*="tab" i]',
      '[class*="option" i]',
      '[class*="choice" i]',
      '[class*="file" i]',
      '[class*="app" i]'
    ];

    let list = Array.from(document.querySelectorAll(selectors.join(','))).filter(isElementVisible);

    // Falls der Laptop offen ist, auch anklickbare divs/spans/list-items im Laptop-Fenster mit aufnehmen!
    if (laptopOverlay) {
      const extra = Array.from(laptopOverlay.querySelectorAll('div, span, li, td')).filter(el => {
        if (!isElementVisible(el) || el.children.length > 2) return false;
        const cs = window.getComputedStyle(el);
        return cs.cursor === 'pointer' || el.getAttribute('onclick') || el.tabIndex >= 0;
      });
      extra.forEach(el => {
        if (!list.includes(el)) list.push(el);
      });
    }

    return list;
  }

  function setMenuFocus(el) {
    if (focusedEl && focusedEl !== el) {
      focusedEl.classList.remove('fns-gp-hover');
      try {
        focusedEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        focusedEl.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      } catch (e) {}
    }
    focusedEl = el;
    if (focusedEl) {
      injectGamepadStyles();
      focusedEl.classList.add('fns-gp-hover');
      try {
        focusedEl.focus({ preventScroll: true });
        focusedEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        focusedEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        focusedEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      } catch (e) {}
    }
  }

  function ensureMenuFocus() {
    const items = getFocusableMenuElements();
    if (items.length === 0) {
      if (focusedEl) setMenuFocus(null);
      return;
    }
    if (!focusedEl || !items.includes(focusedEl)) {
      const primary = items.find(el => !/^CAM\s*0/i.test((el.textContent || '').trim())) || items[0];
      setMenuFocus(primary);
    }
  }

  function navigateMenu(dirX, dirY) {
    // Sende zusätzlich Pfeiltasten-Events (falls das Laptop-Terminal intern mit ArrowUp/Down/Left/Right arbeitet)
    if (getActiveLaptopOrTerminalOverlay()) {
      if (dirY < 0) fireSingleKey('ArrowUp', 'ArrowUp', 38);
      if (dirY > 0) fireSingleKey('ArrowDown', 'ArrowDown', 40);
      if (dirX < 0) fireSingleKey('ArrowLeft', 'ArrowLeft', 37);
      if (dirX > 0) fireSingleKey('ArrowRight', 'ArrowRight', 39);
    }

    const items = getFocusableMenuElements();
    if (items.length === 0) return;

    if (!focusedEl || !items.includes(focusedEl)) {
      ensureMenuFocus();
      return;
    }

    if (focusedEl.tagName === 'INPUT' && focusedEl.type === 'range' && Math.abs(dirX) > 0.5) {
      const min = parseFloat(focusedEl.min) || 0;
      const max = parseFloat(focusedEl.max) || 100;
      const step = parseFloat(focusedEl.step) || (max - min) / 20;
      const cur = parseFloat(focusedEl.value) || 0;
      focusedEl.value = Math.max(min, Math.min(max, cur + Math.sign(dirX) * step));
      focusedEl.dispatchEvent(new Event('input', { bubbles: true }));
      focusedEl.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const curRect = focusedEl.getBoundingClientRect();
    const curX = curRect.left + curRect.width / 2;
    const curY = curRect.top + curRect.height / 2;

    let bestCandidate = null;
    let bestScore = Infinity;

    items.forEach(item => {
      if (item === focusedEl) return;
      const r = item.getBoundingClientRect();
      const ix = r.left + r.width / 2;
      const iy = r.top + r.height / 2;
      const dx = ix - curX;
      const dy = iy - curY;

      if (dirY > 0 && dy <= 5) return;
      if (dirY < 0 && dy >= -5) return;
      if (dirX > 0 && dx <= 5) return;
      if (dirX < 0 && dx >= -5) return;

      const primaryDist = Math.abs(dirY) > 0 ? Math.abs(dy) : Math.abs(dx);
      const orthoDist = Math.abs(dirY) > 0 ? Math.abs(dx) : Math.abs(dy);
      const score = primaryDist + orthoDist * 2.3;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = item;
      }
    });

    if (bestCandidate) {
      setMenuFocus(bestCandidate);
      const r = bestCandidate.getBoundingClientRect();
      vCursorX = r.left + r.width / 2;
      vCursorY = r.top + r.height / 2;
    }
  }

  function clickFocusedElement() {
    // Falls der virtuelle Cursor aktiv bewegt wurde, klicke das Element unter dem Cursor
    if (vCursorActive) {
      const under = document.elementFromPoint(vCursorX, vCursorY);
      if (under) {
        const clickable = under.closest('button, input, a, [onclick], [role="button"], .menu-btn, .btn, .fns-gp-key') || under;
        setMenuFocus(clickable);
      }
    }

    if (!focusedEl || !isElementVisible(focusedEl)) {
      ensureMenuFocus();
    }

    if (!focusedEl) {
      // Falls im Laptop keine Buttons existieren (reines Tastatur-Terminal) -> Enter senden!
      if (getActiveLaptopOrTerminalOverlay()) {
        fireSingleKey('Enter', 'Enter', 13);
      }
      return;
    }

    const target = focusedEl;
    if (target.tagName === 'INPUT' && target.type === 'checkbox') {
      target.checked = !target.checked;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      target.focus();
      fireSingleKey('Enter', 'Enter', 13);
      return;
    }

    try {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      target.click();
    } catch (e) {
      target.click();
    }

    setTimeout(() => {
      if (isTrueMenuScreenOpen()) {
        ensureMenuFocus();
      } else {
        setMenuFocus(null);
      }
    }, 120);
  }

  function triggerMenuBackButton() {
    const items = getFocusableMenuElements();
    const backBtn = items.find(el => {
      const t = (el.textContent || '').trim().toUpperCase();
      return t === 'ZURÜCK' || t === 'BACK' || t === 'SCHLIESSEN' || t === 'CLOSE' || t === 'X' || t === 'BEENDEN' || t === 'VERLASSEN';
    });
    if (backBtn) {
      setMenuFocus(backBtn);
      clickFocusedElement();
      return;
    }
    // Falls im Laptop kein sichtbarer Schließen-Button ist -> Escape feuern (und falls Terminal-Instanz existiert, close() rufen)
    fireSingleKey('Escape', 'Escape', 27);
    if (window.__fnsActiveTerminalInstance) {
      const inst = window.__fnsActiveTerminalInstance;
      if (typeof inst.close === 'function') inst.close();
      else if (typeof inst.hide === 'function') inst.hide();
      else if (typeof inst.deactivate === 'function') inst.deactivate();
    }
  }

  // --- SAUBERE SINGLE-DISPATCH TASTATUR-EVENTS (KEIN 3X BUBBLING MEHR!) ---
  const virtualKeyState = {};

  function fireSingleKey(key, code, keyCode) {
    const target = document.activeElement || document.body || document;
    const down = new KeyboardEvent('keydown', { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true });
    const up = new KeyboardEvent('keyup', { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true });
    target.dispatchEvent(down);
    target.dispatchEvent(up);
  }

  function setVirtualKey(code, key, keyCode, pressed) {
    if (!!virtualKeyState[code] === pressed) return;
    virtualKeyState[code] = pressed;

    const type = pressed ? 'keydown' : 'keyup';
    const ev = new KeyboardEvent(type, {
      key: key,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    });

    // WICHTIG: Nur 1x auf document.body (bzw. activeElement) dispatchen!
    // Durch bubbles:true wandert das Event von dort exakt 1x zu document und 1x zu window!
    const target = document.activeElement || document.body || document;
    target.dispatchEvent(ev);
  }

  function releaseAllVirtualKeys() {
    Object.keys(virtualKeyState).forEach(code => {
      if (virtualKeyState[code]) {
        setVirtualKey(code, '', 0, false);
      }
    });
  }

  // --- SCHNELLES, DIREKTES UMSCHAUEN (MIT ANGEHOBENER EMPFINDLICHKEIT) ---
  let lookAccumX = 0;
  let lookAccumY = 0;

  function applyControllerLook(lookX, lookY, dt) {
    ensureCameraHook();
    const dz = config.deadzone;
    if (Math.hypot(lookX, lookY) < dz) {
      lookAccumX = 0;
      lookAccumY = 0;
      return;
    }

    // Direktere Reaktionskurve (1.35 statt 1.85) für schnelle Kamera-Drehungen
    const normX = Math.abs(lookX) < dz ? 0 : Math.sign(lookX) * Math.pow((Math.abs(lookX) - dz) / (1 - dz), 1.35);
    const normY = Math.abs(lookY) < dz ? 0 : Math.sign(lookY) * Math.pow((Math.abs(lookY) - dz) / (1 - dz), 1.35);

    // Deutlich höhere Geschwindigkeit: bei Standard 5.0 ca. 24 Pixel/Frame (~170 Grad/Sekunde)
    const pixelSpeed = config.lookSensitivity * 4.8 * (dt * 60);
    lookAccumX += normX * pixelSpeed;
    lookAccumY += (config.invertY ? -normY : normY) * pixelSpeed;

    const intX = Math.trunc(lookAccumX);
    const intY = Math.trunc(lookAccumY);

    const prevRotY = trackedCamera ? trackedCamera.rotation.y : 0;
    const prevRotX = trackedCamera ? trackedCamera.rotation.x : 0;

    if (intX !== 0 || intY !== 0) {
      lookAccumX -= intX;
      lookAccumY -= intY;

      const ev = new MouseEvent('mousemove', {
        movementX: intX,
        movementY: intY,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(ev);
    }

    // Kamera-Fallback falls MouseMove vom Spiel ohne Maus-PointerLock ignoriert wird:
    if (trackedCamera) {
      const movedByEvent = Math.abs(trackedCamera.rotation.y - prevRotY) > 0.00001 ||
                           Math.abs(trackedCamera.rotation.x - prevRotX) > 0.00001;
      if (!movedByEvent) {
        trackedCamera.rotation.order = 'YXZ';
        const radSpeed = config.lookSensitivity * 0.65 * dt;
        trackedCamera.rotation.y -= normX * radSpeed;
        trackedCamera.rotation.x = Math.max(
          -Math.PI * 0.47,
          Math.min(Math.PI * 0.47, trackedCamera.rotation.x - (config.invertY ? -normY : normY) * radSpeed)
        );
      }
    }
  }

  // --- EINSTELLUNGEN-MENÜ ---
  function injectControllerSettingsUI() {
    injectGamepadStyles();

    const allElements = Array.from(document.querySelectorAll('div, h2, h3, h4, p, span'));
    const steuerungTitle = allElements.find(el => {
      return el.children.length === 0 && (el.textContent || '').trim().toUpperCase() === 'STEUERUNG';
    });

    if (!steuerungTitle || !steuerungTitle.parentElement) return;
    const settingsBody = steuerungTitle.parentElement;

    let box = document.getElementById('fns-controller-settings-box');
    if (box && box.parentElement !== settingsBody) {
      box.remove();
      box = null;
    }
    if (box) return;

    box = document.createElement('div');
    box.id = 'fns-controller-settings-box';
    settingsBody.appendChild(box);
    renderControllerSettingsBox();
  }

  function renderControllerSettingsBox() {
    const box = document.getElementById('fns-controller-settings-box');
    if (!box) return;

    const stickModeLabel = config.swapSticks
      ? 'LINKS: UMSCHAUEN | RECHTS: LAUFEN'
      : 'LINKS: LAUFEN | RECHTS: UMSCHAUEN';

    let html = `
      <div class="fns-gp-section-header">XBOX CONTROLLER</div>
      <div class="fns-gp-slider-row">
        <span class="fns-gp-slider-label">Controller-Empfindlichkeit (${config.lookSensitivity.toFixed(1)})</span>
        <input type="range" class="fns-gp-range" id="fns-gp-sens-slider" min="1.0" max="14.0" step="0.5" value="${config.lookSensitivity}" />
      </div>
      <div class="fns-gp-grid">
        <div class="fns-gp-cell">
          <span class="fns-gp-cell-label">Stick-Belegung</span>
          <button type="button" class="fns-gp-bind-btn" id="fns-gp-toggle-sticks">${stickModeLabel}</button>
        </div>
        <div class="fns-gp-cell">
          <span class="fns-gp-cell-label">Standardwerte</span>
          <button type="button" class="fns-gp-bind-btn" id="fns-gp-reset-binds">ZURÜCKSETZEN</button>
        </div>
    `;

    Object.keys(ACTION_LABELS).forEach(actionKey => {
      const btnIdx = config.bindings[actionKey];
      const isListening = rebindingAction === actionKey;
      const btnText = isListening
        ? 'TASTE DRÜCKEN...'
        : (BUTTON_NAMES[btnIdx] || `TASTE ${btnIdx}`);
      html += `
        <div class="fns-gp-cell">
          <span class="fns-gp-cell-label">${ACTION_LABELS[actionKey]}</span>
          <button type="button" class="fns-gp-bind-btn ${isListening ? 'listening' : ''}" data-gp-action="${actionKey}">${btnText}</button>
        </div>
      `;
    });

    html += `</div>`;
    box.innerHTML = html;

    const sensSlider = box.querySelector('#fns-gp-sens-slider');
    if (sensSlider) {
      sensSlider.addEventListener('input', e => {
        config.lookSensitivity = parseFloat(e.target.value) || 5.0;
        saveConfig();
        const lbl = box.querySelector('.fns-gp-slider-label');
        if (lbl) lbl.textContent = `Controller-Empfindlichkeit (${config.lookSensitivity.toFixed(1)})`;
      });
    }

    const stickBtn = box.querySelector('#fns-gp-toggle-sticks');
    if (stickBtn) {
      stickBtn.addEventListener('click', e => {
        e.preventDefault();
        config.swapSticks = !config.swapSticks;
        saveConfig();
        renderControllerSettingsBox();
      });
    }

    const resetBtn = box.querySelector('#fns-gp-reset-binds');
    if (resetBtn) {
      resetBtn.addEventListener('click', e => {
        e.preventDefault();
        config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        rebindingAction = null;
        saveConfig();
        renderControllerSettingsBox();
      });
    }

    box.querySelectorAll('[data-gp-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.getAttribute('data-gp-action');
        rebindingAction = (rebindingAction === act) ? null : act;
        renderControllerSettingsBox();
      });
    });
  }

  // --- HAUPTSCHLEIFE FÜR GAMEPAD-EINGABEN ---
  let prevButtons = {};
  let lastMenuNavTime = 0;
  let lastFrameTime = performance.now();

  function pollGamepad() {
    requestAnimationFrame(pollGamepad);

    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    injectControllerSettingsUI();

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    if (activeGamepadIndex !== null && gamepads[activeGamepadIndex]) {
      gp = gamepads[activeGamepadIndex];
    } else {
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) {
          gp = gamepads[i];
          activeGamepadIndex = i;
          break;
        }
      }
    }

    if (!gp) return;

    if (rebindingAction) {
      for (let b = 0; b < gp.buttons.length; b++) {
        const isPressed = gp.buttons[b] && gp.buttons[b].pressed;
        if (isPressed && !prevButtons[b]) {
          config.bindings[rebindingAction] = b;
          rebindingAction = null;
          saveConfig();
          renderControllerSettingsBox();
          showGamepadStatus(`BELEGT AUF: ${BUTTON_NAMES[b] || 'TASTE ' + b}`);
          break;
        }
      }
      for (let b = 0; b < gp.buttons.length; b++) {
        prevButtons[b] = !!(gp.buttons[b] && gp.buttons[b].pressed);
      }
      return;
    }

    const laptopOverlay = getActiveLaptopOrTerminalOverlay();
    const menuOpen = isTrueMenuScreenOpen();

    ensureLaptopNumpad(laptopOverlay);

    const leftX = gp.axes[0] || 0;
    const leftY = gp.axes[1] || 0;
    const rightX = gp.axes[2] || 0;
    const rightY = gp.axes[3] || 0;

    const moveStickX = config.swapSticks ? rightX : leftX;
    const moveStickY = config.swapSticks ? rightY : leftY;
    const lookStickX = config.swapSticks ? leftX : rightX;
    const lookStickY = config.swapSticks ? leftY : rightY;

    if (menuOpen) {
      // --- IM MENÜ ODER LAPTOP-TERMINAL ---
      releaseAllVirtualKeys();
      ensureMenuFocus();

      // Rechter Stick bewegt im Laptop/Menü zusätzlich den virtuellen Cursor
      updateVirtualCursor(rightX, rightY, dt, true);

      let navX = 0;
      let navY = 0;
      if (Math.abs(leftX) > 0.52) navX = Math.sign(leftX);
      if (Math.abs(leftY) > 0.52) navY = Math.sign(leftY);

      if (gp.buttons[12] && gp.buttons[12].pressed) navY = -1;
      if (gp.buttons[13] && gp.buttons[13].pressed) navY = 1;
      if (gp.buttons[14] && gp.buttons[14].pressed) navX = -1;
      if (gp.buttons[15] && gp.buttons[15].pressed) navX = 1;

      if ((navX !== 0 || navY !== 0) && now - lastMenuNavTime > 185) {
        lastMenuNavTime = now;
        vCursorActive = false;
        navigateMenu(navX, navY);
      } else if (navX === 0 && navY === 0) {
        lastMenuNavTime = 0;
      }

      const clickBtnIdx = config.bindings.interact;
      if (gp.buttons[clickBtnIdx] && gp.buttons[clickBtnIdx].pressed && !prevButtons[clickBtnIdx]) {
        clickFocusedElement();
      }

      // B-Taste = Zurück / Laptop schließen
      if (gp.buttons[1] && gp.buttons[1].pressed && !prevButtons[1] && clickBtnIdx !== 1) {
        triggerMenuBackButton();
      }

      // X-Taste im Laptop = Backspace (Zeichen löschen)
      if (laptopOverlay && gp.buttons[2] && gp.buttons[2].pressed && !prevButtons[2]) {
        const inp = Array.from(document.querySelectorAll('input:not([type="range"]):not([type="checkbox"]):not([type="hidden"]), textarea')).find(isElementVisible);
        if (inp) {
          inp.value = inp.value.slice(0, -1);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        fireSingleKey('Backspace', 'Backspace', 8);
      }
    } else {
      // --- IM SPIEL (GAMEPLAY) ---
      updateVirtualCursor(0, 0, dt, false);
      if (focusedEl) setMenuFocus(null);

      // 1) 3-Striche-Taste (Button 9) -> Hauptmenü
      const menuBtnIdx = config.bindings.mainMenu ?? 9;
      if (gp.buttons[menuBtnIdx] && gp.buttons[menuBtnIdx].pressed && !prevButtons[menuBtnIdx]) {
        triggerReturnToMainMenu();
        for (let b = 0; b < gp.buttons.length; b++) {
          prevButtons[b] = !!(gp.buttons[b] && gp.buttons[b].pressed);
        }
        return;
      }

      // 2) Rechter Stick: Umschauen
      applyControllerLook(lookStickX, lookStickY, dt);

      // 3) Linker Stick: Laufen (exakt WASD)
      const moveThreshold = 0.25;
      setVirtualKey('KeyW', 'w', 87, moveStickY < -moveThreshold);
      setVirtualKey('KeyS', 's', 83, moveStickY > moveThreshold);
      setVirtualKey('KeyA', 'a', 65, moveStickX < -moveThreshold);
      setVirtualKey('KeyD', 'd', 68, moveStickX > moveThreshold);

      // 4) Aktions-Tasten (Single-Dispatch ohne Doppel-Toggling!)
      Object.keys(ACTION_TO_KEY).forEach(actionKey => {
        const btnIdx = config.bindings[actionKey];
        const keyInfo = ACTION_TO_KEY[actionKey];
        const pressed = !!(gp.buttons[btnIdx] && gp.buttons[btnIdx].pressed);

        setVirtualKey(keyInfo.code, keyInfo.key, keyInfo.keyCode, pressed);
      });
    }

    for (let b = 0; b < gp.buttons.length; b++) {
      prevButtons[b] = !!(gp.buttons[b] && gp.buttons[b].pressed);
    }
  }

  requestAnimationFrame(pollGamepad);

  window.GamepadManager = {
    getConfig: () => config,
    resetConfig: () => {
      config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      saveConfig();
      renderControllerSettingsBox();
    }
  };
})();
