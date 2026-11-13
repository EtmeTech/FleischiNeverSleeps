/**
 * FleischiNeverSleeps - Mobile UI, 60FPS Controller & Formula Touchpad
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  let isMobile = false;
  if (params.get('desktop') === '1') {
    isMobile = false;
  } else if (params.get('mobile') === '1') {
    isMobile = true;
  } else {
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
    const isIPadOS = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isCoarseTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
    isMobile = !!(isMobileUA || isIPadOS || isCoarseTouch);
  }

  window.__fnsIsMobile = isMobile;
  if (!isMobile) return;


  window.__fnsIsMobileOnly = true;
  let trackedCamera = null;

  function isMenuOverlayVisible() {
    const ids = ['main-menu-overlay', 'desktop-overlay', 'modal-settings', 'fns-sticker-menu-view'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        const s = window.getComputedStyle(el);
        if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05) return true;
      }
    }
    return false;
  }

  // Pointer lock mock
  try {
    Object.defineProperty(document, 'pointerLockElement', {
      get: () => isMenuOverlayVisible() ? null : (document.body || document.documentElement),
      configurable: true
    });
    Element.prototype.requestPointerLock = () => document.dispatchEvent(new Event('pointerlockchange'));
    Document.prototype.exitPointerLock = () => document.dispatchEvent(new Event('pointerlockchange'));
  } catch (e) {}

  // 60 FPS Mobile-Only GPU, Emissive-Visibility & Lighting Optimizer (Desktop bleibt 100% unberührt!)
  let threeHooked = false;
  let mobileAmbientLight = null;
  let mobileHemiLight = null;
  let mobileDirLight = null;
  let mobilePlayerTorch = null;
  let lastMobileCullTime = 0;

  function boostMaterialForMobile(m) {
    if (!m || m.__fnsMobMatOpt) return;
    m.__fnsMobMatOpt = true;

    if (m.bumpMap) {
      m.bumpMap = null;
    }
    if (typeof m.metalness === 'number') {
      m.metalness = 0.0;
    }
    if (typeof m.roughness === 'number') {
      m.roughness = 0.85;
    }

    // 1. Wenn das Material eine Textur hat (Kisten, Flöße, Baumstämme, Bücherregale, Spinde, Böden, Wände, Turnkästen):
    //    Nutze die Textur gleichzeitig als selbstleuchtende Emissive-Map, damit Kisten & Regale auf Mobile
    //    NIEMALS im Dunkeln absaufen, sondern ihre volle Textur klar erkennbar zeigen!
    if (m.map && m.emissive) {
      m.emissiveMap = m.map;
      m.emissive.setRGB(0.68, 0.64, 0.58);
      m.emissiveIntensity = 1.0;
      if (m.color) {
        m.color.setRGB(
          Math.max(0.85, m.color.r),
          Math.max(0.85, m.color.g),
          Math.max(0.85, m.color.b)
        );
      }
    } else if (m.emissive && m.color) {
      // 2. Einfarbige Materialien ohne Textur (Laufstege im Heizungskeller, Spind-Rahmen, Rohre, Boss-Halle):
      const lum = m.color.r * 0.3 + m.color.g * 0.59 + m.color.b * 0.11;
      if (lum > 0.005 && (!m.transparent || m.opacity > 0.95)) {
        m.color.multiplyScalar(1.85);
        m.emissive.copy(m.color).multiplyScalar(0.45);
        m.emissiveIntensity = 1.0;
      }
    }
    m.needsUpdate = true;
  }

  function optimizeObjectForMobile(obj) {
    if (!obj) return;
    const traverseFn = obj.traverse ? obj.traverse.bind(obj) : (cb => cb(obj));
    traverseFn(node => {
      if (!node) return;

      if ((node.isPointLight || node.isSpotLight) && !node.__fnsAllowedLight) {
        node.castShadow = false;
        node.visible = false;
        node.intensity = 0;
        node.isLight = false;
      }

      if (node.isMesh) {
        node.castShadow = false;
        node.receiveShadow = false;
        const mats = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
        for (let i = 0; i < mats.length; i++) {
          boostMaterialForMobile(mats[i]);
        }
      }
    });
  }

  function hookThreeForMobile() {
    const THREE = window.THREE;
    if (!THREE || threeHooked) return;
    threeHooked = true;

    if (THREE.Object3D && THREE.Object3D.prototype && !THREE.Object3D.prototype.__fnsMobAddHooked) {
      THREE.Object3D.prototype.__fnsMobAddHooked = true;
      const origAdd = THREE.Object3D.prototype.add;
      THREE.Object3D.prototype.add = function () {
        const res = origAdd.apply(this, arguments);
        for (let i = 0; i < arguments.length; i++) {
          optimizeObjectForMobile(arguments[i]);
        }
        return res;
      };
    }

    if (THREE.WebGLRenderer && THREE.WebGLRenderer.prototype) {
      const origSetSize = THREE.WebGLRenderer.prototype.setSize;
      THREE.WebGLRenderer.prototype.setSize = function (w, h, updateStyle) {
        origSetSize.call(this, w, h, updateStyle);
        this.setPixelRatio(Math.min(window.devicePixelRatio || 1.0, 0.75));
      };

      const origRender = THREE.WebGLRenderer.prototype.render;
      THREE.WebGLRenderer.prototype.render = function (scene, camera) {
        if (!this.__fnsMobileInit) {
          this.__fnsMobileInit = true;
          this.shadowMap.enabled = false;
          this.shadowMap.autoUpdate = false;
          this.toneMapping = THREE.NoToneMapping;
          this.setPixelRatio(Math.min(window.devicePixelRatio || 1.0, 0.75));
          if (this.domElement && this.domElement.style) {
            this.domElement.style.filter = 'brightness(1.32) contrast(1.06)';
          }
        }
        if (camera && camera.isPerspectiveCamera) trackedCamera = camera;

        if (scene && scene.isScene) {
          if (!scene.__fnsMobileOptimized) {
            scene.__fnsMobileOptimized = true;
            mobileAmbientLight = new THREE.AmbientLight(0xffffff, 2.6);
            mobileAmbientLight.__fnsAllowedLight = true;
            mobileHemiLight = new THREE.HemisphereLight(0xffffff, 0x776655, 2.8);
            mobileHemiLight.__fnsAllowedLight = true;
            mobileDirLight = new THREE.DirectionalLight(0xfff6ea, 1.5);
            mobileDirLight.position.set(5, 14, 7);
            mobileDirLight.__fnsAllowedLight = true;
            mobilePlayerTorch = new THREE.PointLight(0xffeedd, 4.2, 45.0, 0.45);
            mobilePlayerTorch.__fnsAllowedLight = true;
            scene.add(mobileAmbientLight, mobileHemiLight, mobileDirLight, mobilePlayerTorch);
            optimizeObjectForMobile(scene);
          }

          if (mobileAmbientLight) {
            mobileAmbientLight.visible = true;
            if (mobileAmbientLight.parent !== scene) scene.add(mobileAmbientLight);
          }
          if (mobileHemiLight) {
            mobileHemiLight.visible = true;
            if (mobileHemiLight.parent !== scene) scene.add(mobileHemiLight);
          }
          if (mobileDirLight) {
            mobileDirLight.visible = true;
            if (mobileDirLight.parent !== scene) scene.add(mobileDirLight);
          }
          if (mobilePlayerTorch && camera) {
            mobilePlayerTorch.visible = true;
            if (mobilePlayerTorch.parent !== scene) scene.add(mobilePlayerTorch);
            mobilePlayerTorch.position.set(camera.position.x, camera.position.y + 0.3, camera.position.z);
          }

          // Auf Mobile den schwarzen Nebel stark reduzieren (0.012 statt 0.068),
          // damit Bibliothek, Heizungskeller, Schulflur und Boss-Sporthalle weit & klar erkennbar sind!
          if (scene.fog && typeof scene.fog.density === 'number' && scene.fog.density > 0.012) {
            scene.fog.density = 0.012;
          }

          const now = performance.now();
          if (now - lastMobileCullTime > 120 && camera) {
            lastMobileCullTime = now;
            // Sicherheitshalber nachgeladenes Level-Material (z.B. Bossfight / Kisten) ebenfalls aufhellen
            optimizeObjectForMobile(scene);

            const bridge = window.__fnsGameBridge;
            const stage = bridge && bridge.getStage ? bridge.getStage() : '';
            const cx = camera.position.x;
            const cy = camera.position.y;
            const cz = camera.position.z;

            if (stage === 'labyrinth') {
              const lab = bridge.getLabyrinth && bridge.getLabyrinth();
              if (lab && lab.group) {
                if (!lab.__fnsMobMinimapThrottled && typeof lab.drawMinimap === 'function') {
                  lab.__fnsMobMinimapThrottled = true;
                  const origDraw = lab.drawMinimap.bind(lab);
                  let lastMapT = 0;
                  lab.drawMinimap = function (fk) {
                    const t = performance.now();
                    if (t - lastMapT < 130) return;
                    lastMapT = t;
                    origDraw(fk);
                  };
                }
                const children = lab.group.children;
                for (let i = 0; i < children.length; i++) {
                  const ch = children[i];
                  if (!ch || ch.isLight) continue;
                  if (ch.geometry && ch.geometry.parameters && ch.geometry.parameters.width > 30) continue;
                  const dy = Math.abs(ch.position.y - (cy - 0.5));
                  const dSq = (ch.position.x - cx) * (ch.position.x - cx) + (ch.position.z - cz) * (ch.position.z - cz);
                  ch.visible = (dy < 3.8 && dSq < 1600);
                }
              }
            } else if (stage === 'library') {
              const lib = bridge.getLibrary && bridge.getLibrary();
              if (lib && lib.group) {
                if (!lib.__fnsMobMinimapThrottled && typeof lib.drawMinimap === 'function') {
                  lib.__fnsMobMinimapThrottled = true;
                  const origDraw = lib.drawMinimap.bind(lib);
                  let lastMapT = 0;
                  lib.drawMinimap = function () {
                    const t = performance.now();
                    if (t - lastMapT < 130) return;
                    lastMapT = t;
                    origDraw();
                  };
                }
                const children = lib.group.children;
                for (let i = 0; i < children.length; i++) {
                  const ch = children[i];
                  if (!ch || ch.isLight) continue;
                  if (ch.geometry && ch.geometry.parameters && ch.geometry.parameters.width > 20) continue;
                  const dSq = (ch.position.x - cx) * (ch.position.x - cx) + (ch.position.z - cz) * (ch.position.z - cz);
                  ch.visible = (dSq < 1444);
                }
              }
            } else if (stage === 'boiler') {
              const boiler = bridge.getBoiler && bridge.getBoiler();
              if (boiler && boiler.group) {
                const children = boiler.group.children;
                for (let i = 0; i < children.length; i++) {
                  const ch = children[i];
                  if (!ch || ch.isLight) continue;
                  if (ch.geometry && ch.geometry.parameters && (ch.geometry.parameters.height > 40 || ch.geometry.parameters.depth > 40)) continue;
                  ch.visible = Math.abs(ch.position.z - cz) < 42.0;
                }
              }
            }
          }
        }
        return origRender.apply(this, arguments);
      };
    }
  }

  // Key event helpers
  const keyState = {};
  function fireKey(code, key, keyCode, pressed) {
    if (!!keyState[code] === pressed) return;
    keyState[code] = pressed;
    const ev = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
      key, code, keyCode, which: keyCode, bubbles: true, cancelable: true
    });
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
  }

  function tapKey(code, key, keyCode) {
    fireKey(code, key, keyCode, true);
    setTimeout(() => fireKey(code, key, keyCode, false), 60);
  }

  function sanitizePrompt() {
    const prompt = document.getElementById('interaction-prompt');
    if (!prompt) return;
    if (prompt.innerText && prompt.innerText.includes('[E]')) {
      prompt.innerText = prompt.innerText.replace(/\[E\]\s*/gi, '').trim();
    }
  }

  function buildMobileUI() {
    if (document.getElementById('fns-mobile-ui')) return;

    const style = document.createElement('style');
    style.textContent = `
      * { -webkit-tap-highlight-color: transparent; touch-action: none; user-select: none; -webkit-user-select: none; }
      #fns-controller-settings-box, #fns-gp-status-pill { display: none !important; }

      /* Hauptmenü button ONLY visible in-game, NEVER in main menu */
      #ingame-menu-btn {
        display: none !important;
      }
      body.in-game #ingame-menu-btn {
        display: flex !important;
        top: 8px !important;
        right: 12px !important;
        padding: 0 12px !important;
        font-size: 12px !important;
        height: 32px !important;
        align-items: center !important;
        z-index: 9998 !important;
      }

      /* Hide middle furz box */
      #milan-furz-hud, #milan-furz-container, #milan-furz-box, [id*="furz" i]:not(.fns-mobile-el), [class*="furz" i]:not(.fns-mobile-el) {
        display: none !important;
        visibility: hidden !important;
      }

      /* In-game interaction prompt */
      #interaction-prompt {
        position: fixed !important;
        top: 55% !important;
        left: 50% !important;
        bottom: auto !important;
        transform: translateX(-50%) !important;
        font-size: 13px !important;
        padding: 6px 14px !important;
        letter-spacing: 1px !important;
        background: rgba(10, 5, 5, 0.92) !important;
        border: 1.5px solid #ffaa00 !important;
        box-shadow: 0 4px 14px rgba(0,0,0,0.85) !important;
        white-space: nowrap !important;
        max-width: 72vw !important;
        z-index: 150 !important;
      }

      /* Home menu layout */
      #menu-title-block {
        top: 8px !important;
        left: 16px !important;
        max-width: 44vw !important;
        z-index: 20 !important;
      }
      #menu-game-title {
        font-size: clamp(16px, 2.6vw, 24px) !important;
        letter-spacing: 2px !important;
        line-height: 1.1 !important;
        margin: 0 !important;
        white-space: nowrap !important;
      }
      #menu-dynamic-subtitle {
        font-size: clamp(9px, 1.4vw, 12px) !important;
        letter-spacing: 0.8px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 42vw !important;
      }
      body.fns-hide-subtitle #menu-dynamic-subtitle,
      body.fns-hide-menu-title #menu-title-block {
        display: none !important;
      }

      #cctv-cam-buttons {
        top: 8px !important;
        right: 56px !important;
        display: flex !important;
        gap: 4px !important;
        z-index: 25 !important;
      }
      .cctv-switch-btn {
        padding: 5px 8px !important;
        font-size: 11px !important;
        font-weight: bold !important;
        min-height: 28px !important;
        border: 1.5px solid #2d443a !important;
      }
      #fns-btn-fullscreen {
        position: fixed; top: 8px; right: 14px; z-index: 9999;
        height: 28px; width: 34px; padding: 0; pointer-events: auto;
        background: rgba(14, 5, 5, 0.9); border: 1.5px solid #992211;
        color: #ffea00; font-family: monospace; font-size: 16px; font-weight: bold;
        display: flex; align-items: center; justify-content: center;
        border-radius: 0; cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.85);
      }
      body.in-game #fns-btn-fullscreen {
        right: 120px !important;
      }

      /* Main menu buttons: NO !important on display so submenus hide them cleanly */
      #menu-bottom-left {
        bottom: 38px !important;
        left: 16px !important;
        z-index: 20 !important;
      }
      #menu-main-buttons {
        width: clamp(170px, 22vw, 220px);
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .horror-menu-btn {
        padding: 9px 14px !important;
        font-size: 15px !important;
        min-height: 38px !important;
        border: 2px solid #992211 !important;
        background: rgba(14, 5, 5, 0.9) !important;
        color: #ffea00 !important;
      }

      #secret-fleischi-dossier {
        bottom: 38px !important;
        right: 16px !important;
        width: 88px !important;
        padding: 5px !important;
        z-index: 20 !important;
      }
      #secret-fleischi-photo {
        width: 88px !important;
        height: 88px !important;
        margin: 0 auto 3px auto !important;
      }
      #secret-fleischi-label {
        font-size: 9px !important;
      }

      /* Levels & Difficulty menus */
      #menu-levels-inline {
        max-width: 82vw !important;
        max-height: 72vh !important;
      }
      #btn-levels-back {
        width: 130px !important;
        min-height: 32px !important;
        font-size: 14px !important;
        padding: 6px 12px !important;
        margin-bottom: 6px !important;
      }
      #levels-inline-grid {
        grid-template-columns: repeat(3, minmax(130px, 180px)) !important;
        gap: 6px !important;
        max-height: 54vh !important;
        overflow-y: auto !important;
      }
      .level-inline-btn {
        padding: 8px 6px !important;
        font-size: 12px !important;
        min-height: 40px !important;
      }

      /* Settings Modal */
      .menu-modal-backdrop { z-index: 850 !important; }
      .menu-modal-box {
        width: 88vw !important;
        max-width: 580px !important;
        max-height: 78vh !important;
        padding: 14px 18px !important;
        overflow-y: auto !important;
      }

      /* Sticker Archive */
      #fns-sticker-menu-view {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(6, 4, 4, 0.96) !important;
        padding: 12px 18px !important;
        z-index: 880 !important;
        overflow-y: auto !important;
      }
      .fns-sticker-grid {
        grid-template-columns: repeat(4, 1fr) !important;
        grid-template-rows: repeat(2, 125px) !important;
        gap: 6px !important;
      }
      .fns-sticker-card { height: 125px !important; padding: 4px !important; }
      .fns-sticker-img-wrap { width: 75px !important; height: 75px !important; margin: 0 auto !important; }
      .fns-sticker-img-wrap img { width: 72px !important; height: 72px !important; }

      /* In-game UI & Controls */
      #fns-mobile-ui {
        position: fixed; inset: 0; pointer-events: none; z-index: 9990;
        font-family: 'Courier New', Courier, monospace;
      }
      .fns-horror-btn {
        pointer-events: auto;
        background: rgba(14, 5, 5, 0.92);
        border: 2px solid #992211;
        color: #ffea00;
        font-family: 'Courier New', Courier, monospace;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        border-radius: 0;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 14px rgba(0,0,0,0.85);
      }
      .fns-horror-btn:active {
        background: rgba(130, 15, 10, 0.95);
        border-color: #ffaa00;
        color: #ffffff;
      }

      #fns-right-controls {
        position: fixed; bottom: 158px; right: 18px; width: 136px;
        display: flex; flex-direction: column; gap: 6px;
        pointer-events: none; z-index: 9995;
      }
      #fns-btn-furz {
        display: none !important;
        width: 100%; height: 38px; font-size: 15px;
        position: relative; overflow: hidden;
      }
      #fns-btn-furz.fns-show-furz { display: flex !important; }
      #fns-furz-bar {
        position: absolute; bottom: 0; left: 0; width: 100%; height: 3px;
        background: #ffea00; transition: width 0.1s linear;
      }
      .fns-btn-row { display: flex; gap: 6px; width: 100%; }
      #fns-btn-use, #fns-btn-jump { flex: 1; height: 44px; font-size: 16px; }

      #fns-left-controls {
        position: fixed; bottom: 158px; left: 18px; width: 136px;
        pointer-events: none; z-index: 9995;
      }
      #fns-btn-crouch { width: 100%; height: 44px; font-size: 15px; }

      .fns-joystick-zone {
        position: fixed; bottom: 16px; width: 136px; height: 136px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(153, 34, 17, 0.14) 0%, rgba(10, 4, 4, 0.85) 100%);
        border: 2px solid rgba(153, 34, 17, 0.7);
        box-shadow: 0 0 16px rgba(0, 0, 0, 0.9);
        pointer-events: auto;
        touch-action: none;
      }
      #fns-joy-left { left: 18px; }
      #fns-joy-right { right: 18px; }
      .fns-joystick-knob {
        position: absolute; top: 50%; left: 50%;
        width: 54px; height: 54px; margin-left: -27px; margin-top: -27px;
        border-radius: 50%;
        background: radial-gradient(circle, #ffea00 0%, #aa6600 100%);
        border: 2px solid #ffffff;
        box-shadow: 0 0 12px rgba(255, 170, 0, 0.7);
        pointer-events: none;
      }

      /* === TOUCHPAD FÜR DIE MITTERNACHTSFORMEL === */
      #fns-formula-touchpad {
        display: none;
        position: fixed;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        width: min(560px, 94vw);
        background: rgba(12, 6, 6, 0.96);
        border: 2px solid #aa2211;
        box-shadow: 0 0 30px rgba(0,0,0,0.95), inset 0 0 12px rgba(170, 34, 17, 0.4);
        padding: 8px 10px;
        z-index: 10001;
        box-sizing: border-box;
        font-family: 'Courier New', monospace;
      }
      #fns-ft-display {
        background: rgba(22, 10, 6, 0.95);
        border: 1px solid #ffaa00;
        color: #00ff88;
        font-size: 15px;
        font-weight: bold;
        padding: 6px 10px;
        margin-bottom: 6px;
        min-height: 20px;
        text-align: center;
        letter-spacing: 1px;
        word-break: break-all;
      }
      #fns-ft-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 4px;
        margin-bottom: 6px;
      }
      .fns-ft-key {
        background: rgba(26, 10, 10, 0.92);
        border: 1px solid #772211;
        color: #ffea00;
        font-size: 15px;
        font-weight: bold;
        height: 38px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .fns-ft-key:active {
        background: #992211;
        color: #ffffff;
      }
      #fns-ft-actions {
        display: flex;
        gap: 6px;
      }
      .fns-ft-action-btn {
        flex: 1;
        height: 40px;
        font-size: 13px;
        font-weight: bold;
        font-family: 'Courier New', monospace;
        cursor: pointer;
        border: 1px solid #ffaa00;
        color: #ffea00;
        background: rgba(26, 12, 6, 0.95);
      }
      #fns-ft-auto-btn {
        flex: 1.4;
        background: rgba(10, 40, 18, 0.95);
        border-color: #00ff88;
        color: #00ff88;
      }
      #fns-ft-enter-btn {
        background: rgba(50, 12, 10, 0.95);
        border-color: #ff4422;
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);

    // Fullscreen button
    const fsBtn = document.createElement('button');
    fsBtn.id = 'fns-btn-fullscreen';
    fsBtn.className = 'fns-mobile-el';
    fsBtn.title = 'Vollbild';
    fsBtn.textContent = '⛶';
    fsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const docEl = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
        else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    });
    document.body.appendChild(fsBtn);

    // Mobile In-Game UI
    const ui = document.createElement('div');
    ui.id = 'fns-mobile-ui';
    ui.className = 'fns-mobile-el';
    ui.innerHTML = `
      <div id="fns-right-controls" class="fns-mobile-el">
        <button type="button" class="fns-horror-btn fns-mobile-el" id="fns-btn-furz">
          <span id="fns-furz-text">FURZ</span>
          <div id="fns-furz-bar"></div>
        </button>
        <div class="fns-btn-row fns-mobile-el">
          <button type="button" class="fns-horror-btn fns-mobile-el" id="fns-btn-use">USE</button>
          <button type="button" class="fns-horror-btn fns-mobile-el" id="fns-btn-jump">JUMP</button>
        </div>
      </div>
      <div id="fns-left-controls" class="fns-mobile-el">
        <button type="button" class="fns-horror-btn fns-mobile-el" id="fns-btn-crouch">CROUCH</button>
      </div>
      <div class="fns-joystick-zone fns-mobile-el" id="fns-joy-left"><div class="fns-joystick-knob fns-mobile-el" id="fns-knob-left"></div></div>
      <div class="fns-joystick-zone fns-mobile-el" id="fns-joy-right"><div class="fns-joystick-knob fns-mobile-el" id="fns-knob-right"></div></div>
    `;
    document.body.appendChild(ui);

    // On-Screen Mitternachtsformel Touchpad
    const ftPad = document.createElement('div');
    ftPad.id = 'fns-formula-touchpad';
    ftPad.className = 'fns-mobile-el';
    const keys = ['a', 'b', 'c', '1', '2', '3', '4', '+', '-', '*', '/', '^', '(', ')', '√', '±'];
    ftPad.innerHTML = `
      <div id="fns-ft-display">x = (-b ± √(b² - 4ac)) / (2a)</div>
      <div id="fns-ft-grid">
        ${keys.map(k => `<button type="button" class="fns-ft-key" data-token="${k}">${k}</button>`).join('')}
      </div>
      <div id="fns-ft-actions">
        <button type="button" class="fns-ft-action-btn" id="fns-ft-del-btn">DEL</button>
        <button type="button" class="fns-ft-action-btn" id="fns-ft-clear-btn">CLEAR</button>
        <button type="button" class="fns-ft-action-btn" id="fns-ft-auto-btn">FORMEL EINFÜGEN</button>
        <button type="button" class="fns-ft-action-btn" id="fns-ft-enter-btn">ENTER</button>
      </div>
    `;
    document.body.appendChild(ftPad);

    function updateFtDisplay() {
      const term = window.__fnsActiveTerminalInstance;
      const disp = document.getElementById('fns-ft-display');
      if (disp && term) {
        disp.textContent = term.currentInput ? term.currentInput : 'FORMEL EINGEBEN:';
      }
    }

    ftPad.querySelectorAll('.fns-ft-key').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tok = btn.getAttribute('data-token');
        const term = window.__fnsActiveTerminalInstance;
        if (term && term.appendToken) {
          term.appendToken(tok);
          updateFtDisplay();
        }
      });
    });

    document.getElementById('fns-ft-del-btn').addEventListener('click', (e) => {
      e.preventDefault();
      const term = window.__fnsActiveTerminalInstance;
      if (term && term.appendToken) {
        term.appendToken('BACK');
        updateFtDisplay();
      }
    });

    document.getElementById('fns-ft-clear-btn').addEventListener('click', (e) => {
      e.preventDefault();
      const term = window.__fnsActiveTerminalInstance;
      if (term && term.appendToken) {
        term.appendToken('CLEAR');
        updateFtDisplay();
      }
    });

    // 1-Click Fast Solve Helper for Mobile
    document.getElementById('fns-ft-auto-btn').addEventListener('click', (e) => {
      e.preventDefault();
      const term = window.__fnsActiveTerminalInstance;
      if (term) {
        term.currentInput = "(-b+-sqrt(b^2-4ac))/(2a)";
        if (term.roomRef && term.roomRef.updateDoorTerminalScreen) {
          term.roomRef.updateDoorTerminalScreen(term.currentInput, 'normal');
        }
        updateFtDisplay();
      }
    });

    document.getElementById('fns-ft-enter-btn').addEventListener('click', (e) => {
      e.preventDefault();
      const term = window.__fnsActiveTerminalInstance;
      if (term && term.submitCurrentInput) {
        term.submitCurrentInput();
        updateFtDisplay();
      }
    });

    // USE button
    const btnUse = document.getElementById('fns-btn-use');
    const triggerUse = (e) => {
      e.preventDefault();
      e.stopPropagation();
      tapKey('KeyE', 'e', 69);
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      setTimeout(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
        document.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));
      }, 40);
    };
    btnUse.addEventListener('touchstart', triggerUse, { passive: false });
    btnUse.addEventListener('mousedown', triggerUse);

    // FURZ button
    const btnFurz = document.getElementById('fns-btn-furz');
    const triggerFurz = (e) => {
      e.preventDefault();
      e.stopPropagation();
      tapKey('KeyG', 'g', 71);
      if (window.milanMode && typeof window.milanMode.triggerFurz === 'function') {
        window.milanMode.triggerFurz();
      }
    };
    btnFurz.addEventListener('touchstart', triggerFurz, { passive: false });
    btnFurz.addEventListener('mousedown', triggerFurz);

    // JUMP button
    const btnJump = document.getElementById('fns-btn-jump');
    btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); fireKey('Space', ' ', 32, true); }, { passive: false });
    btnJump.addEventListener('touchend', (e) => { e.preventDefault(); fireKey('Space', ' ', 32, false); }, { passive: false });

    // CROUCH button
    let crouched = false;
    const btnCrouch = document.getElementById('fns-btn-crouch');
    btnCrouch.addEventListener('touchstart', (e) => {
      e.preventDefault();
      crouched = !crouched;
      fireKey('ControlLeft', 'Control', 17, crouched);
      btnCrouch.style.borderColor = crouched ? '#00ff88' : '#992211';
      btnCrouch.style.color = crouched ? '#00ff88' : '#ffea00';
    }, { passive: false });

    // Left Move Joystick
    setupJoystick('fns-joy-left', 'fns-knob-left', (nx, ny) => {
      const dz = 0.22;
      fireKey('KeyW', 'w', 87, ny < -dz);
      fireKey('KeyS', 's', 83, ny > dz);
      fireKey('KeyA', 'a', 65, nx < -dz);
      fireKey('KeyD', 'd', 68, nx > dz);
      fireKey('ShiftLeft', 'Shift', 16, Math.hypot(nx, ny) > 0.78);
    });

    // Right Look Joystick
    let lookX = 0, lookY = 0;
    setupJoystick('fns-joy-right', 'fns-knob-right', (nx, ny) => {
      lookX = nx;
      lookY = ny;
    });

    // Touch Swipe to Look (Touch & drag anywhere on right half of screen outside buttons)
    let lastSwipeX = 0, lastSwipeY = 0, swipeActive = false, swipeTouchId = null;
    window.addEventListener('touchstart', (e) => {
      if (isMenuOverlayVisible()) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX > window.innerWidth * 0.45 && t.clientY < window.innerHeight - 170) {
          const el = document.elementFromPoint(t.clientX, t.clientY);
          if (!el || !el.closest('button, .fns-joystick-zone, #fns-formula-touchpad')) {
            swipeTouchId = t.identifier;
            lastSwipeX = t.clientX;
            lastSwipeY = t.clientY;
            swipeActive = true;
            break;
          }
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!swipeActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === swipeTouchId) {
          const dx = t.clientX - lastSwipeX;
          const dy = t.clientY - lastSwipeY;
          lastSwipeX = t.clientX;
          lastSwipeY = t.clientY;
          document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx * 1.5, movementY: dy * 1.5, bubbles: true }));
          break;
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === swipeTouchId) {
          swipeActive = false;
          swipeTouchId = null;
          break;
        }
      }
    }, { passive: true });

    const promptEl = document.getElementById('interaction-prompt');
    if (promptEl) {
      new MutationObserver(sanitizePrompt).observe(promptEl, { childList: true, characterData: true, subtree: true });
    }

    let lastT = performance.now();
    function updateMobileLoop() {
      requestAnimationFrame(updateMobileLoop);
      hookThreeForMobile();
      sanitizePrompt();

      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      const menuOpen = isMenuOverlayVisible();
      ui.style.display = menuOpen ? 'none' : 'block';
      document.body.classList.toggle('in-game', !menuOpen);

      // Manage on-screen formula touchpad visibility
      const term = window.__fnsActiveTerminalInstance;
      const termActive = term && (term.isActive || (term.roomRef && term.roomRef.isTerminalUnlockedOnDoor && !term.roomRef.doorOpen));
      ftPad.style.display = (!menuOpen && termActive) ? 'block' : 'none';
      if (termActive) updateFtDisplay();

      // Check submenus
      const levelsInline = document.getElementById('menu-levels-inline');
      const isLevelsOpen = levelsInline && window.getComputedStyle(levelsInline).display !== 'none';
      const stickerView = document.getElementById('fns-sticker-menu-view');
      const isStickerOpen = stickerView && window.getComputedStyle(stickerView).display !== 'none';
      const modalSettings = document.getElementById('modal-settings');
      const isSettingsOpen = modalSettings && window.getComputedStyle(modalSettings).display !== 'none';

      const isDiffOpen = Array.from(document.querySelectorAll('button, .horror-menu-btn, .btn')).some(b => {
        if (!b || !b.isConnected) return false;
        const txt = (b.textContent || '').trim().toUpperCase();
        return (txt === 'BACK' || txt === 'ZURÜCK') && b.id !== 'btn-levels-back' && b.id !== 'btn-close-settings' && b.offsetParent !== null;
      });

      document.body.classList.toggle('fns-hide-subtitle', isLevelsOpen || isDiffOpen || isStickerOpen || isSettingsOpen);

      const cctv = document.getElementById('cctv-cam-buttons');
      if (cctv) cctv.style.display = (isStickerOpen || isSettingsOpen) ? 'none' : '';
      const dossier = document.getElementById('secret-fleischi-dossier');
      if (dossier) dossier.style.display = (isStickerOpen || isSettingsOpen || isDiffOpen) ? 'none' : '';

      const isMilan = !!(
        window.DifficultyManager &&
        typeof window.DifficultyManager.getDifficulty === 'function' &&
        window.DifficultyManager.getDifficulty() === 'milan' &&
        window.milanMode &&
        window.milanMode.isMilan
      );
      if (btnFurz) {
        btnFurz.classList.toggle('fns-show-furz', isMilan);
        if (isMilan && window.milanMode) {
          const lastF = window.milanMode.lastFurzTime || 0;
          const cd = window.milanMode.furzCooldown || window.milanMode.cooldown || 8;
          const elapsed = (now / 1000) - lastF;
          const pct = Math.min(100, Math.max(0, (elapsed / cd) * 100));
          const bar = document.getElementById('fns-furz-bar');
          const txt = document.getElementById('fns-furz-text');
          if (bar) bar.style.width = pct + '%';
          if (txt) txt.textContent = pct >= 100 ? 'FURZ' : 'LÄDT...';
        }
      }

      // Smooth look stick without camera conflict
      const mag = Math.hypot(lookX, lookY);
      if (!menuOpen && mag > 0.12) {
        const norm = (mag - 0.12) / (1 - 0.12);
        const speed = Math.pow(norm, 1.35) * 16.0;
        const moveX = Math.round((lookX / mag) * speed * (dt * 60));
        const moveY = Math.round((lookY / mag) * speed * (dt * 60));

        const prevY = trackedCamera ? trackedCamera.rotation.y : 0;
        document.dispatchEvent(new MouseEvent('mousemove', {
          movementX: moveX,
          movementY: moveY,
          bubbles: true,
          cancelable: true
        }));

        if (trackedCamera && Math.abs(trackedCamera.rotation.y - prevY) < 0.00001) {
          trackedCamera.rotation.order = 'YXZ';
          trackedCamera.rotation.y -= (lookX / mag) * norm * 2.2 * dt;
          trackedCamera.rotation.x = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, trackedCamera.rotation.x - (lookY / mag) * norm * 1.8 * dt));
        }
      }
    }
    requestAnimationFrame(updateMobileLoop);
  }

  function setupJoystick(zoneId, knobId, onChange) {
    const zone = document.getElementById(zoneId);
    const knob = document.getElementById(knobId);
    if (!zone || !knob) return;
    let activeTouchId = null;
    const maxR = 48;

    function handleMove(clientX, clientY) {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      onChange(dx / maxR, dy / maxR);
    }

    function reset() {
      activeTouchId = null;
      knob.style.transform = 'translate(0px, 0px)';
      onChange(0, 0);
    }

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (activeTouchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        activeTouchId = t.identifier;
        handleMove(t.clientX, t.clientY);
      }
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: false });

    zone.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          reset();
          break;
        }
      }
    });
    zone.addEventListener('touchcancel', reset);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildMobileUI);
  } else {
    buildMobileUI();
  }
})();
