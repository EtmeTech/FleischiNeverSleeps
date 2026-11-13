/**
 * FleischiNeverSleeps - Multiplayer & Co-op System v4
 * - Layout: Back-Button ganz oben, darunter Name/Farbe, darunter 2 exakt gleich hohe Boxen
 * - Blocky Sneak-Animation (STRG) mit geneigtem Torso, ausgerichtetem Kopf & gebeugten Knien
 * - 60 FPS Monster-Sync aus den aktiven Level-Managern (kein Unsichtbar-Bug in der Bibliothek)
 * - Dynamisches Multi-Player-Aggro (Fleischis jagen den nächsten/lautesten Spieler, nicht nur den Host)
 * - Sporthallen-Bosskampf Action-Upgrade (3 Phasen, 3D-Boden-Schockwellen zum Überspringen & Schatten-Jäger)
 */
(function () {
  'use strict';

  const STORAGE_NAME_KEY = 'fns_mp_player_name_v1';
  const STORAGE_COLOR_KEY = 'fns_mp_player_color_v1';

  const PLAYER_PALETTE = [
    { hex: '#00ff66', rgb: '0, 255, 102' },
    { hex: '#00e5ff', rgb: '0, 229, 255' },
    { hex: '#ffaa00', rgb: '255, 170, 0' },
    { hex: '#ff3344', rgb: '255, 51, 68' },
    { hex: '#a855f7', rgb: '168, 85, 247' },
    { hex: '#38bdf8', rgb: '56, 189, 248' }
  ];

  const playerId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  let playerName = localStorage.getItem(STORAGE_NAME_KEY) || ('Spieler_' + Math.floor(100 + Math.random() * 899));
  let playerColor = localStorage.getItem(STORAGE_COLOR_KEY) || PLAYER_PALETTE[0].hex;

  let activeLobby = null;
  let selectedCreateDiff = 'praeti';
  let syncInFlight = false;
  let lastEventTs = 0;
  let wasGrabbedLastSync = false;
  const outgoingEvents = [];
  let latestServerMonsters = [];
  let latestServerMonstersStage = '';

  let appliedWorld = {
    drawerOpen: false,
    keyPickedUp: false,
    keyInserted: false,
    doorUnlocked: false,
    terminalInput: '',
    elevatorClosed: false,
    elevatorSolved: false,
    fleischDoors: new Set(),
    schoolStairDoors: new Set(),
    boilerValves: new Set(),
    libraryLevers: new Set()
  };

  function resetAppliedWorld() {
    appliedWorld = {
      drawerOpen: false,
      keyPickedUp: false,
      keyInserted: false,
      doorUnlocked: false,
      terminalInput: '',
      elevatorClosed: false,
      elevatorSolved: false,
      fleischDoors: new Set(),
      schoolStairDoors: new Set(),
      boilerValves: new Set(),
      libraryLevers: new Set()
    };
    latestServerMonsters = [];
    latestServerMonstersStage = '';
  }

  function queueWorldEvent(ev) {
    if (!activeLobby) return;
    outgoingEvents.push(ev);
  }

  const remotePlayers = new Map();

  function getPaletteEntry(hex) {
    return PLAYER_PALETTE.find(p => p.hex.toLowerCase() === String(hex || '').toLowerCase()) || PLAYER_PALETTE[0];
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  
  // === GLOBALE KOOP-HELFER FÜR DIE LEVEL-MANAGER ===
  window.__fnsIsMpAuthority = function () {
    if (!activeLobby) return true;
    return activeLobby.hostId === playerId;
  };

  window.__fnsBroadcastCountdown = function () {
    queueWorldEvent({ type: 'fleisch_countdown' });
  };

  window.__fnsBroadcastBossDamage = function (dmg) {
    queueWorldEvent({ type: 'boss_damage', damage: dmg });
  };

  window.__fnsGetClosestPlayerPos = function (stage, monsterPos, fallbackPos) {
    if (!activeLobby) return fallbackPos;
    let best = fallbackPos;
    let bestDist = Math.hypot(fallbackPos.x - monsterPos.x, fallbackPos.z - monsterPos.z);
    for (const rp of remotePlayers.values()) {
      const d = rp.data;
      if (!d || (d.stage && d.stage !== stage) || d.grabbed || d.lockerId >= 0) continue;
      const dist = Math.hypot((d.x || 0) - monsterPos.x, (d.z || 0) - monsterPos.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: d.x || 0, y: d.y || 1.6, z: d.z || 0 };
      }
    }
    return best;
  };

  window.__fnsGetAllPlayersInStage = function (stage, localPos, localFloorKey, localInSafe) {
    const arr = [{
      x: localPos.x,
      z: localPos.z,
      floorKey: localFloorKey,
      inSafeZone: !!localInSafe
    }];
    if (!activeLobby) return arr;
    for (const rp of remotePlayers.values()) {
      const d = rp.data;
      if (!d || (d.stage && d.stage !== stage) || d.grabbed || d.lockerId >= 0) continue;
      const footY = (typeof d.y === 'number' ? d.y : 1.6) - 1.6;
      const fKey = footY < -2.25 ? '-1' : (footY > 2.25 ? '1' : '0');
      const inSafe = (stage === 'labyrinth' && fKey === '0' && d.x < -38.0 && d.z > 38.0);
      arr.push({
        x: d.x || 0,
        z: d.z || 0,
        floorKey: fKey,
        inSafeZone: inSafe
      });
    }
    return arr;
  };

  
  window.__fnsBroadcastLibraryReset = function (safeX, safeZ) {
    queueWorldEvent({ type: 'library_reset', x: +safeX.toFixed(2), z: +safeZ.toFixed(2) });
  };

  window.__fnsApplyClientBoss = function (bossGroup, dt) {
    if (!activeLobby || latestServerMonstersStage !== 'gym' || !latestServerMonsters.length || !bossGroup) return;
    const THREE = window.THREE;
    if (!THREE) return;
    const md = latestServerMonsters[0];
    if (!md) return;
    const targetPos = new THREE.Vector3(md.x, md.y, md.z);
    if (bossGroup.position.distanceToSquared(targetPos) > 36) {
      bossGroup.position.copy(targetPos);
    } else {
      bossGroup.position.lerp(targetPos, Math.min(1.0, dt * 16.0));
    }
    bossGroup.rotation.y = md.ry;
  };

  window.__fnsApplyClientMonsters = function (stage, monsterWrapperList, dt) {
    if (!activeLobby || latestServerMonstersStage !== stage || !Array.isArray(latestServerMonsters)) return;
    const THREE = window.THREE;
    if (!THREE) return;
    const count = Math.min(monsterWrapperList.length, latestServerMonsters.length);
    for (let i = 0; i < count; i++) {
      const item = monsterWrapperList[i];
      const md = latestServerMonsters[i];
      if (!item || !item.group || !md) continue;
      item.group.visible = true;
      const targetPos = new THREE.Vector3(md.x, md.y, md.z);
      if (item.group.position.distanceToSquared(targetPos) > 36) {
        item.group.position.copy(targetPos);
      } else {
        item.group.position.lerp(targetPos, Math.min(1.0, dt * 18.0));
      }
      item.group.rotation.y = md.ry;
      if (stage === 'labyrinth') {
        item.floorKey = md.y < -2.25 ? '-1' : (md.y > 2.25 ? '1' : '0');
        item.groundY = md.y;
      }
      if (item.entity) {
        if (stage === 'boiler' && typeof item.entity.animateWaterStalk === 'function') {
          item.entity.animateWaterStalk(dt, false);
        } else if (typeof item.entity.animate === 'function') {
          item.entity.animate(dt, false, true);
        }
      }
    }
  };

  window.__fnsCanCloseElevator = function () {
    if (!activeLobby) return true;
    for (const rp of remotePlayers.values()) {
      if (rp.data && (!rp.data.stage || rp.data.stage === 'act1')) {
        if (typeof rp.data.z === 'number' && rp.data.z > -49.5) {
          return false;
        }
      }
    }
    return true;
  };

  // ============================================================================
  // 1. BLOCKY PIXEL-ART SPIELER-MODELL MIT KLASSISCHER SNEAK-GEOMETRIE
  // ============================================================================
  function createPixelCanvas(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.dataset.fnsInternal = '1';
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawFn(ctx, w, h);
    const THREE = window.THREE;
    const tex = new THREE.CanvasTexture(c);
    if (THREE.NearestFilter) {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
    }
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  function buildBlockyCharacterAvatar(accentHex) {
    const THREE = window.THREE;
    if (!THREE) return null;

    const root = new THREE.Group();
    root.name = 'FnsRemoteSurvivorAvatar';
    root.userData.isRemotePlayer = true;

    const bodyPivot = new THREE.Group();
    bodyPivot.rotation.y = Math.PI;
    root.add(bodyPivot);

    const headFrontMat = createPixelCanvas(64, 64, (ctx) => {
      ctx.fillStyle = '#d8a280';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#c48d6c';
      ctx.fillRect(0, 48, 64, 16);
      ctx.fillRect(0, 24, 8, 24);
      ctx.fillRect(56, 24, 8, 24);
      ctx.fillStyle = '#1e1410';
      ctx.fillRect(0, 0, 64, 16);
      ctx.fillRect(0, 16, 14, 8);
      ctx.fillRect(28, 16, 16, 6);
      ctx.fillRect(52, 16, 12, 8);
      ctx.fillStyle = '#140d0a';
      ctx.fillRect(8, 24, 16, 5);
      ctx.fillRect(40, 24, 16, 5);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(8, 29, 16, 10);
      ctx.fillRect(40, 29, 16, 10);
      ctx.fillStyle = accentHex;
      ctx.fillRect(14, 29, 10, 10);
      ctx.fillRect(40, 29, 10, 10);
      ctx.fillStyle = '#090909';
      ctx.fillRect(16, 31, 6, 8);
      ctx.fillRect(42, 31, 6, 8);
      ctx.fillStyle = '#b07654';
      ctx.fillRect(28, 38, 8, 6);
      ctx.fillStyle = '#5c2e1f';
      ctx.fillRect(24, 50, 16, 5);
    });

    const headSideMat = createPixelCanvas(64, 64, (ctx) => {
      ctx.fillStyle = '#ce9674';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#1e1410';
      ctx.fillRect(0, 0, 64, 20);
      ctx.fillRect(0, 20, 22, 18);
      ctx.fillRect(48, 20, 16, 24);
    });

    const headBackMat = createPixelCanvas(64, 64, (ctx) => {
      ctx.fillStyle = '#1e1410';
      ctx.fillRect(0, 0, 64, 54);
      ctx.fillStyle = '#2b1d17';
      ctx.fillRect(12, 12, 16, 24);
      ctx.fillRect(36, 8, 16, 28);
      ctx.fillStyle = '#c48d6c';
      ctx.fillRect(0, 54, 64, 10);
    });

    const headTopMat = createPixelCanvas(64, 64, (ctx) => {
      ctx.fillStyle = '#1e1410';
      ctx.fillRect(0, 0, 64, 64);
    });

    const headBottomMat = createPixelCanvas(64, 64, (ctx) => {
      ctx.fillStyle = '#9e6848';
      ctx.fillRect(0, 0, 64, 64);
    });

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.38, 0);
    bodyPivot.add(headPivot);

    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.44, 0.44),
      [headSideMat, headSideMat, headTopMat, headBottomMat, headFrontMat, headBackMat]
    );
    headMesh.position.set(0, 0.22, 0);
    headPivot.add(headMesh);

    const torsoFrontMat = createPixelCanvas(64, 96, (ctx) => {
      ctx.fillStyle = '#181a1f';
      ctx.fillRect(0, 0, 64, 96);
      ctx.fillStyle = accentHex;
      ctx.fillRect(0, 0, 64, 12);
      ctx.fillRect(8, 22, 48, 6);
      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(29, 0, 6, 96);
      ctx.fillStyle = '#111317';
      ctx.fillRect(10, 58, 44, 24);
    });

    const torsoBackMat = createPixelCanvas(64, 96, (ctx) => {
      ctx.fillStyle = '#14161b';
      ctx.fillRect(0, 0, 64, 96);
      ctx.fillStyle = '#0e1014';
      ctx.fillRect(14, 0, 36, 20);
      ctx.fillStyle = accentHex;
      ctx.fillRect(20, 34, 24, 24);
      ctx.fillStyle = '#14161b';
      ctx.fillRect(26, 40, 12, 12);
    });

    const torsoSideMat = createPixelCanvas(32, 96, (ctx) => {
      ctx.fillStyle = '#121418';
      ctx.fillRect(0, 0, 32, 96);
      ctx.fillStyle = accentHex;
      ctx.fillRect(11, 0, 10, 96);
    });

    // Eigener Torso-Pivot an der Hüfte, damit sich beim Sneaken nur der Oberkörper echt nach vorne lehnt!
    const torsoPivot = new THREE.Group();
    torsoPivot.position.set(0, 0.72, 0);
    const torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.66, 0.22),
      [torsoSideMat, torsoSideMat, torsoSideMat, torsoSideMat, torsoFrontMat, torsoBackMat]
    );
    torsoMesh.position.set(0, 0.33, 0);
    torsoPivot.add(torsoMesh);
    bodyPivot.add(torsoPivot);

    const armMat = createPixelCanvas(32, 96, (ctx) => {
      ctx.fillStyle = '#181a1f';
      ctx.fillRect(0, 0, 32, 70);
      ctx.fillStyle = accentHex;
      ctx.fillRect(0, 10, 32, 8);
      ctx.fillRect(0, 62, 32, 8);
      ctx.fillStyle = '#d8a280';
      ctx.fillRect(0, 70, 32, 26);
    });

    const armGeo = new THREE.BoxGeometry(0.20, 0.64, 0.20);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.32, 1.36, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.set(0, -0.28, 0);
    leftArmPivot.add(leftArmMesh);
    bodyPivot.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.32, 1.36, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.set(0, -0.28, 0);
    rightArmPivot.add(rightArmMesh);

    const torchMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.028, 0.22, 8),
      new THREE.MeshBasicMaterial({ color: 0x2a2a2a })
    );
    torchMesh.rotation.x = Math.PI / 2;
    torchMesh.position.set(0, -0.54, 0.12);
    const lensMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.03, 8),
      new THREE.MeshBasicMaterial({ color: 0xffeeaa })
    );
    lensMesh.position.set(0, -0.54, 0.235);
    rightArmPivot.add(torchMesh, lensMesh);
    bodyPivot.add(rightArmPivot);

    const legMat = createPixelCanvas(32, 96, (ctx) => {
      ctx.fillStyle = '#1e222a';
      ctx.fillRect(0, 0, 32, 76);
      ctx.fillStyle = '#0e1014';
      ctx.fillRect(0, 76, 32, 15);
      ctx.fillStyle = accentHex;
      ctx.fillRect(0, 91, 32, 5);
    });

    const legGeo = new THREE.BoxGeometry(0.21, 0.68, 0.21);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.11, 0.68, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.set(0, -0.34, 0);
    leftLegPivot.add(leftLegMesh);
    bodyPivot.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.11, 0.68, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.set(0, -0.34, 0);
    rightLegPivot.add(rightLegMesh);
    bodyPivot.add(rightLegPivot);

    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.isRemotePlayer = true;
        obj.userData.isStickerPart = true;
      }
    });

    return {
      root,
      bodyPivot,
      headPivot,
      torsoPivot,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot,
      sneakBlend: 0,
      walkPhase: Math.random() * 10
    };
  }

  // ============================================================================
  // 2. MULTIPLAYER-MENÜ MIT BACK GANZ OBEN & GLEICH HOHEN BOXEN
  // ============================================================================
  function injectMultiplayerUI() {
    let style = document.getElementById('fns-mp-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'fns-mp-styles';
      document.head.appendChild(style);
    }

    style.textContent = `
      #menu-mp-inline {
        display: none;
        flex-direction: column;
        gap: 12px;
        width: min(850px, 88vw);
        padding: 4px;
        box-sizing: border-box;
        z-index: 30;
        font-family: 'Courier New', Courier, monospace;
      }

      /* ZEILE 1: BACK BUTTON ÜBER ALLEM */
      .fns-mp-back-row {
        display: flex;
        align-items: center;
      }
      #btn-mp-back {
        width: 150px;
        padding: 10px 22px;
        font-size: 18px;
      }

      /* ZEILE 2: DEIN NAME & FARBE DARUNTER */
      .fns-mp-profile-row {
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        background: rgba(10, 4, 4, 0.88);
        border: 2px solid rgba(153, 34, 17, 0.7);
        padding: 10px 16px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.85);
      }
      .fns-mp-name-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .fns-mp-label {
        font-size: 15px;
        font-weight: 900;
        color: #ffaa00;
        letter-spacing: 1.5px;
        text-transform: uppercase;
      }
      .fns-mp-inline-input {
        background: rgba(18, 6, 6, 0.95);
        border: 2px solid #992211;
        color: #ffea00;
        font-family: 'Courier New', monospace;
        font-size: 16px;
        font-weight: bold;
        padding: 8px 12px;
        width: 210px;
        outline: none;
        box-sizing: border-box;
      }
      .fns-mp-inline-input:focus {
        border-color: #ffaa00;
        box-shadow: 0 0 12px rgba(255, 170, 0, 0.35);
      }
      .fns-mp-swatches {
        display: flex;
        gap: 6px;
      }
      .fns-mp-swatch {
        width: 24px;
        height: 24px;
        cursor: pointer;
        border: 2px solid #2a0a08;
        transition: transform 0.12s;
      }
      .fns-mp-swatch.active {
        border-color: #ffffff;
        transform: scale(1.15);
        box-shadow: 0 0 10px rgba(255,255,255,0.5);
      }

      /* ZEILE 3: BEIDE BOXEN EXAKT GLEICH HOCH (310px) */
      .fns-mp-main-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        align-items: stretch;
      }
      @media (max-width: 780px) {
        .fns-mp-main-grid {
          grid-template-columns: 1fr;
        }
      }
      .fns-mp-col {
        height: 310px;
        box-sizing: border-box;
        background: rgba(10, 4, 4, 0.90);
        border: 2px solid rgba(153, 34, 17, 0.72);
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow: 0 10px 28px rgba(0,0,0,0.88);
      }
      .fns-mp-col-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 16px;
        font-weight: 900;
        color: #ffffff;
        letter-spacing: 2px;
        text-transform: uppercase;
        border-bottom: 1px solid rgba(153, 34, 17, 0.55);
        padding-bottom: 8px;
        margin-bottom: 8px;
        flex-shrink: 0;
      }

      /* OFFENE LOBBYS LISTE & SAUBERE BEITRETEN-KARTEN */
      #fns-mp-lobbies-grid {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow-y: auto;
        padding: 4px;
        margin: -4px;
      }
      .fns-mp-lobby-card {
        width: 100%;
        background: rgba(20, 7, 7, 0.94);
        border: 2px solid #882012;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        box-sizing: border-box;
        cursor: pointer;
        transition: 0.15s;
      }
      .fns-mp-lobby-card:hover {
        background: rgba(65, 12, 9, 0.95);
        border-color: #00ff88;
        box-shadow: 0 0 16px rgba(0, 255, 136, 0.3);
      }
      .fns-mp-lobby-card-left {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        min-width: 0;
        flex: 1;
      }
      .fns-mp-lobby-title {
        color: #ffea00;
        font-size: 15px;
        font-weight: 900;
        letter-spacing: 1px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        text-align: left;
      }
      .fns-mp-lobby-sub {
        font-size: 12px;
        font-weight: bold;
        color: #bbbbbb;
        letter-spacing: 1px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .fns-mp-join-badge {
        background: rgba(14, 5, 5, 0.95);
        border: 2px solid #ffaa00;
        color: #ffea00;
        padding: 7px 14px;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        white-space: nowrap;
        flex-shrink: 0;
        transition: 0.15s;
      }
      .fns-mp-lobby-card:hover .fns-mp-join-badge {
        background: #0b3d20;
        border-color: #00ff88;
        color: #ffffff;
      }

      .fns-mp-diff-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .fns-mp-diff-btn {
        background: rgba(18, 6, 6, 0.92);
        border: 2px solid #661a11;
        padding: 9px 6px;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        font-weight: 900;
        text-transform: uppercase;
        cursor: pointer;
        transition: 0.15s;
      }
      .fns-mp-diff-btn.active {
        background: rgba(130, 15, 10, 0.95);
        border-color: #ffea00;
        box-shadow: 0 0 12px rgba(255, 170, 0, 0.4);
      }

      /* Overlay-Layer für NameTags, Farb-Pfeile & Boss-HUD */
      #fns-mp-overlay-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 140;
        overflow: hidden;
      }

      .fns-mp-nametag {
        position: absolute;
        left: 0;
        top: 0;
        transform: translate(-50%, -100%);
        padding: 4px 12px;
        background: radial-gradient(ellipse at center, rgba(6, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0) 78%);
        font-family: 'Courier New', Courier, monospace;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        white-space: nowrap;
        display: none;
        pointer-events: none;
        text-align: center;
      }
      .fns-mp-nametag::after {
        content: '';
        display: block;
        width: 75%;
        height: 1.5px;
        margin: 2px auto 0 auto;
        background: currentColor;
        box-shadow: 0 0 6px currentColor;
        opacity: 0.75;
      }
      .fns-mp-nametag.grabbed-panic {
        color: #ff1100 !important;
        text-shadow: 0 0 14px #ff0000, 2px 2px 0 #000 !important;
        animation: scoldTextShake 0.08s infinite;
      }

      .fns-mp-edge-arrow {
        position: fixed;
        top: 50%;
        transform: translateY(-50%);
        width: 28px;
        height: 44px;
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 145;
        pointer-events: none;
      }
      .fns-mp-edge-arrow.edge-left { left: 10px; }
      .fns-mp-edge-arrow.edge-right { right: 10px; }

      /* Boss-Action HUD oben mittig */
      #fns-gym-boss-hud {
        display: none;
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        width: min(480px, 78vw);
        background: rgba(10, 2, 2, 0.9);
        border: 2px solid #aa180c;
        padding: 8px 14px;
        z-index: 250;
        font-family: 'Courier New', monospace;
        text-align: center;
        pointer-events: none;
        box-shadow: 0 0 25px rgba(255, 20, 0, 0.45);
      }
      #fns-gym-boss-title {
        font-size: 13px;
        font-weight: 900;
        color: #ffea00;
        letter-spacing: 2px;
        margin-bottom: 5px;
      }
      #fns-gym-boss-bar-bg {
        width: 100%;
        height: 8px;
        background: #220505;
        border: 1px solid #661108;
      }
      #fns-gym-boss-bar-fill {
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, #ff1100, #ffaa00);
        transition: width 0.25s ease;
      }
    `;

    if (!document.getElementById('fns-mp-overlay-layer')) {
      const overlay = document.createElement('div');
      overlay.id = 'fns-mp-overlay-layer';
      document.body.appendChild(overlay);
    }

    if (!document.getElementById('fns-gym-boss-hud')) {
      const bossHud = document.createElement('div');
      bossHud.id = 'fns-gym-boss-hud';
      bossHud.innerHTML = `
        <div id="fns-gym-boss-title">SPORTHALLEN-ALPHA FLEISCHI // ÜBERLEBE & AKTIVIERE DIE SCHALTER</div>
        <div id="fns-gym-boss-bar-bg"><div id="fns-gym-boss-bar-fill"></div></div>
      `;
      document.body.appendChild(bossHud);
    }
  }

  function setupInlineMultiplayerMenu() {
    injectMultiplayerUI();
    const bottomLeft = document.getElementById('menu-bottom-left');
    const menuBtns = document.getElementById('menu-main-buttons');
    if (!bottomLeft || !menuBtns) return;

    let mpBtn = document.getElementById('btn-menu-multiplayer');
    if (!mpBtn) {
      mpBtn = document.createElement('button');
      mpBtn.id = 'btn-menu-multiplayer';
      mpBtn.className = 'horror-menu-btn';
      mpBtn.textContent = 'Multiplayer';
      const levelsBtn = document.getElementById('btn-menu-levels');
      if (levelsBtn && levelsBtn.nextSibling) {
        menuBtns.insertBefore(mpBtn, levelsBtn.nextSibling);
      } else {
        menuBtns.appendChild(mpBtn);
      }
    }

    let mpInline = document.getElementById('menu-mp-inline');
    if (mpInline && !mpInline.querySelector('.fns-mp-back-row')) {
      mpInline.remove();
      mpInline = null;
    }

    if (!mpInline) {
      mpInline = document.createElement('div');
      mpInline.id = 'menu-mp-inline';
      mpInline.innerHTML = `
        <!-- ZEILE 1: BACK BUTTON ÜBER ALLEM -->
        <div class="fns-mp-back-row">
          <button type="button" class="horror-menu-btn" id="btn-mp-back">Back</button>
        </div>

        <!-- ZEILE 2: DEIN NAME & FARBE DARUNTER -->
        <div class="fns-mp-profile-row">
          <div class="fns-mp-name-group">
            <span class="fns-mp-label">DEIN NAME:</span>
            <input type="text" id="fns-mp-name-input" class="fns-mp-inline-input" maxlength="14" value="${escapeHtml(playerName)}" placeholder="Spielername" />
          </div>
          <div class="fns-mp-name-group">
            <span class="fns-mp-label">FARBE:</span>
            <div class="fns-mp-swatches" id="fns-mp-swatches">
              ${PLAYER_PALETTE.map(p => `
                <div class="fns-mp-swatch ${p.hex === playerColor ? 'active' : ''}" data-color="${p.hex}" style="background:${p.hex};"></div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- ZEILE 3: BEIDE BOXEN EXAKT GLEICH HOCH -->
        <div class="fns-mp-main-grid">
          <div class="fns-mp-col">
            <div class="fns-mp-col-header">
              <span>OFFENE LOBBYS</span>
              <button type="button" class="cctv-switch-btn" id="btn-mp-refresh" style="padding:4px 10px; font-size:12px;">AKTUALISIEREN</button>
            </div>
            <div id="fns-mp-lobbies-grid"></div>
          </div>

          <div class="fns-mp-col">
            <div class="fns-mp-col-header">
              <span>NEUE LOBBY STARTEN</span>
            </div>
            <input type="text" id="fns-mp-create-name" class="fns-mp-inline-input" style="width:100%;" maxlength="20" value="${escapeHtml(playerName)}s Lobby" placeholder="Lobby-Name" />
            <div class="fns-mp-diff-row">
              <button type="button" class="fns-mp-diff-btn mp-diff-choice" data-diff="mats" style="color:#00ff88;">MATS</button>
              <button type="button" class="fns-mp-diff-btn mp-diff-choice active" data-diff="praeti" style="color:#ffaa00;">PRAETI</button>
              <button type="button" class="fns-mp-diff-btn mp-diff-choice" data-diff="milan" style="color:#ff3333;">MILAN</button>
            </div>
            <input type="password" id="fns-mp-create-pass" class="fns-mp-inline-input" style="width:100%; font-size:14px;" maxlength="16" value="" placeholder="Passwort (leer = öffentlich)" autocomplete="new-password" />
            <button type="button" class="horror-menu-btn" id="btn-mp-start-create" style="width:100%; text-align:center; padding:12px 16px; font-size:18px; border-color:#00ff88; color:#00ff88;">LOBBY STARTEN</button>
          </div>
        </div>
      `;
      bottomLeft.appendChild(mpInline);

      mpInline.querySelector('#btn-mp-back').addEventListener('click', () => {
        mpInline.style.display = 'none';
        menuBtns.style.display = 'flex';
      });

      const nameInp = mpInline.querySelector('#fns-mp-name-input');
      nameInp.addEventListener('input', () => {
        playerName = (nameInp.value || '').trim().slice(0, 14) || 'Spieler';
        try { localStorage.setItem(STORAGE_NAME_KEY, playerName); } catch (e) {}
      });

      mpInline.querySelectorAll('.fns-mp-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          playerColor = sw.getAttribute('data-color') || '#00ff66';
          try { localStorage.setItem(STORAGE_COLOR_KEY, playerColor); } catch (e) {}
          mpInline.querySelectorAll('.fns-mp-swatch').forEach(el => el.classList.toggle('active', el === sw));
        });
      });

      mpInline.querySelector('#btn-mp-refresh').addEventListener('click', () => {
        fetchAndRenderLobbys();
      });

      mpInline.querySelectorAll('.mp-diff-choice').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedCreateDiff = btn.getAttribute('data-diff') || 'praeti';
          mpInline.querySelectorAll('.mp-diff-choice').forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      mpInline.querySelector('#btn-mp-start-create').addEventListener('click', () => {
        createNewLobby();
      });
    }

    if (!mpBtn.__fnsMpHooked) {
      mpBtn.__fnsMpHooked = true;
      mpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menuBtns.style.display = 'none';
        const levelsInline = document.getElementById('menu-levels-inline');
        if (levelsInline) levelsInline.style.display = 'none';
        const diffInline = document.getElementById('menu-difficulty-inline');
        if (diffInline) diffInline.style.display = 'none';

        mpInline.style.display = 'flex';
        fetchAndRenderLobbys();
      });
    }
  }

  async function fetchAndRenderLobbys() {
    const grid = document.getElementById('fns-mp-lobbies-grid');
    if (!grid) return;
    try {
      const res = await fetch('/api/mp/lobbies');
      const data = await res.json();
      grid.innerHTML = '';

      if (!data.ok || !Array.isArray(data.lobbies) || data.lobbies.length === 0) {
        grid.innerHTML = `<div style="color:#999; font-size:14px; padding:24px 6px; line-height:1.5;">Aktuell ist keine Lobby offen.<br><span style="color:#ffaa00;">Erstelle rechts eine neue Lobby!</span></div>`;
        return;
      }

      data.lobbies.forEach(lob => {
        const card = document.createElement('div');
        card.className = 'fns-mp-lobby-card';
        const lockIcon = lob.hasPassword ? '🔒 ' : '';
        const diffCol = lob.difficulty === 'milan' ? '#ff3333' : (lob.difficulty === 'mats' ? '#00ff88' : '#ffaa00');
        card.innerHTML = `
          <div class="fns-mp-lobby-card-left">
            <div class="fns-mp-lobby-title">${lockIcon}${escapeHtml(lob.name)}</div>
            <div class="fns-mp-lobby-sub">
              <span style="color:${diffCol};">[${lob.difficulty.toUpperCase()}]</span>
              <span>•</span>
              <span>${lob.playerCount}/${lob.maxPlayers} SPIELER</span>
            </div>
          </div>
          <div class="fns-mp-join-badge">BEITRETEN</div>
        `;
        card.addEventListener('click', () => {
          let pass = '';
          if (lob.hasPassword) {
            pass = window.prompt('Passwort:', '') || '';
          }
          joinExistingLobby(lob.id, pass);
        });
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = `<div style="color:#ff4433; font-size:14px; padding:10px;">Offline</div>`;
    }
  }

  async function createNewLobby() {
    const nameInp = document.getElementById('fns-mp-name-input');
    if (nameInp && nameInp.value.trim()) {
      playerName = nameInp.value.trim().slice(0, 14);
      try { localStorage.setItem(STORAGE_NAME_KEY, playerName); } catch (e) {}
    }
    const lobName = (document.getElementById('fns-mp-create-name')?.value || `${playerName}`).trim();
    const pass = document.getElementById('fns-mp-create-pass')?.value || '';

    try {
      const res = await fetch('/api/mp/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyName: lobName,
          difficulty: selectedCreateDiff,
          password: pass,
          stage: 'act1',
          playerId,
          playerName,
          color: playerColor
        })
      });
      const data = await res.json();
      if (data.ok) enterLobbySession(data.lobby);
    } catch (e) {}
  }

  async function joinExistingLobby(lobbyId, password) {
    const nameInp = document.getElementById('fns-mp-name-input');
    if (nameInp && nameInp.value.trim()) {
      playerName = nameInp.value.trim().slice(0, 14);
      try { localStorage.setItem(STORAGE_NAME_KEY, playerName); } catch (e) {}
    }
    try {
      const res = await fetch('/api/mp/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId,
          password,
          playerId,
          playerName,
          color: playerColor
        })
      });
      const data = await res.json();
      if (data.ok) enterLobbySession(data.lobby);
      else if (data.error) alert(data.error);
    } catch (e) {}
  }

  function enterLobbySession(lobbyInfo) {
    activeLobby = lobbyInfo;
    window.__fnsMultiplayerActive = true;
    lastEventTs = 0;
    outgoingEvents.length = 0;
    resetAppliedWorld();

    const mpInline = document.getElementById('menu-mp-inline');
    if (mpInline) mpInline.style.display = 'none';

    if (window.DifficultyManager && typeof window.DifficultyManager.setDifficulty === 'function') {
      window.DifficultyManager.setDifficulty(lobbyInfo.difficulty || 'praeti');
    }
    if (window.milanMode && typeof window.milanMode.setMilanActive === 'function') {
      window.milanMode.setMilanActive(lobbyInfo.difficulty === 'milan');
    }

    window.__fnsIsFullRun = true;
    window.__fnsRunStartTime = performance.now();
    window.__fnsRunStickers = 0;

    const bridge = window.__fnsGameBridge;
    const targetStage = lobbyInfo.stage || 'act1';
    if (bridge) {
      if (targetStage === 'gym' && bridge.startGymBossFight) {
        bridge.startGymBossFight();
      } else if (bridge.startGameFromMenu) {
        bridge.startGameFromMenu(targetStage, 'campaign');
      }
    }

    if (lobbyInfo.worldState) {
      setTimeout(() => applyServerWorldState(lobbyInfo.worldState), 250);
    }
  }

  function leaveCurrentLobby() {
    if (!activeLobby) return;
    const lid = activeLobby.id;
    activeLobby = null;
    window.__fnsMultiplayerActive = false;
    resetAppliedWorld();

    fetch('/api/mp/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobbyId: lid, playerId })
    }).catch(() => {});

    for (const rp of remotePlayers.values()) {
      if (rp.avatar && rp.avatar.root && rp.avatar.root.parent) {
        rp.avatar.root.parent.remove(rp.avatar.root);
      }
      if (rp.nametagEl) rp.nametagEl.remove();
      if (rp.edgeEl) rp.edgeEl.remove();
    }
    remotePlayers.clear();
  }

  // ============================================================================
  // 3. EXAKTE MONSTER-ERMITTLUNG PRO LEVEL & MULTI-PLAYER-AGGRO STEERING
  // ============================================================================
  function getActiveManagerForStage(bridge, stage) {
    if (!bridge) return null;
    if (stage === 'act1') return bridge.getHallway && bridge.getHallway();
    if (stage === 'fleischrooms') return bridge.getFleischrooms && bridge.getFleischrooms();
    if (stage === 'labyrinth') return bridge.getLabyrinth && bridge.getLabyrinth();
    if (stage === 'boiler') return bridge.getBoiler && bridge.getBoiler();
    if (stage === 'library') return bridge.getLibrary && bridge.getLibrary();
    if (stage === 'gym') return bridge.getGymBoss && bridge.getGymBoss();
    return null;
  }

  // Findet deterministisch alle FleischiMonster-Instanzen, die zum aktuellen Level gehören!
  function getStageMonsterEntities(bridge, stage) {
    if (!bridge || stage === 'menu' || stage === 'school') return [];
    const mgr = getActiveManagerForStage(bridge, stage);
    if (!mgr) return [];

    const found = [];
    const addEntity = (ent) => {
      if (!ent) return;
      const inst = ent.__fnsMonsterInstance || (ent.group && ent.group.userData?.__fnsMonsterInstance) || (ent.animate && ent.group ? ent : null);
      if (inst && inst.group && !inst.__isBossMinion && !found.includes(inst)) {
        found.push(inst);
      }
    };

    // 1. Direkte Felder am Level-Manager prüfen
    for (const k of Object.keys(mgr)) {
      const val = mgr[k];
      if (!val) continue;
      if (Array.isArray(val)) {
        val.forEach(item => {
          addEntity(item);
          if (item && item.entity) addEntity(item.entity);
          if (item && item.monster) addEntity(item.monster);
        });
      } else if (typeof val === 'object') {
        addEntity(val);
        if (val.entity) addEntity(val.entity);
      }
    }

    // 2. Falls noch leer, Scene-Subtree des Managers durchsuchen
    const rootGroup = mgr.group || mgr.hallwayGroup;
    if (rootGroup && rootGroup.traverse) {
      rootGroup.traverse(obj => {
        if (obj && obj.userData && obj.userData.__fnsMonsterInstance) {
          addEntity(obj.userData.__fnsMonsterInstance);
        }
      });
    }
    return found;
  }

  // Sorgt auf dem Host dafür, dass Fleischis nicht nur den Host, sondern den NÄCHSTEN / LAUTESTEN Spieler jagen!
  function updateHostMultiPlayerAggro(bridge, curStage, dt) {
    if (!activeLobby || activeLobby.hostId !== playerId || curStage === 'menu' || curStage === 'school') return;
    const localPlayer = bridge.getPlayer && bridge.getPlayer();
    if (!localPlayer) return;

    const candidates = [];
    if (!localPlayer.isHiddenInLocker && !(bridge.isBeingGrabbed && bridge.isBeingGrabbed())) {
      const keys = localPlayer.keys || {};
      const sprinting = !!(keys.shift && (keys.w || keys.a || keys.s || keys.d));
      const crouching = !!keys.ctrl;
      candidates.push({
        isLocal: true,
        x: localPlayer.position.x,
        y: localPlayer.position.y - 1.6,
        z: localPlayer.position.z,
        noiseWeight: sprinting ? 0.65 : (crouching ? 1.45 : 1.0)
      });
    }

    for (const rp of remotePlayers.values()) {
      const d = rp.data;
      if (!d || (d.stage && d.stage !== curStage) || d.grabbed || d.lockerId >= 0) continue;
      candidates.push({
        isLocal: false,
        x: d.x || 0,
        y: (d.y || 1.6) - 1.6,
        z: d.z || 0,
        noiseWeight: d.sprinting ? 0.65 : (d.crouch ? 1.45 : 1.0)
      });
    }

    if (candidates.length === 0) return;

    const monsters = getStageMonsterEntities(bridge, curStage);
    const mgr = getActiveManagerForStage(bridge, curStage);

    monsters.forEach(m => {
      if (!m || !m.group || !m.group.visible || m._milanFurzKnockedDown) return;
      const mPos = m.group.position;

      // In Bibliothek & Labyrinth sicherstellen, dass Fleischi nie unsichtbar wird
      if (curStage === 'library' || curStage === 'labyrinth' || curStage === 'gym') {
        m.group.visible = true;
      }

      let bestTarget = null;
      let bestScore = Infinity;
      for (const c of candidates) {
        const horizDist = Math.hypot(c.x - mPos.x, c.z - mPos.z);
        const vertDiff = Math.abs(c.y - mPos.y);
        if (vertDiff > 3.2 && curStage === 'labyrinth') continue;
        const score = horizDist * c.noiseWeight;
        if (score < bestScore) {
          bestScore = score;
          bestTarget = c;
        }
      }

      // Wenn ein Remote-Spieler näher/lauter ist als der Host -> Fleischi aktiv auf diesen Mitspieler lenken!
      if (bestTarget && !bestTarget.isLocal) {
        const dx = bestTarget.x - mPos.x;
        const dz = bestTarget.z - mPos.z;
        const dist = Math.hypot(dx, dz);
        const detectRadius = curStage === 'gym' ? 45.0 : (curStage === 'library' ? 18.0 : 22.0);
        if (dist > 0.85 && dist < detectRadius) {
          const speed = (mgr && mgr.monsterSpeed) ? mgr.monsterSpeed : 4.8;
          mPos.x += (dx / dist) * speed * dt;
          mPos.z += (dz / dist) * speed * dt;
          m.group.lookAt(bestTarget.x, mPos.y, bestTarget.z);
          if (typeof m.animate === 'function') m.animate(dt, true, true);
        }
      }
    });
  }

  // ============================================================================
  // 4. SPORTHALLEN-BOSSKAMPF ACTION-UPGRADE (SCHOCKWELLEN & SCHATTEN-JÄGER)
  // ============================================================================
  const bossShockwaves = [];
  const bossMinions = [];
  let lastShockwaveSpawn = 0;
  let lastMinionSpawn = 0;
  let bossFightElapsed = 0;

  function updateGymBossEnhancements(bridge, curStage, dt, now) {
    const bossHud = document.getElementById('fns-gym-boss-hud');
    const THREE = window.THREE;
    if (curStage !== 'gym' || !THREE) {
      if (bossHud) bossHud.style.display = 'none';
      if (bossShockwaves.length > 0 || bossMinions.length > 0) {
        bossShockwaves.forEach(sw => sw.mesh.parent && sw.mesh.parent.remove(sw.mesh));
        bossMinions.forEach(mn => mn.entity.group.parent && mn.entity.group.parent.remove(mn.entity.group));
        bossShockwaves.length = 0;
        bossMinions.length = 0;
        bossFightElapsed = 0;
      }
      return;
    }

    const scene = bridge.getScene();
    const player = bridge.getPlayer();
    const camera = bridge.getCamera();
    const audio = bridge.getAudio();
    const gym = bridge.getGymBoss && bridge.getGymBoss();
    if (!scene || !player || !camera || !gym) return;

    bossFightElapsed += dt;
    if (bossHud) {
      bossHud.style.display = 'block';
      const phase = bossFightElapsed > 40 ? 'PHASE III (RASEREI)' : (bossFightElapsed > 18 ? 'PHASE II (SCHATTENJAGD)' : 'PHASE I (ERWACHEN)');
      const titleEl = document.getElementById('fns-gym-boss-title');
      if (titleEl) titleEl.textContent = `SPORTHALLEN-ALPHA FLEISCHI // ${phase}`;
    }

    const bossEntities = getStageMonsterEntities(bridge, 'gym');
    const mainBoss = bossEntities[0];

    // 1. Alle 8.5 Sekunden: Rote 3D-Boden-Schockwelle vom Boss, über die man mit SPACE springen muss!
    if (mainBoss && mainBoss.group && now - lastShockwaveSpawn > 8500) {
      lastShockwaveSpawn = now;
      if (audio && audio.playMidnightGong) audio.playMidnightGong();

      const ringGeo = new THREE.RingGeometry(0.6, 1.35, 40);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff2200,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(mainBoss.group.position.x, 0.12, mainBoss.group.position.z);
      scene.add(ringMesh);
      bossShockwaves.push({
        mesh: ringMesh,
        originX: mainBoss.group.position.x,
        originZ: mainBoss.group.position.z,
        radius: 1.0,
        hitLocal: false
      });
    }

    for (let i = bossShockwaves.length - 1; i >= 0; i--) {
      const sw = bossShockwaves[i];
      sw.radius += dt * 11.5;
      sw.mesh.scale.setScalar(sw.radius);
      sw.mesh.material.opacity = Math.max(0, 1.0 - sw.radius / 28.0);

      const pDist = Math.hypot(player.position.x - sw.originX, player.position.z - sw.originZ);
      // Wenn der Schockwellen-Ring den Spieler am Boden trifft (und man nicht springt!)
      if (!sw.hitLocal && Math.abs(pDist - sw.radius) < 0.75 && player.jumpOffset < 0.25) {
        sw.hitLocal = true;
        if (audio && audio.playMetalBang) audio.playMetalBang();
        player.waterPenalty = 0.55;
        setTimeout(() => { if (player) player.waterPenalty = 1.0; }, 1600);
      }

      if (sw.radius >= 28.0) {
        if (sw.mesh.parent) sw.mesh.parent.remove(sw.mesh);
        bossShockwaves.splice(i, 1);
      }
    }

    // 2. Schatten-Jäger: Spawnen im Bosskampf am Hallenrand, lösen sich auf wenn man sie direkt anschaut!
    if (mainBoss && mainBoss.group && bossMinions.length < 2 && now - lastMinionSpawn > 13000) {
      lastMinionSpawn = now;
      const CloneCls = mainBoss.constructor;
      if (typeof CloneCls === 'function') {
        const minionEnt = new CloneCls();
        minionEnt.__isBossMinion = true;
        minionEnt.group.scale.setScalar(0.76);
        const ang = Math.random() * Math.PI * 2;
        minionEnt.group.position.set(
          player.position.x + Math.cos(ang) * 14.0,
          0,
          player.position.z + Math.sin(ang) * 14.0
        );
        scene.add(minionEnt.group);
        bossMinions.push({ entity: minionEnt, lookBanishTimer: 0 });
      }
    }

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    if (camDir.lengthSq() > 0.001) camDir.normalize();

    for (let i = bossMinions.length - 1; i >= 0; i--) {
      const mn = bossMinions[i];
      const g = mn.entity.group;
      const toMinion = new THREE.Vector3(g.position.x - player.position.x, 0, g.position.z - player.position.z);
      const dist = toMinion.length();
      if (dist > 0.001) toMinion.divideScalar(dist);

      // Schaut der Spieler den Schatten-Jäger direkt an? -> Er verbrennt/löst sich auf!
      if (camDir.dot(toMinion) > 0.82 && dist < 16.0) {
        mn.lookBanishTimer += dt;
        g.position.x += (Math.random() - 0.5) * 0.12;
        if (mn.lookBanishTimer >= 0.85) {
          if (audio && audio.playKeyPickup) audio.playKeyPickup();
          if (g.parent) g.parent.remove(g);
          bossMinions.splice(i, 1);
          continue;
        }
      } else {
        mn.lookBanishTimer = Math.max(0, mn.lookBanishTimer - dt * 0.5);
        g.position.x -= toMinion.x * 3.9 * dt;
        g.position.z -= toMinion.z * 3.9 * dt;
        g.lookAt(player.position.x, 0, player.position.z);
        if (mn.entity.animate) mn.entity.animate(dt, true, true);
      }
    }
  }

  // ============================================================================
  // 5. KOOP WELT-INTERAKTIONEN & NETZWERK-SYNC
  // ============================================================================
  function hookCooperativeWorldActions() {
    const bridge = window.__fnsGameBridge;
    if (!bridge) return;

    const l1 = bridge.getLevel01 && bridge.getLevel01();
    if (l1 && !l1.__mpHooked) {
      l1.__mpHooked = true;
      const origDrawer = l1.openDeskDrawer.bind(l1);
      l1.openDeskDrawer = function () {
        const wasRead = this.hasLaptopBeenRead;
        origDrawer();
        if (!wasRead && !this.__mpSilent) queueWorldEvent({ type: 'drawer_open' });
      };
      const origPickup = l1.pickupKey.bind(l1);
      l1.pickupKey = function () {
        const hadKey = this.hasKey;
        origPickup();
        if (!hadKey && this.hasKey && !this.__mpSilent) queueWorldEvent({ type: 'key_pickup' });
      };
      const origUseKey = l1.useKeyOnDoor.bind(l1);
      l1.useKeyOnDoor = function () {
        const wasAct = this.clockActivated;
        origUseKey();
        if (!wasAct && this.clockActivated && !this.__mpSilent) queueWorldEvent({ type: 'key_insert' });
      };
      const origUnlock = l1.unlockAndOpenDoor.bind(l1);
      l1.unlockAndOpenDoor = function () {
        const wasOpen = this.doorOpen;
        origUnlock();
        if (!wasOpen && this.doorOpen && !this.__mpSilent) queueWorldEvent({ type: 'door_unlock' });
      };
    }

    const term = bridge.getTerminal && bridge.getTerminal();
    if (term && !term.__mpHooked) {
      term.__mpHooked = true;
      const origAppend = term.appendToken.bind(term);
      term.appendToken = function (tok) {
        origAppend(tok);
        if (!this.__mpSilent) queueWorldEvent({ type: 'terminal_input', value: this.currentInput });
      };
    }

    const hall = bridge.getHallway && bridge.getHallway();
    if (hall && !hall.__mpHooked) {
      hall.__mpHooked = true;
      const origPress = hall.pressHoveredButton.bind(hall);
      hall.pressHoveredButton = function (rc) {
        const wasSolved = this.elevatorSolved;
        const res = origPress(rc);
        if (!wasSolved && this.elevatorSolved && !this.__mpSilent) queueWorldEvent({ type: 'elevator_solve' });
        return res;
      };
    }

    const fr = bridge.getFleischrooms && bridge.getFleischrooms();
    if (fr && !fr.__mpSpawnHooked) {
      fr.__mpSpawnHooked = true;
      const origSpawn = fr.spawnMonsterBehindPlayer.bind(fr);
      fr.spawnMonsterBehindPlayer = function (dist) {
        origSpawn(dist);
        if (!this.__mpSilent && this.monsterGroup) {
          queueWorldEvent({
            type: 'fleisch_monster_spawn',
            x: +this.monsterGroup.position.x.toFixed(2),
            z: +this.monsterGroup.position.z.toFixed(2)
          });
        }
      };
    }
    if (fr && fr.logic && !fr.logic.__mpHooked) {
      fr.logic.__mpHooked = true;
      const origDoorInteract = fr.logic.onDoorInteract.bind(fr.logic);
      fr.logic.onDoorInteract = function (hingeGroup) {
        const wasOpened = hingeGroup && hingeGroup.userData && hingeGroup.userData.opened;
        origDoorInteract(hingeGroup);
        if (!wasOpened && hingeGroup && hingeGroup.userData && hingeGroup.userData.opened && !fr.__mpSilent) {
          const wp = hingeGroup.userData.worldPos;
          if (wp) {
            const doorKey = `${wp.x.toFixed(1)},${wp.z.toFixed(1)}`;
            appliedWorld.fleischDoors.add(doorKey);
            queueWorldEvent({ type: 'fleisch_door', doorKey });
          }
        }
      };
    }

    const boiler = bridge.getBoiler && bridge.getBoiler();
    if (boiler && !boiler.__mpHooked && typeof boiler.turnValve === 'function') {
      boiler.__mpHooked = true;
      const origTurn = boiler.turnValve.bind(boiler);
      boiler.turnValve = function (vData) {
        const wasTurned = vData && vData.turned;
        origTurn(vData);
        if (!wasTurned && vData && vData.turned && !this.__mpSilent) {
          appliedWorld.boilerValves.add(vData.index);
          queueWorldEvent({ type: 'boiler_valve', index: vData.index });
        }
      };
    }
    const lib = bridge.getLibrary && bridge.getLibrary();
    if (lib && !lib.__mpHooked) {
      lib.__mpHooked = true;
      const origPull = lib.pullWallSconce.bind(lib);
      lib.pullWallSconce = function (sData) {
        const wasPulled = sData && sData.pulled;
        origPull(sData);
        if (!wasPulled && sData && sData.pulled && !this.__mpSilent) {
          appliedWorld.libraryLevers.add(sData.id);
          queueWorldEvent({ type: 'library_lever', index: sData.id });
        }
      };
      const origGlass = lib.alertFleischisToGlassSound.bind(lib);
      lib.alertFleischisToGlassSound = function (gx, gz) {
        origGlass(gx, gz);
        if (!this.__mpSilent) {
          queueWorldEvent({ type: 'library_glass', x: +gx.toFixed(2), z: +gz.toFixed(2) });
        }
      };
    }

    const sch = bridge.getSchoolLevel && bridge.getSchoolLevel();
    if (sch && !sch.__mpHooked) {
      sch.__mpHooked = true;
      const origStairDoor = sch.interactStairDoor.bind(sch);
      sch.interactStairDoor = function (doorData) {
        const wasOpen = doorData && doorData.opened;
        origStairDoor(doorData);
        if (!wasOpen && doorData && doorData.opened && !this.__mpSilent) {
          appliedWorld.schoolStairDoors.add(String(doorData.label));
          queueWorldEvent({ type: 'school_stair_door', label: String(doorData.label) });
        }
      };
    }

    if (window.milanMode && !window.milanMode.__mpHooked) {
      window.milanMode.__mpHooked = true;
      const origFurz = window.milanMode.triggerFurz.bind(window.milanMode);
      window.milanMode.triggerFurz = function () {
        const ok = origFurz();
        if (ok) {
          const p = bridge.getPlayer && bridge.getPlayer()?.position;
          if (p) queueWorldEvent({ type: 'furz', x: p.x, y: p.y, z: p.z });
        }
        return ok;
      };
    }
  }

  function applyServerWorldState(ws) {
    if (!ws) return;
    const bridge = window.__fnsGameBridge;
    if (!bridge) return;

    const l1 = bridge.getLevel01 && bridge.getLevel01();
    const term = bridge.getTerminal && bridge.getTerminal();
    const physics = bridge.getPhysics && bridge.getPhysics();
    const hall = bridge.getHallway && bridge.getHallway();
    const fr = bridge.getFleischrooms && bridge.getFleischrooms();
    const sch = bridge.getSchoolLevel && bridge.getSchoolLevel();
    const player = bridge.getPlayer && bridge.getPlayer();
    const camera = bridge.getCamera && bridge.getCamera();

    if (l1) {
      if (ws.drawerOpen && !appliedWorld.drawerOpen) {
        appliedWorld.drawerOpen = true;
        l1.__mpSilent = true;
        l1.openDeskDrawer();
        l1.__mpSilent = false;
      }
      if (ws.keyPickedUp && !appliedWorld.keyPickedUp) {
        appliedWorld.keyPickedUp = true;
        l1.__mpSilent = true;
        if (!l1.hasLaptopBeenRead) l1.openDeskDrawer();
        l1.pickupKey();
        l1.__mpSilent = false;
      }
      if (ws.keyInserted && !appliedWorld.keyInserted) {
        appliedWorld.keyInserted = true;
        l1.__mpSilent = true;
        l1.hasKey = true;
        l1.useKeyOnDoor();
        l1.__mpSilent = false;
      }
      if (typeof ws.terminalInput === 'string' && ws.terminalInput !== appliedWorld.terminalInput && !ws.doorUnlocked) {
        appliedWorld.terminalInput = ws.terminalInput;
        if (term) term.currentInput = ws.terminalInput;
        if (l1.isTerminalUnlockedOnDoor) {
          l1.updateDoorTerminalScreen(ws.terminalInput, 'normal');
        }
      }
      if (ws.doorUnlocked && !appliedWorld.doorUnlocked) {
        appliedWorld.doorUnlocked = true;
        l1.__mpSilent = true;
        if (physics) physics.unlockDoor();
        l1.unlockAndOpenDoor();
        l1.__mpSilent = false;
      }
    }

    if (hall && ws.elevatorSolved && !appliedWorld.elevatorSolved && !hall.elevatorSolved) {
      appliedWorld.elevatorSolved = true;
      hall.elevatorSolved = true;
      if (player && camera && player.position.z > -50.2) {
        player.position.set(0, 1.6, -51.2);
        camera.position.set(0, 1.6, -51.2);
      }
      hall.closeElevatorDoors();
      const btn9 = (hall.elevatorButtons || []).find(b => b.userData && b.userData.digit === '9');
      if (btn9) {
        btn9.material.map = hall.createButtonTexture('9', '#004411', '#00ff66', '#00ff66');
        btn9.material.needsUpdate = true;
      }
      setTimeout(() => {
        if (bridge.getAudio()) bridge.getAudio().playCableSnap();
        hall.corridorGroup.visible = false;
        if (hall.monsterGroup) hall.monsterGroup.visible = false;
        hall.isFalling = true;
        hall.fallTimer = 0;
      }, 250);
    }

    if (fr && Array.isArray(ws.fleischDoors)) {
      ws.fleischDoors.forEach(dKey => {
        if (appliedWorld.fleischDoors.has(dKey)) return;
        const matchMesh = (fr.doorMeshes || []).find(m => {
          const hg = m.userData && m.userData.hingeGroup;
          const wp = hg && hg.userData && hg.userData.worldPos;
          if (!wp) return false;
          return `${wp.x.toFixed(1)},${wp.z.toFixed(1)}` === dKey;
        });
        if (matchMesh && matchMesh.userData.hingeGroup) {
          appliedWorld.fleischDoors.add(dKey);
          fr.__mpSilent = true;
          fr.logic.__mpRemoteDoor = true;
          fr.logic.onDoorInteract(matchMesh.userData.hingeGroup);
          fr.logic.__mpRemoteDoor = false;
          fr.__mpSilent = false;
        }
      });
    }

    const lib = bridge.getLibrary && bridge.getLibrary();
    const boiler = bridge.getBoiler && bridge.getBoiler();
    if (boiler && Array.isArray(ws.boilerValves)) {
      ws.boilerValves.forEach(vIdx => {
        if (appliedWorld.boilerValves.has(vIdx)) return;
        const vObj = (boiler.valves || []).find(v => v.index === vIdx);
        if (vObj && !vObj.turned && typeof boiler.turnValve === 'function') {
          appliedWorld.boilerValves.add(vIdx);
          boiler.__mpSilent = true;
          boiler.turnValve(vObj);
          boiler.__mpSilent = false;
        }
      });
    }
    if (lib && Array.isArray(ws.libraryLevers)) {
      ws.libraryLevers.forEach(lid => {
        if (appliedWorld.libraryLevers.has(lid)) return;
        const sObj = (lib.sconceLevers || []).find(s => s.id === lid);
        if (sObj && !sObj.pulled) {
          appliedWorld.libraryLevers.add(lid);
          lib.__mpSilent = true;
          lib.pullWallSconce(sObj);
          lib.__mpSilent = false;
        }
      });
    }

    if (sch && Array.isArray(ws.schoolStairDoors)) {
      ws.schoolStairDoors.forEach(lbl => {
        if (appliedWorld.schoolStairDoors.has(lbl)) return;
        const dObj = (sch.stairDoors || []).find(d => String(d.label) === String(lbl));
        if (dObj && !dObj.opened) {
          appliedWorld.schoolStairDoors.add(lbl);
          sch.__mpSilent = true;
          sch.interactStairDoor(dObj);
          sch.__mpSilent = false;
        }
      });
    }

    if (Array.isArray(ws.monsters) && ws.monstersStage) {
      latestServerMonstersStage = ws.monstersStage;
      latestServerMonsters = ws.monsters;
    }
  }

  async function syncWithServer() {
    if (!activeLobby || syncInFlight) return;
    const bridge = window.__fnsGameBridge;
    if (!bridge) return;

    const curStage = bridge.getStage();
    if (curStage === 'menu') {
      leaveCurrentLobby();
      return;
    }

    const player = bridge.getPlayer();
    const camera = bridge.getCamera();
    const THREE = window.THREE;
    if (!player || !camera || !THREE) return;

    syncInFlight = true;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion, 'YXZ');
    const keys = player.keys || {};
    const isMoving = !!(keys.w || keys.a || keys.s || keys.d);

    const sch = bridge.getSchoolLevel && bridge.getSchoolLevel();
    const activeLockerId = (sch && sch.activeLocker && typeof sch.activeLocker.id === 'number')
      ? sch.activeLocker.id
      : -1;
    const atLaptop = !!(bridge.isAtLaptop && bridge.isAtLaptop());
    const grabbed = !!(bridge.isBeingGrabbed && bridge.isBeingGrabbed());
    const grabTimer = (bridge.getGrabTimer && bridge.getGrabTimer()) || 0;

    if (grabbed && !wasGrabbedLastSync) {
      queueWorldEvent({
        type: 'player_grabbed',
        targetId: playerId,
        x: +player.position.x.toFixed(2),
        y: +player.position.y.toFixed(2),
        z: +player.position.z.toFixed(2)
      });
    }
    wasGrabbedLastSync = grabbed;

    let sendX = player.position.x;
    let sendY = player.position.y;
    let sendZ = player.position.z;
    if (activeLockerId >= 0 || grabbed) {
      sendX = camera.position.x;
      sendY = camera.position.y;
      sendZ = camera.position.z;
    } else if (atLaptop) {
      sendX = -1.72;
      sendY = 1.6;
      sendZ = 1.08;
    }

    let monstersPayload = null;
    if (curStage !== 'school') {
      const stageMonsters = getStageMonsterEntities(bridge, curStage);
      monstersPayload = stageMonsters.map(m => ({
        x: +m.group.position.x.toFixed(2),
        y: +m.group.position.y.toFixed(2),
        z: +m.group.position.z.toFixed(2),
        ry: +m.group.rotation.y.toFixed(2),
        vis: (curStage === 'library' || curStage === 'labyrinth' || curStage === 'gym') ? true : !!m.group.visible
      }));
    }

    const eventsBatch = outgoingEvents.splice(0, outgoingEvents.length);

    const payload = {
      lobbyId: activeLobby.id,
      playerId,
      playerName,
      color: playerColor,
      x: +sendX.toFixed(3),
      y: +sendY.toFixed(3),
      z: +sendZ.toFixed(3),
      yaw: +(atLaptop ? 0 : euler.y).toFixed(3),
      pitch: +(atLaptop ? -0.35 : euler.x).toFixed(3),
      crouch: !!keys.ctrl,
      moving: isMoving && !atLaptop && activeLockerId < 0 && !grabbed,
      sprinting: !!(keys.shift && isMoving),
      atLaptop,
      lockerId: activeLockerId,
      grabbed,
      grabTimer: +grabTimer.toFixed(2),
      stage: curStage,
      monsters: monstersPayload,
      lastEventTs,
      events: eventsBatch
    };

    try {
      const res = await fetch('/api/mp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        syncInFlight = false;
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        syncInFlight = false;
        return;
      }

      activeLobby.hostId = data.lobby.hostId;

      const serverStage = data.lobby.stage;
      const stageOrder = ['act1', 'fleischrooms', 'school', 'labyrinth', 'boiler', 'library', 'gym'];
      const localIdx = stageOrder.indexOf(curStage);
      const serverIdx = stageOrder.indexOf(serverStage);
      if (serverIdx > localIdx && serverIdx !== -1) {
        activeLobby.stage = serverStage;
        if (serverStage === 'gym' && bridge.startGymBossFight) {
          bridge.startGymBossFight();
        } else if (bridge.startGameFromMenu) {
          bridge.startGameFromMenu(serverStage, 'campaign');
        }
      }

      if (data.lobby.worldState) {
        applyServerWorldState(data.lobby.worldState);
      }

      if (Array.isArray(data.events)) {
        const fr = bridge.getFleischrooms && bridge.getFleischrooms();
        data.events.forEach(ev => {
          if (ev.ts > lastEventTs) lastEventTs = ev.ts;
          if (ev.type === 'furz' && window.milanMode && THREE) {
            const origin = new THREE.Vector3(ev.x, ev.y, ev.z);
            if (window.milanMode._spawn3DFurzSmoke) window.milanMode._spawn3DFurzSmoke(origin);
            if (window.milanMode._knockdownAllFleischies) window.milanMode._knockdownAllFleischies(origin);
            if (window.milanMode._playMegaFurzSound) window.milanMode._playMegaFurzSound();
          } else if (ev.type === 'fleisch_monster_spawn' && fr && fr.monsterGroup) {
            fr.__mpSilent = true;
            if (bridge.getAudio()) bridge.getAudio().playJumpscareSound();
            fr.isMonsterChasing = true;
            fr.chaseTimer = 11.0;
            fr.monsterGroup.position.set(ev.x, 0, ev.z);
            fr.monsterGroup.visible = true;
            fr.__mpSilent = false;
          } else if (ev.type === 'player_grabbed') {
            if (bridge.getAudio()) bridge.getAudio().playJumpscareSound();
          } else if (ev.type === 'fleisch_countdown' && fr && fr.logic && !fr.logic.countdownActive) {
            fr.logic.startCountdown(null);
          } else if (ev.type === 'library_glass') {
            const lib = bridge.getLibrary && bridge.getLibrary();
            if (lib) {
              lib.__mpSilent = true;
              lib.alertFleischisToGlassSound(ev.x, ev.z);
              lib.__mpSilent = false;
            }
          } else if (ev.type === 'library_reset') {
            const lib = bridge.getLibrary && bridge.getLibrary();
            if (lib && typeof lib.relocateFleischisAwayFrom === 'function') {
              lib.relocateFleischisAwayFrom(ev.x, ev.z);
            }
          } else if (ev.type === 'boss_damage') {
            const gym = bridge.getGymBoss && bridge.getGymBoss();
            if (gym && !gym.bossDead) {
              gym.bossHp = Math.max(0, gym.bossHp - (ev.damage || 35));
              gym.updateBossHUD();
              if (gym.bossHp <= 0) gym.triggerBossDefeat();
            }
          }
        });
      }

      const seenIds = new Set();
      const scene = bridge.getScene();
      const overlay = document.getElementById('fns-mp-overlay-layer');

      (data.players || []).forEach(pData => {
        seenIds.add(pData.id);
        let rp = remotePlayers.get(pData.id);
        if (!rp) {
          const avatar = buildBlockyCharacterAvatar(pData.color || '#00ff66');
          if (avatar && scene) scene.add(avatar.root);

          const nametagEl = document.createElement('div');
          nametagEl.className = 'fns-mp-nametag';
          if (overlay) overlay.appendChild(nametagEl);

          const edgeEl = document.createElement('div');
          edgeEl.className = 'fns-mp-edge-arrow';
          if (overlay) overlay.appendChild(edgeEl);

          rp = {
            id: pData.id,
            color: pData.color || '#00ff66',
            data: pData,
            avatar,
            nametagEl,
            edgeEl,
            lastLockerId: -1,
            occluded: false,
            lastLosCheck: 0
          };
          remotePlayers.set(pData.id, rp);
        } else {
          rp.data = pData;
          if (rp.avatar && rp.avatar.root && scene && rp.avatar.root.parent !== scene) {
            scene.add(rp.avatar.root);
          }
        }
      });

      for (const [id, rp] of remotePlayers.entries()) {
        if (!seenIds.has(id)) {
          if (rp.avatar && rp.avatar.root && rp.avatar.root.parent) {
            rp.avatar.root.parent.remove(rp.avatar.root);
          }
          if (rp.nametagEl) rp.nametagEl.remove();
          if (rp.edgeEl) rp.edgeEl.remove();
          remotePlayers.delete(id);
        }
      }
    } catch (e) {}
    syncInFlight = false;
  }

  setInterval(syncWithServer, 80);

  // ============================================================================
  // 6. 60 FPS RENDER-LOOP (SNEAK-POSE, MONSTER-INTERPOLATION & HORROR-NAMETAGS)
  // ============================================================================
  let lastFrameT = performance.now();
  let losRaycaster = null;

  function collectWallMeshes(scene) {
    const list = [];
    if (!scene) return list;
    scene.traverse(obj => {
      if (obj.isMesh && obj.visible && !obj.userData?.isRemotePlayer && !obj.userData?.isStickerPart) {
        list.push(obj);
      }
    });
    return list;
  }

  function updateMultiplayerLoop() {
    requestAnimationFrame(updateMultiplayerLoop);
    setupInlineMultiplayerMenu();
    hookCooperativeWorldActions();

    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrameT) / 1000);
    lastFrameT = now;

    const bridge = window.__fnsGameBridge;
    const THREE = window.THREE;
    if (!bridge || !THREE) return;

    const scene = bridge.getScene();
    const camera = bridge.getCamera();
    const curStage = bridge.getStage();
    if (!scene || !camera) return;

    // Sporthallen-Bosskampf Action-Erweiterung läuft sowohl im Solo als auch im Multiplayer!
    // GymBoss nutzt sein eigenes sauberes Warden-System in GymBossManager.js

    if (!activeLobby || curStage === 'menu') return;

    const isHost = activeLobby.hostId === playerId;
    if (!isHost && curStage === 'fleischrooms' && latestServerMonstersStage === 'fleischrooms' && latestServerMonsters.length > 0) {
      const fr = bridge.getFleischrooms && bridge.getFleischrooms();
      const md = latestServerMonsters[0];
      if (fr && fr.monsterGroup && md) {
        fr.monsterGroup.visible = !!md.vis;
        fr.isMonsterChasing = !!md.vis;
        if (md.vis) {
          fr.chaseTimer = Math.max(fr.chaseTimer || 0, 5.0);
          const targetMPos = new THREE.Vector3(md.x, md.y, md.z);
          if (fr.monsterGroup.position.distanceToSquared(targetMPos) > 36) {
            fr.monsterGroup.position.copy(targetMPos);
          } else {
            fr.monsterGroup.position.lerp(targetMPos, Math.min(1.0, dt * 16.0));
          }
          fr.monsterGroup.rotation.y = md.ry;
          if (fr.monsterEntity && typeof fr.monsterEntity.animate === 'function') {
            fr.monsterEntity.animate(dt, true, true);
          }
        }
      }
    }

    if (!losRaycaster) losRaycaster = new THREE.Raycaster();

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);

    const camForwardXZ = new THREE.Vector2(camDir.x, camDir.z);
    if (camForwardXZ.lengthSq() > 0.0001) camForwardXZ.normalize();
    const camRightXZ = new THREE.Vector2(-camForwardXZ.y, camForwardXZ.x);

    const W = window.innerWidth;
    const H = window.innerHeight;
    const sch = bridge.getSchoolLevel && bridge.getSchoolLevel();

    for (const rp of remotePlayers.values()) {
      const d = rp.data;
      const av = rp.avatar;
      if (!d || !av || !av.root) continue;

      const sameStage = !d.stage || d.stage === curStage;
      av.root.visible = sameStage;
      if (!sameStage) {
        rp.nametagEl.style.display = 'none';
        rp.edgeEl.style.display = 'none';
        continue;
      }

      const remLockerId = typeof d.lockerId === 'number' ? d.lockerId : -1;
      if (remLockerId !== rp.lastLockerId) {
        if (sch && Array.isArray(sch.lockers)) {
          const lObj = sch.lockers[remLockerId >= 0 ? remLockerId : rp.lastLockerId];
          if (lObj && lObj.doorHinge) {
            if (bridge.getAudio()) bridge.getAudio().playDrawerSlide();
            let t = 0;
            const swingLockerDoor = () => {
              t += 0.08;
              if (t < 1.0) {
                lObj.doorHinge.rotation.y = -Math.sin(t * Math.PI) * 1.65;
                requestAnimationFrame(swingLockerDoor);
              } else {
                lObj.doorHinge.rotation.y = 0;
              }
            };
            swingLockerDoor();
          }
        }
        rp.lastLockerId = remLockerId;
      }

      let targetFootY = (typeof d.y === 'number' ? d.y : 1.6) - (d.crouch ? 0.85 : 1.6);
      let targetX = d.x || 0;
      let targetZ = d.z || 0;
      let targetYaw = d.yaw || 0;

      if (remLockerId >= 0 && sch && Array.isArray(sch.lockers) && sch.lockers[remLockerId]) {
        const lk = sch.lockers[remLockerId];
        targetX = lk.hideWorldPos.x;
        targetFootY = 0;
        targetZ = lk.hideWorldPos.z;
        targetYaw = lk.lookRotY;
      }

      if (d.grabbed) {
        targetX += (Math.random() - 0.5) * 0.08;
        targetZ += (Math.random() - 0.5) * 0.08;
      }

      const targetPos = new THREE.Vector3(targetX, targetFootY, targetZ);
      if (av.root.position.distanceToSquared(targetPos) > 64) {
        av.root.position.copy(targetPos);
      } else {
        av.root.position.lerp(targetPos, Math.min(1.0, dt * 15.0));
      }

      av.root.rotation.y = targetYaw;
      const clampedPitch = Math.max(-0.75, Math.min(0.75, -(d.pitch || 0)));

      // Flüssiger Blend-Faktor für die Blocky Sneak-Animation (STRG)
      const targetSneak = (d.crouch && !d.grabbed && !d.atLaptop) ? 1.0 : 0.0;
      av.sneakBlend += (targetSneak - (av.sneakBlend || 0)) * Math.min(1.0, dt * 14.0);
      const sb = av.sneakBlend;

      if (d.grabbed) {
        const panic = performance.now() * 0.035;
        av.bodyPivot.position.y = 0;
        av.torsoPivot.position.set(0, 0.72, 0);
        av.torsoPivot.rotation.x = -0.15;
        av.headPivot.position.set(0, 1.38, 0);
        av.headPivot.rotation.x = clampedPitch;
        av.headPivot.rotation.z = Math.sin(panic * 1.5) * 0.25;
        av.leftArmPivot.position.set(-0.32, 1.36, 0);
        av.rightArmPivot.position.set(0.32, 1.36, 0);
        av.leftArmPivot.rotation.x = -2.2 + Math.sin(panic) * 0.6;
        av.rightArmPivot.rotation.x = -2.2 + Math.cos(panic) * 0.6;
        av.leftLegPivot.position.set(-0.11, 0.68, 0);
        av.rightLegPivot.position.set(0.11, 0.68, 0);
        av.leftLegPivot.rotation.x = Math.sin(panic * 1.3) * 0.7;
        av.rightLegPivot.rotation.x = -Math.sin(panic * 1.3) * 0.7;
      } else if (d.atLaptop) {
        av.bodyPivot.position.y = -0.08;
        av.torsoPivot.position.set(0, 0.72, -0.04);
        av.torsoPivot.rotation.x = 0.28;
        av.headPivot.position.set(0, 1.34, 0.14);
        av.headPivot.rotation.x = 0.35;
        av.headPivot.rotation.z = 0;
        const typeWave = Math.sin(performance.now() * 0.025) * 0.12;
        av.leftArmPivot.position.set(-0.32, 1.30, 0.12);
        av.rightArmPivot.position.set(0.32, 1.30, 0.12);
        av.leftArmPivot.rotation.x = -1.15 + typeWave;
        av.rightArmPivot.rotation.x = -1.15 - typeWave;
        av.leftLegPivot.position.set(-0.11, 0.68, 0);
        av.rightLegPivot.position.set(0.11, 0.68, 0);
        av.leftLegPivot.rotation.x = 0;
        av.rightLegPivot.rotation.x = 0;
      } else {
        // KLASSISCHE VOXEL SNEAK-POSE:
        // Oberkörper neigt sich um die Hüfte um 0.48 rad (~28 Grad) nach vorne (+Z),
        // Becken geht leicht nach hinten (-0.07m) und tiefer (-0.16m),
        // Kopf und Schultern wandern exakt mit der Halskante nach vorne (+0.22m),
        // sodass der Kopf sauber auf dem geneigten Oberkörper sitzt!
        av.headPivot.rotation.z = 0;
        av.bodyPivot.position.y = -0.16 * sb;

        av.torsoPivot.position.set(0, 0.72 - 0.04 * sb, -0.07 * sb);
        av.torsoPivot.rotation.x = 0.48 * sb;

        av.headPivot.position.set(0, 1.38 - 0.11 * sb, 0.22 * sb);
        av.headPivot.rotation.x = clampedPitch;

        av.leftArmPivot.position.set(-0.32, 1.36 - 0.10 * sb, 0.18 * sb);
        av.rightArmPivot.position.set(0.32, 1.36 - 0.10 * sb, 0.18 * sb);

        av.leftLegPivot.position.set(-0.11, 0.68 - 0.02 * sb, -0.07 * sb);
        av.rightLegPivot.position.set(0.11, 0.68 - 0.02 * sb, -0.07 * sb);

        if (d.moving) {
          const rate = d.sprinting ? 13.0 : (d.crouch ? 6.2 : 8.5);
          av.walkPhase += dt * rate;
          const amp = d.sprinting ? 0.78 : (d.crouch ? 0.36 : 0.52);
          const swing = Math.sin(av.walkPhase) * amp;
          av.leftArmPivot.rotation.x = 0.38 * sb + swing;
          av.rightArmPivot.rotation.x = 0.30 * sb - swing * 0.5 - 0.35;
          av.leftLegPivot.rotation.x = -0.15 * sb - swing;
          av.rightLegPivot.rotation.x = -0.15 * sb + swing;
        } else {
          av.leftArmPivot.rotation.x = 0.38 * sb;
          av.rightArmPivot.rotation.x = 0.25 * sb - 0.32;
          av.leftLegPivot.rotation.x = -0.15 * sb;
          av.rightLegPivot.rotation.x = -0.15 * sb;
        }
      }

      // Horror-NameTag & Seitenrand-Pfeil
      const pal = getPaletteEntry(d.color || rp.color);
      const headWorld = new THREE.Vector3(
        av.root.position.x,
        av.root.position.y + (d.crouch ? 1.66 : 1.98),
        av.root.position.z
      );

      const toOtherXZ = new THREE.Vector2(headWorld.x - camPos.x, headWorld.z - camPos.z);
      const horizLen = toOtherXZ.length();
      if (horizLen > 0.001) toOtherXZ.divideScalar(horizLen);

      const forwardDot = camForwardXZ.dot(toOtherXZ);
      const rightDot = camRightXZ.dot(toOtherXZ);

      const projected = headWorld.clone().project(camera);
      const isInFront = projected.z < 1.0 && forwardDot > 0.15;
      const screenX = (projected.x * 0.5 + 0.5) * W;
      const screenY = (-projected.y * 0.5 + 0.5) * H;
      const isOnScreen = isInFront && screenX >= 32 && screenX <= W - 32 && screenY >= 24 && screenY <= H - 24;

      if (isOnScreen) {
        if (now - rp.lastLosCheck > 140) {
          rp.lastLosCheck = now;
          const dirToHead = headWorld.clone().sub(camPos);
          const totalDist = dirToHead.length();
          if (totalDist > 0.5) {
            dirToHead.normalize();
            losRaycaster.set(camPos, dirToHead);
            losRaycaster.far = totalDist - 0.35;
            const walls = collectWallMeshes(scene);
            const hits = losRaycaster.intersectObjects(walls, false);
            rp.occluded = hits.length > 0;
          } else {
            rp.occluded = false;
          }
        }

        rp.edgeEl.style.display = 'none';
        rp.nametagEl.style.display = 'block';
        rp.nametagEl.style.left = `${screenX}px`;
        rp.nametagEl.style.top = `${screenY}px`;
        rp.nametagEl.style.color = pal.hex;
        rp.nametagEl.style.textShadow = `0 0 10px rgba(${pal.rgb}, 0.85), 2px 2px 0 #000, -1px -1px 0 #000`;
        rp.nametagEl.style.opacity = rp.occluded ? '0.32' : '0.96';
        rp.nametagEl.classList.toggle('grabbed-panic', !!d.grabbed);
        rp.nametagEl.textContent = d.grabbed ? `☠ ${d.name} ☠` : d.name;
      } else {
        rp.nametagEl.style.display = 'none';
        rp.edgeEl.style.display = 'flex';

        const isRightSide = rightDot >= 0;
        rp.edgeEl.className = `fns-mp-edge-arrow ${isRightSide ? 'edge-right' : 'edge-left'}`;

        const clampedY = Math.max(60, Math.min(H - 60, isInFront ? screenY : H * 0.5));
        rp.edgeEl.style.top = `${clampedY}px`;
        rp.edgeEl.style.filter = `drop-shadow(0 0 8px rgba(${pal.rgb}, 0.95)) drop-shadow(0 2px 4px #000)`;

        rp.edgeEl.innerHTML = isRightSide
          ? `<svg width="24" height="38" viewBox="0 0 24 38"><polygon points="4,2 22,19 4,36" fill="${pal.hex}" stroke="#080303" stroke-width="2.5"/></svg>`
          : `<svg width="24" height="38" viewBox="0 0 24 38"><polygon points="20,2 2,19 20,36" fill="${pal.hex}" stroke="#080303" stroke-width="2.5"/></svg>`;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(updateMultiplayerLoop));
  } else {
    requestAnimationFrame(updateMultiplayerLoop);
  }
})();
