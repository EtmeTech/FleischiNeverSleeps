/**
 * FleischiNeverSleeps - StickerManager (v8 - Zero Frame-Drop Edition)
 * - Eliminiert Shader-Recompiles (kein PointLight-Add/Remove mehr, reines Additive-Glow)
 * - Vorab-Caching aller Texturen & Geometrien (0ms Spawn-Cost)
 * - 1 einzelnes THREE.Points-Objekt statt 26 Einzel-Meshes pro Sticker
 * - Schnelle 2D-AABB-Raumprüfung statt tausender Raycasts beim Spawnen
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'fleischi_stickers_save_v1';
  const GOLD_SPAWN_CHANCE = 0.22;
  const PICKUP_RADIUS = 1.95;
  const STICKER_HEIGHT_OFFSET = 0.72;

    const STICKER_DEFS = [
    {
      id: 'gang',
      name: 'Absolute Cinema',
      file: '/assets/Sticker/AbsuluteCinema.webp',
      levelGroup: 'gang',
      levelName: 'Der Gang',
      multiSpawn: false,
      showOnMap: false,
      strategy: 'hallway_outside_room'
    },
    {
      id: 'fleischrooms',
      name: 'Absolute Depression',
      file: '/assets/Sticker/AbsuluteDeprision.webp',
      levelGroup: 'fleischrooms',
      levelName: 'Fleischrooms I',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'fleischrooms_1'
    },
    {
      id: 'fleischrooms_konfi',
      name: 'Konfirmandenbläsle',
      file: '/assets/Sticker/AbsuluteKonfirmandenblasle.png',
      levelGroup: 'fleischrooms',
      levelName: 'Fleischrooms II',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'fleischrooms_2'
    },
    {
      id: 'fleischrooms_zwei',
      name: 'Es riecht nach einer 2',
      file: '/assets/Sticker/EsRiechtNachEiner2.png',
      levelGroup: 'fleischrooms',
      levelName: 'Fleischrooms III',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'fleischrooms_3'
    },
    {
      id: 'school_hallway',
      name: 'Date vs. Nachsitzen',
      file: '/assets/Sticker/DateVsNachsitzen.webp',
      levelGroup: 'school_hallway',
      levelName: 'School Hallway',
      multiSpawn: false,
      showOnMap: false,
      strategy: 'school_middle'
    },
    {
      id: 'potenz_treppenhaus',
      name: 'Logik ruft an',
      file: '/assets/Sticker/LogikRuftAn.webp',
      levelGroup: 'potenz_treppenhaus',
      levelName: '2er-Potenzen',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'staircase_landing'
    },
    {
      id: 'mega_labyrinth',
      name: 'Fleischi Spiderman',
      file: '/assets/Sticker/FleischiSpiderman.webp',
      levelGroup: 'mega_labyrinth',
      levelName: 'Mega Labyrinth I',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'labyrinth_floor_0'
    },
    {
      id: 'labyrinth_energizer',
      name: 'Energizer',
      file: '/assets/Sticker/Energizer.png',
      levelGroup: 'mega_labyrinth',
      levelName: 'Mega Labyrinth II',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'labyrinth_floor_minus1'
    },
    {
      id: 'labyrinth_grrr',
      name: 'Fleischi Grrr',
      file: '/assets/Sticker/FleischiGrrr.png',
      levelGroup: 'mega_labyrinth',
      levelName: 'Mega Labyrinth III',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'labyrinth_floor_plus1'
    },
    {
      id: 'heizungskeller',
      name: 'Nice.',
      file: '/assets/Sticker/nice.webp',
      levelGroup: 'heizungskeller',
      levelName: 'Heizungskeller',
      multiSpawn: false,
      attachToRaft: true,
      showOnMap: false,
      strategy: 'raft_mid'
    },
    {
      id: 'bibliothek',
      name: 'Yesss!',
      file: '/assets/Sticker/Yesss.webp',
      levelGroup: 'bibliothek',
      levelName: 'Bibliothek',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'library_aisle'
    },
    {
      id: 'fleischi_secret',
      name: 'Fleischi?',
      file: '/assets/Sticker/FleischiQuestion.webp',
      fallbackFile: '/assets/Sticker/Fleischi%3F.webp',
      levelGroup: 'secret',
      levelName: '???',
      isEighthSticker: true,
      multiSpawn: true,
      showOnMap: true,
      strategy: 'secret_spread'
    }
  ];

  // --- SAVE STATE ---
  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          normal: parsed.normal || {},
          gold: parsed.gold || {},
          playthroughs: typeof parsed.playthroughs === 'number' ? parsed.playthroughs : 1,
          levelsSeen: parsed.levelsSeen || {},
          goldPity: parsed.goldPity || 0,
          forceGold: !!parsed.forceGold
        };
      }
    } catch (e) {}
    return { normal: {}, gold: {}, playthroughs: 1, levelsSeen: {}, goldPity: 0, forceGold: false };
  }

  function writeSave() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saveState));
    } catch (e) {}
  }

  const saveState = loadSave();

  function isSecondPlaythrough(levelKey) {
    if (saveState.forceGold || saveState.playthroughs >= 2) return true;
    const normalCount = STICKER_DEFS.filter(d => !d.isEighthSticker && saveState.normal[d.id]).length;
    if (normalCount >= 7) return true;
    if (levelKey && saveState.normal[levelKey] && (saveState.levelsSeen[levelKey] || 0) >= 1) return true;
    return false;
  }

  // --- GLOBAL POOLS & CACHES (Verhindert jegliche Frame-Drops beim Spawnen/Entfernen) ---
  const texturePool = {
    normal: {},
    gold: {},
    glowWhite: null,
    glowGold: null,
    rays: null,
    particleDot: null
  };
  let sharedPlaneGeo = null;
  let sharedOverlayGeo = null;
  let sharedParticleGeo = null;

  let currentScene = null;
  let currentCamera = null;
  let activeLevelKey = null;
  let activeLevelInstance = null;
  let activeSpawns = [];
  let cachedObstacleBoxes = [];
  let spawnTimeout = null;
  let rendererHooked = false;
  let isStickerMenuOpen = false;
  let lastSpawnPlayerPos = null;
  let levelLoadTimestamp = 0;
  let collectedInCurrentRun = {};

  (function hookCanvasFillText() {
    if (!window.CanvasRenderingContext2D) return;
    const origFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text) {
      try {
        const s = String(text || '').toUpperCase();
        if (this.canvas && !this.canvas.dataset?.fnsInternal) {
          if (s.includes('GESUCHTER AUSGANG') || s.includes('BIS 512') || s.includes('FOLGE:')) {
            this.canvas.__fnsPotenzSign = true;
          } else if (/2\s*[\^⁰¹²³⁴⁵⁶⁷⁸⁹]|TÜR\s*2/i.test(s)) {
            this.canvas.__fnsPotenzDoor = true;
          }
        }
      } catch (e) {}
      return origFillText.apply(this, arguments);
    };
  })();

  function ensureThreeHook() {
    const THREE = window.THREE;
    if (!THREE || rendererHooked) return;
    if (THREE.WebGLRenderer && THREE.WebGLRenderer.prototype) {
      const origRender = THREE.WebGLRenderer.prototype.render;
      THREE.WebGLRenderer.prototype.render = function (scene, camera) {
        if (scene && scene.isScene && camera && camera.isPerspectiveCamera) {
          if (currentScene && currentScene !== scene) {
            activeSpawns = [];
            collectedInCurrentRun = {};
          }
          currentScene = scene;
          currentCamera = camera;
        }
        return origRender.apply(this, arguments);
      };
      rendererHooked = true;
      initSharedResources();
    }
  }

  // --- SOUND (Wiederverwendeter AudioContext verhindert Audio-Freeze!) ---
  let sharedAudioCtx = null;
  function playLegoCollectSound(isGold) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
      if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();

      const ctx = sharedAudioCtx;
      const now = ctx.currentTime;
      const notes = isGold
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093.0]
        : [440.0, 554.37, 659.25, 880.0, 1108.73, 1318.51];

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isGold ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.001, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.15, now + idx * 0.08 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.5);
      });

      const finalTime = now + 1.2;
      [1046.5, 1567.98, 2093.0].forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, finalTime);
        gain.gain.setValueAtTime(0.001, finalTime);
        gain.gain.exponentialRampToValueAtTime(0.18, finalTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, finalTime + 0.75);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(finalTime);
        osc.stop(finalTime + 0.8);
      });
    } catch (e) {}
  }

  // --- SHARED TEXTURE & GEOMETRY POOL ---
  function createGlowTexture(c1, c2) {
    const canvas = document.createElement('canvas');
    canvas.dataset.fnsInternal = '1';
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0.0, c1);
    g.addColorStop(0.45, c2);
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new window.THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function createRaysTexture() {
    const canvas = document.createElement('canvas');
    canvas.dataset.fnsInternal = '1';
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.translate(128, 128);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / rays);
      const g = ctx.createLinearGradient(0, 0, 122, 0);
      g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      g.addColorStop(0.45, 'rgba(255, 252, 220, 0.55)');
      g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(122, -9);
      ctx.lineTo(122, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const tex = new window.THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function drawStickerCanvas(img, isGold) {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.dataset.fnsInternal = '1';
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, 256, 256);

    if (isGold) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const goldGrad = ctx.createLinearGradient(0, 0, 256, 256);
      goldGrad.addColorStop(0.0, '#ffd700');
      goldGrad.addColorStop(0.35, '#ffef8a');
      goldGrad.addColorStop(0.65, '#d4af37');
      goldGrad.addColorStop(1.0, '#ffae00');
      ctx.fillStyle = goldGrad;
      ctx.fillRect(0, 0, 256, 256);

      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255, 200, 20, 0.22)';
      ctx.fillRect(0, 0, 256, 256);

      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, 0, 0, 256, 256);
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function getOrLoadStickerTexture(def, isGold, cb) {
    const bank = isGold ? texturePool.gold : texturePool.normal;
    if (bank[def.id]) {
      cb(bank[def.id]);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      if (!window.THREE) return;
      texturePool.normal[def.id] = drawStickerCanvas(img, false);
      texturePool.gold[def.id] = drawStickerCanvas(img, true);
      cb(bank[def.id]);
    };
    img.onerror = function () {
      if (def.fallbackFile && img.src.indexOf('FleischiQuestion') !== -1) {
        img.src = def.fallbackFile;
      }
    };
    img.src = def.file;
  }

  function initSharedResources() {
    const THREE = window.THREE;
    if (!THREE || sharedPlaneGeo) return;

    sharedPlaneGeo = new THREE.PlaneGeometry(1.12, 1.12);
    sharedOverlayGeo = new THREE.PlaneGeometry(1.15, 1.15);

    // 1 einzelnes BufferGeometry für alle Glitzer-Partikel eines Stickers (1 Draw-Call statt 26!)
    const pCount = 20;
    const positions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const angle = (i / pCount) * Math.PI * 2;
      const r = 0.55 + (i % 3) * 0.16;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = ((i % 5) - 2) * 0.22;
      positions[i * 3 + 2] = Math.sin(angle) * r;
    }
    sharedParticleGeo = new THREE.BufferGeometry();
    sharedParticleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    texturePool.glowWhite = createGlowTexture('rgba(255, 255, 255, 0.78)', 'rgba(180, 215, 255, 0.22)');
    texturePool.glowGold = createGlowTexture('rgba(255, 225, 50, 0.95)', 'rgba(255, 165, 0, 0.45)');
    texturePool.rays = createRaysTexture();
    texturePool.particleDot = createGlowTexture('rgba(255, 255, 255, 1.0)', 'rgba(255, 240, 150, 0.5)');

    // Alle 8 Sticker-Texturen gestaffelt im Hintergrund vorladen
    STICKER_DEFS.forEach((def, idx) => {
      setTimeout(() => {
        getOrLoadStickerTexture(def, false, () => {});
      }, idx * 45);
    });
  }

  // --- FAST GEOMETRY & FLOOR ENGINE (OHNE RAYCAST-FREEZE) ---
  function extractScene(inst) {
    if (currentScene && currentScene.isScene) return currentScene;
    if (inst) {
      if (inst.scene && inst.scene.isScene) return inst.scene;
      if (inst.graphics && inst.graphics.scene) return inst.graphics.scene;
      if (inst.engine && inst.engine.scene) return inst.engine.scene;
      if (inst.game && inst.game.scene) return inst.game.scene;
    }
    return null;
  }

  function extractCamera(inst) {
    if (currentCamera && currentCamera.isPerspectiveCamera) return currentCamera;
    if (inst) {
      if (inst.camera && inst.camera.isCamera) return inst.camera;
      if (inst.graphics && inst.graphics.camera) return inst.graphics.camera;
      if (inst.player && inst.player.camera) return inst.player.camera;
    }
    return currentCamera;
  }

  function analyzeSceneFast(scene, camPos) {
    const THREE = window.THREE;
    const obstacles = [];
    const walkableSurfaces = [];
    const potenzSigns = [];
    const levelBox = new THREE.Box3();
    const towerBox = new THREE.Box3();
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    if (!scene) return { obstacles, walkableSurfaces, potenzSigns, towerBox, levelBox };

    const scanRoot = (activeLevelInstance && (activeLevelInstance.group || activeLevelInstance.hallwayGroup || activeLevelInstance.roomGroup)) || scene;
    scanRoot.traverse(m => {
      if (!m.isMesh || m.userData?.isStickerPart) return;
      let p = m;
      while (p) { if (p.visible === false) return; p = p.parent; }
      box.setFromObject(m);
      box.getSize(size);
      box.getCenter(center);

      if (size.x > 450 || size.z > 450 || (size.x < 0.18 && size.z < 0.18)) return;
      levelBox.union(box);

      if (box.max.y > 4.6 && size.x < 40 && size.z < 40) {
        towerBox.union(box);
      }

      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (mat && mat.map && mat.map.image) {
          if (mat.map.image.__fnsPotenzSign || mat.map.image.__fnsPotenzDoor) {
            potenzSigns.push({
              isMainSign: !!mat.map.image.__fnsPotenzSign,
              center: center.clone()
            });
          }
        }
      }

      if (size.y <= 1.6 && size.x >= 0.7 && size.z >= 0.7) {
        walkableSurfaces.push({
          x: center.x,
          y: box.max.y,
          z: center.z,
          sizeX: size.x,
          sizeZ: size.z,
          minX: box.min.x,
          maxX: box.max.x,
          minZ: box.min.z,
          maxZ: box.max.z
        });
      }

      if (size.y >= 1.2 && box.max.y >= camPos.y - 4.0) {
        if (size.x > 10 && size.z > 10 && box.containsPoint(camPos)) return;
        obstacles.push({
          minX: box.min.x,
          maxX: box.max.x,
          minY: box.min.y,
          maxY: box.max.y,
          minZ: box.min.z,
          maxZ: box.max.z
        });
      }
    });

    cachedObstacleBoxes = obstacles;
    return { obstacles, walkableSurfaces, potenzSigns, towerBox, levelBox };
  }

  // Reine AABB-Mathematik (~0.01ms statt langsamer 3D-Mesh-Raycasts!)
  function isSpotClearFast(obstacles, walkableSurfaces, levelBox, x, y, z, clearance) {
    if (!levelBox.isEmpty()) {
      if (x < levelBox.min.x + 1.5 || x > levelBox.max.x - 1.5 || z < levelBox.min.z + 1.5 || z > levelBox.max.z - 1.5) {
        return false;
      }
    }
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      if (
        x >= ob.minX - clearance && x <= ob.maxX + clearance &&
        z >= ob.minZ - clearance && z <= ob.maxZ + clearance &&
        y >= ob.minY - 0.3 && y <= ob.maxY + 0.3
      ) {
        return false;
      }
    }
    return true;
  }

  function getFloorHeightFast(walkableSurfaces, x, refY, z, defaultFloorY) {
    let bestY = null;
    let bestDiff = 999;
    for (let i = 0; i < walkableSurfaces.length; i++) {
      const ws = walkableSurfaces[i];
      if (x >= ws.minX - 0.3 && x <= ws.maxX + 0.3 && z >= ws.minZ - 0.3 && z <= ws.maxZ + 0.3) {
        const diff = Math.abs(ws.y - defaultFloorY);
        if (diff < bestDiff && ws.y <= refY + 0.6) {
          bestDiff = diff;
          bestY = ws.y;
        }
      }
    }
    return bestY !== null ? bestY : defaultFloorY;
  }

  function findOpenSpotNearFast(obstacles, walkableSurfaces, levelBox, targetX, refEyeY, targetZ, defaultFloorY) {
    const radii = [0, 1.2, 2.4, 3.8, 5.5, 7.5];
    for (let r = 0; r < radii.length; r++) {
      const rad = radii[r];
      const steps = rad === 0 ? 1 : 8;
      for (let s = 0; s < steps; s++) {
        const ang = (s / steps) * Math.PI * 2;
        const cx = targetX + Math.cos(ang) * rad;
        const cz = targetZ + Math.sin(ang) * rad;
        const fy = getFloorHeightFast(walkableSurfaces, cx, refEyeY, cz, defaultFloorY);
        const testY = fy + STICKER_HEIGHT_OFFSET;
        if (isSpotClearFast(obstacles, walkableSurfaces, levelBox, cx, testY, cz, 0.72)) {
          return { x: cx, y: testY, z: cz };
        }
      }
    }
    return { x: targetX, y: defaultFloorY + STICKER_HEIGHT_OFFSET, z: targetZ };
  }

  function findMidRaftInBoilerLevel(inst, scene, camPos) {
    const THREE = window.THREE;
    const candidates = [];

    if (inst && typeof inst === 'object') {
      for (const key of Object.keys(inst)) {
        const val = inst[key];
        if (Array.isArray(val) && val.length > 0) {
          val.forEach(item => {
            const obj = item?.isObject3D ? item : (item?.mesh?.isObject3D ? item.mesh : (item?.group?.isObject3D ? item.group : null));
            if (obj) {
              const kl = key.toLowerCase();
              if (kl.includes('raft') || kl.includes('floss') || kl.includes('floß') || kl.includes('plat') || kl.includes('crate') || kl.includes('pallet') || kl.includes('float') || kl.includes('box')) {
                candidates.push(obj);
              }
            }
          });
        }
      }
    }

    if (candidates.length === 0 && scene) {
      const box = new THREE.Box3();
      const size = new THREE.Vector3();
      scene.traverse(obj => {
        if (!obj.isMesh || !obj.visible || obj.userData?.isStickerPart) return;
        box.setFromObject(obj);
        box.getSize(size);
        if (size.x >= 1.2 && size.x <= 6.5 && size.z >= 1.2 && size.z <= 6.5 && size.y >= 0.1 && size.y <= 1.8) {
          candidates.push(obj);
        }
      });
    }

    if (candidates.length > 0) {
      const box = new THREE.Box3();
      const center = new THREE.Vector3();
      const unique = [];
      candidates.forEach(obj => {
        box.setFromObject(obj);
        box.getCenter(center);
        const d = camPos ? center.distanceTo(camPos) : center.length();
        if (!unique.some(u => u.center.distanceTo(center) < 1.2)) {
          unique.push({ obj, center: center.clone(), maxY: box.max.y, dist: d });
        }
      });

      unique.sort((a, b) => a.dist - b.dist);
      if (unique.length > 0) {
        const targetIdx = Math.min(unique.length - 1, Math.max(1, Math.floor(unique.length * 0.65)));
        return unique[targetIdx];
      }
    }
    return null;
  }

  function computeLocationsForStrategy(strategy, inst, scene, cam) {
    const THREE = window.THREE;
    const camPos = new THREE.Vector3(0, 1.6, 0);
    const camDir = new THREE.Vector3(0, 0, -1);
    if (cam) {
      cam.getWorldPosition(camPos);
      cam.getWorldDirection(camDir);
      camDir.y = 0;
      if (camDir.lengthSq() > 0.001) camDir.normalize();
      else camDir.set(0, 0, -1);
    }

    const { obstacles, walkableSurfaces, potenzSigns, towerBox, levelBox } = analyzeSceneFast(scene, camPos);
    const defaultFloorY = camPos.y - 1.55;
    const startFloorY = getFloorHeightFast(walkableSurfaces, camPos.x, camPos.y, camPos.z, defaultFloorY);

    // 1. DER GANG
    if (strategy === 'hallway_outside_room') {
      const pt = camPos.clone().addScaledVector(camDir, 12.5);
      return [findOpenSpotNearFast(obstacles, walkableSurfaces, levelBox, pt.x, camPos.y, pt.z, startFloorY)];
    }

    // 2. SCHOOL HALLWAY (Mittig im Gang)
    if (strategy === 'school_middle') {
      const p1 = camPos.clone().addScaledVector(camDir, 14.5);
      return [findOpenSpotNearFast(obstacles, walkableSurfaces, levelBox, p1.x, camPos.y, p1.z, startFloorY)];
    }

    // 3. TREPPENHAUS DER 2ER-POTENZEN
    if (strategy === 'staircase_landing') {
      const spots = [];

      potenzSigns.forEach(sign => {
        if (spots.length >= 6) return;
        spots.push({
          x: sign.center.x,
          y: sign.center.y - 0.15,
          z: sign.center.z
        });
      });

      if (!towerBox.isEmpty()) {
        const towerSurfaces = walkableSurfaces.filter(ws =>
          ws.x >= towerBox.min.x - 2.0 && ws.x <= towerBox.max.x + 2.0 &&
          ws.z >= towerBox.min.z - 2.0 && ws.z <= towerBox.max.z + 2.0 &&
          ws.sizeX <= 12.0 && ws.sizeZ <= 12.0
        );
        towerSurfaces.sort((a, b) => a.y - b.y);
        towerSurfaces.forEach(ts => {
          if (spots.length >= 7) return;
          const sp = { x: ts.x, y: ts.y + 0.85, z: ts.z };
          if (!spots.some(ex => Math.hypot(ex.x - sp.x, ex.z - sp.z) < 2.2 && Math.abs(ex.y - sp.y) < 1.8)) {
            spots.push(sp);
          }
        });
      }

      if (spots.length === 0) {
        const pFront = camPos.clone().addScaledVector(camDir, 2.5);
        spots.push({ x: pFront.x, y: camPos.y - 0.2, z: pFront.z });
      }
      return spots;
    }

    // 4. MEGA LABYRINTH (Garantierte erreichbare Gang-Zellen auf Ebene 0, Ebene -1 und Ebene 1!)
    if (strategy === 'labyrinth_floor_0' || strategy === 'labyrinth_floor_minus1' || strategy === 'labyrinth_floor_plus1') {
      const cellCoords = (strategy === 'labyrinth_floor_0')
        ? [[4, 11, 0.0], [8, 7, 0.0], [12, 4, 0.0]]
        : (strategy === 'labyrinth_floor_minus1')
          ? [[3, 9, -4.5], [8, 5, -4.5], [12, 11, -4.5]]
          : [[4, 10, 4.5], [7, 4, 4.5], [13, 7, 4.5]];
      return cellCoords.map(([cx, cz, fy]) => ({
        x: -60.0 + cx * 8.0,
        y: fy + STICKER_HEIGHT_OFFSET,
        z: -60.0 + cz * 8.0
      }));
    }

    // 5. FLEISCHROOMS (Garantierte freie Gang-Positionen in 3 Richtungen rund um den Spieler!)
    if (strategy === 'fleischrooms_1' || strategy === 'fleischrooms_2' || strategy === 'fleischrooms_3') {
      const baseAngles = (strategy === 'fleischrooms_1')
        ? [0.4, 2.5]
        : (strategy === 'fleischrooms_2')
          ? [1.45, 3.6]
          : [4.6, 5.75];
      const dist = (strategy === 'fleischrooms_1') ? 18.0 : (strategy === 'fleischrooms_2' ? 25.0 : 31.0);
      const spots = [];
      baseAngles.forEach(ang => {
        const tx = camPos.x + Math.cos(ang) * dist;
        const tz = camPos.z + Math.sin(ang) * dist;
        spots.push(findOpenSpotNearFast(obstacles, walkableSurfaces, levelBox, tx, camPos.y, tz, startFloorY));
      });
      return spots;
    }

    // 6. BIBLIOTHEK
    if (strategy === 'library_aisle') {
      const chosen = [];
      if (!levelBox.isEmpty()) {
        const minX = levelBox.min.x + 2.5;
        const maxX = levelBox.max.x - 2.5;
        const minZ = levelBox.min.z + 2.5;
        const maxZ = levelBox.max.z - 2.5;
        const stepX = Math.max(3.0, (maxX - minX) / 9);
        const stepZ = Math.max(3.0, (maxZ - minZ) / 9);

        for (let x = minX; x <= maxX; x += stepX) {
          for (let z = minZ; z <= maxZ; z += stepZ) {
            if (Math.hypot(x - camPos.x, z - camPos.z) < 9.0) continue;
            const testY = startFloorY + STICKER_HEIGHT_OFFSET;
            if (isSpotClearFast(obstacles, walkableSurfaces, levelBox, x, testY, z, 0.78)) {
              if (!chosen.some(c => Math.hypot(c.x - x, c.z - z) < 12.0)) {
                chosen.push({ x, y: testY, z });
                if (chosen.length >= 3) return chosen;
              }
            }
          }
        }
      }
      const p = camPos.clone().addScaledVector(camDir, 10.5);
      return [findOpenSpotNearFast(obstacles, walkableSurfaces, levelBox, p.x, camPos.y, p.z, startFloorY)];
    }

    // 7. GEHEIMER 8. STICKER
    if (strategy === 'secret_spread') {
      if (!levelBox.isEmpty()) {
        const minX = levelBox.min.x + 3.0;
        const maxX = levelBox.max.x - 3.0;
        const minZ = levelBox.min.z + 3.0;
        const maxZ = levelBox.max.z - 3.0;
        const stepX = Math.max(4.5, (maxX - minX) / 8);
        const stepZ = Math.max(4.5, (maxZ - minZ) / 8);

        for (let x = maxX; x >= minX; x -= stepX) {
          for (let z = maxZ; z >= minZ; z -= stepZ) {
            if (Math.hypot(x - camPos.x, z - camPos.z) < 25.0) continue;
            const testY = startFloorY + STICKER_HEIGHT_OFFSET;
            if (isSpotClearFast(obstacles, walkableSurfaces, levelBox, x, testY, z, 0.8)) {
              if (!activeSpawns.some(a => a && a.group && Math.hypot(a.group.position.x - x, a.group.position.z - z) < 18.0)) {
                return [{ x, y: testY, z }];
              }
            }
          }
        }
      }
      return [];
    }

    return [];
  }

  // --- CREATE 3D STICKER MESH (ZERO POINTLIGHT = KEIN SHADER-STALL BEIM SPAWNEN/ENTFERNEN!) ---
  function createStickerInstance(scene, def, isGold, pos, raftData) {
    const THREE = window.THREE;
    if (!THREE || !scene) return;
    initSharedResources();

    const group = new THREE.Group();
    group.userData.isStickerPart = true;

    let raftObj = null;
    if (raftData && raftData.obj) {
      raftObj = raftData.obj;
      const box = new THREE.Box3().setFromObject(raftObj);
      const center = new THREE.Vector3();
      box.getCenter(center);
      group.position.set(center.x, box.max.y + 0.55, center.z);
    } else if (pos) {
      group.position.set(pos.x, pos.y, pos.z);
    } else {
      return;
    }

    const mat = new THREE.MeshBasicMaterial({
      color: isGold ? 0xffe680 : 0xffffff,
      side: THREE.FrontSide,
      transparent: true
    });

    const frontMesh = new THREE.Mesh(sharedPlaneGeo, mat);
    frontMesh.position.z = 0.003;
    frontMesh.userData.isStickerPart = true;
    group.add(frontMesh);

    const backMesh = new THREE.Mesh(sharedPlaneGeo, mat);
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -0.003;
    backMesh.userData.isStickerPart = true;
    group.add(backMesh);

    const whiteOverlayMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const whiteMesh = new THREE.Mesh(sharedOverlayGeo, whiteOverlayMat);
    whiteMesh.userData.isStickerPart = true;
    group.add(whiteMesh);

    const glowMat = new THREE.SpriteMaterial({
      map: isGold ? texturePool.glowGold : texturePool.glowWhite,
      transparent: true,
      opacity: isGold ? 0.92 : 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(2.3, 2.3, 1);
    glowSprite.userData.isStickerPart = true;
    group.add(glowSprite);

    const raysMat1 = new THREE.SpriteMaterial({
      map: texturePool.rays,
      transparent: true,
      opacity: isGold ? 0.45 : 0.0,
      color: isGold ? 0xffd700 : 0xffffff,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const raysSprite1 = new THREE.Sprite(raysMat1);
    raysSprite1.scale.set(2.8, 2.8, 1);
    raysSprite1.userData.isStickerPart = true;
    group.add(raysSprite1);

    const raysMat2 = new THREE.SpriteMaterial({
      map: texturePool.rays,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const raysSprite2 = new THREE.Sprite(raysMat2);
    raysSprite2.scale.set(3.3, 3.3, 1);
    raysSprite2.userData.isStickerPart = true;
    group.add(raysSprite2);

    // 1 einziges THREE.Points-Objekt für alle Glitzer-Partikel (extrem schnell!)
    const pointsMat = new THREE.PointsMaterial({
      map: texturePool.particleDot,
      color: isGold ? 0xffd700 : 0xffffff,
      size: 0.22,
      transparent: true,
      opacity: isGold ? 0.88 : 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const pointsRing = new THREE.Points(sharedParticleGeo, pointsMat);
    pointsRing.userData.isStickerPart = true;
    group.add(pointsRing);

    getOrLoadStickerTexture(def, isGold, tex => {
      mat.map = tex;
      mat.needsUpdate = true;
    });

    scene.add(group);

    activeSpawns.push({
      def,
      isGold,
      group,
      whiteOverlayMat,
      glowSprite,
      glowMat,
      raysSprite1,
      raysMat1,
      raysSprite2,
      raysMat2,
      pointsRing,
      pointsMat,
      baseY: group.position.y,
      raftObj,
      collecting: false,
      collectTime: 0,
      spinSpeed: 1.75
    });
  }

  function clearSpawnsByDefId(defId) {
    for (let i = activeSpawns.length - 1; i >= 0; i--) {
      const s = activeSpawns[i];
      if (!s || (defId && s.def && s.def.id === defId) || !defId) {
        if (s && s.group) {
          s.group.visible = false;
          if (s.group.parent) s.group.parent.remove(s.group);
        }
        activeSpawns.splice(i, 1);
      }
    }
  }

  function clearActiveSpawns() {
    clearSpawnsByDefId(null);
  }

  function decideSpawnMode(def, levelKey) {
    if (!def) return null;
    const isAlwaysNormalLevel = (def.levelGroup === 'fleischrooms' || def.levelGroup === 'mega_labyrinth');
    const diffCfg = (window.DifficultyManager && window.DifficultyManager.getConfig)
      ? window.DifficultyManager.getConfig()
      : { id: 'praeti', goldChance: 0.24, goldPityMax: 5 };
    const isMilan = (diffCfg.id === 'milan') || !!(window.milanMode && window.milanMode.isMilan);

    const secondRun = isSecondPlaythrough(levelKey) || isMilan;
    if (def.isEighthSticker && !secondRun) return null;

    const hasNormal = !!saveState.normal[def.id];
    const hasGold = !!saveState.gold[def.id];

    // 1. Normaler Sticker fehlt noch:
    //    In Fleischrooms & Mega Labyrinth IMMER spawnen, in anderen Leveln zufällig!
    if (!hasNormal) {
      if (isAlwaysNormalLevel || saveState.forceGold) {
        return { isGold: false };
      }
      const normalChance = isMilan ? 0.58 : 0.45;
      if (Math.random() < normalChance) {
        return { isGold: false };
      }
      return null;
    }

    // 2. Normaler Sticker ist schon gesammelt, Gold fehlt noch:
    //    KEIN automatischer Garantie-Spawn! Man braucht in jedem Level Glück (auf Milan höhere Chance: 48%)!
    if (hasNormal && !hasGold && secondRun) {
      const goldChance = isMilan ? 0.48 : (diffCfg.goldChance || 0.24);
      const pityMax = isMilan ? 3 : (diffCfg.goldPityMax || 5);

      if (saveState.forceGold || (saveState.goldPity || 0) >= pityMax || Math.random() < goldChance) {
        saveState.goldPity = 0;
        writeSave();
        return { isGold: true };
      } else {
        saveState.goldPity = (saveState.goldPity || 0) + 1;
        writeSave();
      }
    }

    return null;
  }

  function spawnSingleStickerDef(def, scene, cam, inst, forceSpawnMode = null) {
    if (!def) return false;
    clearSpawnsByDefId(def.id);
    const mode = forceSpawnMode || decideSpawnMode(def, def.id);
    if (!mode) return false;
    if (def.attachToRaft) {
      const camPos = new window.THREE.Vector3();
      if (cam) cam.getWorldPosition(camPos);
      const raftData = findMidRaftInBoilerLevel(inst, scene, camPos);
      if (raftData) {
        createStickerInstance(scene, def, mode.isGold, null, raftData);
        return true;
      } else {
        const spots = computeLocationsForStrategy('school_middle', inst, scene, cam);
        spots.forEach(pt => createStickerInstance(scene, def, mode.isGold, pt, null));
        return spots.length > 0;
      }
    } else {
      const spots = computeLocationsForStrategy(def.strategy, inst, scene, cam);
      spots.forEach(pt => createStickerInstance(scene, def, mode.isGold, pt, null));
      return spots.length > 0;
    }
  }

  function spawnForActiveLevel(levelKey, inst) {
    ensureThreeHook();
    const scene = extractScene(inst);
    const cam = extractCamera(inst);
    if (!scene || !window.THREE) return;
    clearActiveSpawns();
    if (cam) {
      lastSpawnPlayerPos = new window.THREE.Vector3();
      cam.getWorldPosition(lastSpawnPlayerPos);
    }
    levelLoadTimestamp = performance.now();
    if (levelKey === 'school_hallway' || levelKey === 'potenz_treppenhaus') {
      const schoolDef = STICKER_DEFS.find(d => d.id === 'school_hallway');
      const stairDef = STICKER_DEFS.find(d => d.id === 'potenz_treppenhaus');
      spawnSingleStickerDef(schoolDef, scene, cam, inst);
      spawnSingleStickerDef(stairDef, scene, cam, inst);
      saveState.levelsSeen['school_hallway'] = (saveState.levelsSeen['school_hallway'] || 0) + 1;
      saveState.levelsSeen['potenz_treppenhaus'] = (saveState.levelsSeen['potenz_treppenhaus'] || 0) + 1;
    } else {
      const groupDefs = STICKER_DEFS.filter(d => (d.levelGroup || d.id) === levelKey && !d.isEighthSticker);
      groupDefs.forEach(def => {
        spawnSingleStickerDef(def, scene, cam, inst);
        saveState.levelsSeen[def.id] = (saveState.levelsSeen[def.id] || 0) + 1;
      });
    }
    const secretDef = STICKER_DEFS.find(d => d.isEighthSticker);
    if (secretDef && isSecondPlaythrough(levelKey) && levelKey !== 'mega_labyrinth') {
      spawnSingleStickerDef(secretDef, scene, cam, inst);
    }
    writeSave();
  }

  function notifyLevelActive(levelKey, inst) {
    closeStickerMenuIfOpen();

    const checkKey = (levelKey === 'potenz_treppenhaus') ? 'school_hallway' : levelKey;
    const alreadySpawned = activeSpawns.some(s => s && s.def && (s.def.id === levelKey || s.def.id === checkKey));
    if (activeLevelKey === checkKey && activeLevelInstance === inst && alreadySpawned) {
      return;
    }

    activeLevelKey = checkKey;
    if (inst) activeLevelInstance = inst;
    clearTimeout(spawnTimeout);
    spawnTimeout = setTimeout(() => {
      spawnForActiveLevel(checkKey, activeLevelInstance);
    }, 250);
  }

  // --- COLLECT & LEGO ANIMATION (OHNE FRAME-DROP) ---
  function triggerCollect(targetSpawn) {
    if (!targetSpawn || targetSpawn.collecting) return;
    targetSpawn.collecting = true;
    targetSpawn.collectTime = 0;
    targetSpawn.spinSpeed = 3.8;

    const def = targetSpawn.def;
    const isGold = targetSpawn.isGold;

    collectedInCurrentRun[def.id] = true;
    window.__fnsRunStickers = (window.__fnsRunStickers || 0) + 1;
    if (isGold) {
      saveState.gold[def.id] = true;
    } else {
      saveState.normal[def.id] = true;
    }
    writeSave();

    // Andere Kopien sofort unsichtbar schalten (0ms GPU-Cost!) und aus dem Array nehmen
    for (let i = activeSpawns.length - 1; i >= 0; i--) {
      const other = activeSpawns[i];
      if (!other) {
        activeSpawns.splice(i, 1);
        continue;
      }
      if (other !== targetSpawn && other.def && other.def.id === def.id) {
        if (other.group) other.group.visible = false;
        activeSpawns.splice(i, 1);
      }
    }

    playLegoCollectSound(isGold);
    showStickerToast(def, isGold);
    updateStickerMenuUI();
  }

  // --- GEDROSSELTE LIVE-KARTE / MINIMAP (15 FPS statt 60 FPS spart CPU!) ---
  let lastMapRenderTime = 0;
  function updateMinimapDisplay(playerPos, camDir, now) {
    if (now - lastMapRenderTime < 65) return;
    lastMapRenderTime = now;

    let mapBox = document.getElementById('fns-radar-map-box');
    const mapRelevantSpawns = activeSpawns.filter(s => s && s.group && s.group.visible && !s.collecting && s.def && s.def.showOnMap);
    const shouldShowMap = mapRelevantSpawns.length > 0 && !isMainMenuVisible();

    if (!shouldShowMap || !playerPos) {
      if (mapBox) mapBox.style.display = 'none';
      return;
    }

    if (!mapBox) {
      mapBox = document.createElement('div');
      mapBox.id = 'fns-radar-map-box';
      mapBox.innerHTML = `
        <div class="fns-radar-title" id="fns-radar-title-text">KARTE // STICKER-ORTUNG</div>
        <canvas id="fns-radar-canvas" data-fns-internal="1" width="184" height="184"></canvas>
      `;
      document.body.appendChild(mapBox);
    }

    mapBox.style.display = 'block';
    const canvas = mapBox.querySelector('#fns-radar-canvas');
    const titleEl = mapBox.querySelector('#fns-radar-title-text');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const scale = 2.1;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6, 6, 8, 0.9)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(158, 42, 28, 0.55)';
    for (let i = 0; i < cachedObstacleBoxes.length; i++) {
      const b = cachedObstacleBoxes[i];
      const rx = cx + (b.minX - playerPos.x) * scale;
      const ry = cy + (b.minZ - playerPos.z) * scale;
      const rw = Math.max(2, (b.maxX - b.minX) * scale);
      const rh = Math.max(2, (b.maxZ - b.minZ) * scale);
      if (rx + rw >= 0 && rx <= W && ry + rh >= 0 && ry <= H) {
        ctx.fillRect(rx, ry, rw, rh);
      }
    }

    let nearestDist = Infinity;
    const pulse = 0.65 + 0.35 * Math.sin(now * 0.008);

    mapRelevantSpawns.forEach(s => {
      const sx = s.group.position.x;
      const sz = s.group.position.z;
      const distM = Math.hypot(sx - playerPos.x, sz - playerPos.z);
      if (distM < nearestDist) nearestDist = distM;

      const mx = cx + (sx - playerPos.x) * scale;
      const my = cy + (sz - playerPos.z) * scale;

      const margin = 14;
      const clampedX = Math.max(margin, Math.min(W - margin, mx));
      const clampedY = Math.max(margin, Math.min(H - margin, my));

      ctx.save();
      ctx.translate(clampedX, clampedY);

      ctx.beginPath();
      ctx.arc(0, 0, 5 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = s.isGold ? `rgba(255, 215, 0, ${pulse})` : `rgba(255, 234, 0, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = s.isGold ? '#ffd700' : '#00ffcc';
      ctx.fill();

      ctx.font = 'bold 9px Courier New, monospace';
      ctx.fillStyle = '#ffea00';
      ctx.textAlign = 'center';
      const floorHint = (activeLevelKey === 'mega_labyrinth')
        ? (s.group.position.y < -1.5 ? ' (E-1)' : (s.group.position.y > 2.5 ? ' (E+1)' : ' (E0)'))
        : '';
      ctx.fillText(`${Math.round(distM)}m${floorHint}`, 0, -7);
      ctx.restore();
    });

    if (titleEl && nearestDist < Infinity) {
      titleEl.textContent = `KARTE // STICKER: ${Math.round(nearestDist)}m`;
    }

    ctx.save();
    ctx.translate(cx, cy);
    if (camDir) {
      const angle = Math.atan2(camDir.z, camDir.x);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(18, -9);
      ctx.lineTo(18, 9);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  let dynamicStairPlaced = false;
  function checkDynamicStairwellProximity(playerPos, camDir, scene) {
    if (!playerPos || !camDir || !scene) return;
    if (activeLevelKey !== 'school_hallway' && activeLevelKey !== 'potenz_treppenhaus') return;
    if (collectedInCurrentRun['potenz_treppenhaus']) return;

    const stairDef = STICKER_DEFS.find(d => d.id === 'potenz_treppenhaus');
    const mode = decideSpawnMode(stairDef, 'potenz_treppenhaus');
    if (!mode) return;

    const bodyText = (document.body.innerText || '').toUpperCase();
    const isNearStairwell = (playerPos.y > 2.2) || bodyText.includes('SCHIEBETÜR VERRIEGELT') || bodyText.includes('FINDE DIE TÜR FÜR 2');

    if (isNearStairwell && !dynamicStairPlaced) {
      const existingNearby = activeSpawns.some(s =>
        s && s.def && s.def.id === 'potenz_treppenhaus' &&
        s.group && s.group.position.distanceTo(playerPos) < 8.0
      );
      if (!existingNearby) {
        dynamicStairPlaced = true;
        const dirXZ = camDir.clone();
        dirXZ.y = 0;
        if (dirXZ.lengthSq() > 0.01) dirXZ.normalize();
        const pt = playerPos.clone().addScaledVector(dirXZ, 2.8);
        createStickerInstance(scene, stairDef, mode.isGold, {
          x: pt.x,
          y: playerPos.y - 0.15,
          z: pt.z
        }, null);
      }
    }
  }

  let lastTime = performance.now();
  let lastHudCheck = 0;

  function updateLoop() {
    requestAnimationFrame(updateLoop);
    ensureThreeHook();

    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    const THREE = window.THREE;
    const scene = extractScene(activeLevelInstance);
    const cam = extractCamera(activeLevelInstance);

    let playerPos = null;
    let camDir = null;
    if (cam && THREE) {
      playerPos = new THREE.Vector3();
      camDir = new THREE.Vector3();
      cam.getWorldPosition(playerPos);
      cam.getWorldDirection(camDir);

      if (lastSpawnPlayerPos && now - levelLoadTimestamp < 2800) {
        if (playerPos.distanceTo(lastSpawnPlayerPos) > 10.0) {
          lastSpawnPlayerPos.copy(playerPos);
          dynamicStairPlaced = false;
          spawnForActiveLevel(activeLevelKey, activeLevelInstance);
          return;
        }
      }
    }

    if (now - lastHudCheck > 500) {
      lastHudCheck = now;
      syncStickerMenuVisibility();
      checkDynamicStairwellProximity(playerPos, camDir, scene);
      if (activeLevelKey === 'fleischrooms' && playerPos && activeSpawns.length > 0) {
        activeSpawns.forEach(s => {
          if (s && s.group && !s.collecting && Math.hypot(s.group.position.x - playerPos.x, s.group.position.z - playerPos.z) > 55.0) {
            const ang = Math.random() * Math.PI * 2;
            s.group.position.x = playerPos.x + Math.cos(ang) * 22.0;
            s.group.position.z = playerPos.z + Math.sin(ang) * 22.0;
          }
        });
      }
    }

    if (activeSpawns.length === 0 || !THREE) {
      updateMinimapDisplay(null, null, now);
      return;
    }

    updateMinimapDisplay(playerPos, camDir, now);

    const tempPos = new THREE.Vector3();
    const raftBox = new THREE.Box3();
    const raftCenter = new THREE.Vector3();

    for (let i = activeSpawns.length - 1; i >= 0; i--) {
      const s = activeSpawns[i];
      if (!s || !s.group || !s.group.visible) continue;

      if (scene && !s.collecting && s.group.parent !== scene) {
        scene.add(s.group);
      }

      if (!s.collecting) {
        s.group.rotation.y += dt * s.spinSpeed;

        if (s.raftObj) {
          raftBox.setFromObject(s.raftObj);
          raftBox.getCenter(raftCenter);
          s.group.position.set(
            raftCenter.x,
            raftBox.max.y + 0.55 + Math.sin(now * 0.003) * 0.07,
            raftCenter.z
          );
        } else {
          s.group.position.y = s.baseY + Math.sin(now * 0.003) * 0.09;
        }

        if (s.isGold && s.pointsRing) {
          s.raysMat1.rotation += dt * 0.9;
          s.pointsRing.rotation.y += dt * 2.2;
        }

        if (playerPos) {
          s.group.getWorldPosition(tempPos);
          const dx = playerPos.x - tempPos.x;
          const dz = playerPos.z - tempPos.z;
          const dy = Math.abs((playerPos.y - 0.5) - tempPos.y);
          if (Math.sqrt(dx * dx + dz * dz) < PICKUP_RADIUS && dy < 2.5) {
            triggerCollect(s);
            break;
          }
        }
      } else {
        // LEGO HARRY POTTER GOLDEN BRICK ANIMATION (60 FPS ohne Licht-Stall!)
        s.collectTime += dt;
        const t = s.collectTime;
        const duration = 1.65;

        s.spinSpeed += dt * 44.0;
        s.group.rotation.y += dt * s.spinSpeed;
        s.group.position.y += dt * 0.42;

        const glowP = Math.min(1.0, t / 1.25);
        s.whiteOverlayMat.opacity = Math.pow(glowP, 1.35) * 0.96;
        s.glowMat.opacity = 0.92 + glowP * 0.08;
        const haloScale = 2.3 + glowP * 4.2;
        s.glowSprite.scale.set(haloScale, haloScale, 1);

        const rayAlpha = Math.sin(Math.min(1.0, t / duration) * Math.PI);
        s.raysMat1.opacity = rayAlpha * 0.95;
        s.raysMat2.opacity = rayAlpha * 0.85;
        s.raysMat1.rotation += dt * 3.6;
        s.raysMat2.rotation -= dt * 2.9;
        const rayScale = 2.6 + glowP * 3.2;
        s.raysSprite1.scale.set(rayScale, rayScale, 1);
        s.raysSprite2.scale.set(rayScale * 1.15, rayScale * 1.15, 1);

        if (s.pointsRing && s.pointsMat) {
          s.pointsMat.color.setHex(0xffffff);
          s.pointsMat.opacity = rayAlpha;
          s.pointsRing.rotation.y += dt * 8.5;
          const pScale = 1.0 + glowP * 1.6;
          s.pointsRing.scale.set(pScale, 1.0 + glowP * 0.5, pScale);
        }

        if (t > 1.25) {
          const shrink = Math.max(0.001, 1.18 * (1.0 - (t - 1.25) / (duration - 1.25)));
          s.group.scale.set(shrink, shrink, shrink);
        } else {
          const pop = 1.0 + glowP * 0.18;
          s.group.scale.set(pop, pop, pop);
        }

        if (t >= duration) {
          s.group.visible = false;
          activeSpawns.splice(i, 1);
        }
      }
    }
  }

  // --- CLASS HOOKER ---
  function hookLevelClass(levelKey, Cls) {
    if (!Cls || !Cls.prototype || Cls.__stickerHooked) return;
    Cls.__stickerHooked = true;

    const startNames = ['init', 'build', 'start', 'setup', 'load', 'enter', 'generate', 'create', 'activate', 'reset'];
    const cleanNames = ['dispose', 'cleanup', 'destroy', 'unload'];

    Object.getOwnPropertyNames(Cls.prototype).forEach(methodName => {
      if (methodName === 'constructor') return;
      const desc = Object.getOwnPropertyDescriptor(Cls.prototype, methodName);
      if (!desc || typeof desc.value !== 'function') return;

      const lower = methodName.toLowerCase();
      const orig = Cls.prototype[methodName];

      if (cleanNames.some(c => lower.includes(c))) {
        Cls.prototype[methodName] = function () {
          clearActiveSpawns();
          dynamicStairPlaced = false;
          return orig.apply(this, arguments);
        };
      } else if (startNames.some(s => lower.includes(s))) {
        Cls.prototype[methodName] = function () {
          const res = orig.apply(this, arguments);
          dynamicStairPlaced = false;
          notifyLevelActive(levelKey, this);
          return res;
        };
      } else if (lower === 'update' || lower === 'tick') {
        Cls.prototype[methodName] = function () {
          if (this.__fnsInitialized !== true) {
            this.__fnsInitialized = true;
            dynamicStairPlaced = false;
            notifyLevelActive(levelKey, this);
          }
          return orig.apply(this, arguments);
        };
      }
    });
  }

  // --- TOAST & MENU UI ---
  function showStickerToast(def, isGold) {
    let toast = document.getElementById('fns-sticker-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'fns-sticker-toast';
      document.body.appendChild(toast);
    }
    toast.className = isGold ? 'fns-toast-gold show' : 'fns-toast-normal show';
    toast.innerHTML = `
      <div class="fns-toast-thumb">
        <img src="${def.file}" alt="${def.name}" class="${isGold ? 'fns-gold-img' : ''}" />
      </div>
      <div class="fns-toast-body">
        <div class="fns-toast-title">${isGold ? '[ GOLD-STICKER ERFASST ]' : '[ STICKER EINGESAMMELT ]'}</div>
        <div class="fns-toast-sub">SEKTOR: ${def.levelName.toUpperCase()}</div>
      </div>
    `;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 4400);
  }

  function injectStyles() {
    if (document.getElementById('fns-sticker-styles')) return;
    const style = document.createElement('style');
    style.id = 'fns-sticker-styles';
    style.textContent = `
      .fns-hidden-by-sticker {
        display: none !important;
      }
      #fns-sticker-menu-view {
        display: none;
        width: min(860px, 92vw);
        min-width: min(760px, 88vw);
        box-sizing: border-box;
        padding: 6px 0;
        color: #e6e6e6;
        font-family: 'Courier New', Courier, monospace;
        z-index: 60;
      }
      .fns-sticker-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        height: 44px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(168, 45, 30, 0.65);
      }
      .fns-sticker-top-left {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      #fns-sticker-back-btn {
        background: rgba(10, 10, 10, 0.92);
        border: 1px solid #9e2a1c;
        color: #ffea00;
        font-family: 'Courier New', Courier, monospace;
        font-weight: 700;
        font-size: 0.92rem;
        letter-spacing: 0.12em;
        padding: 8px 20px;
        cursor: pointer;
        text-transform: uppercase;
        border-radius: 0;
      }
      #fns-sticker-back-btn:hover {
        background: rgba(158, 42, 28, 0.25);
        border-color: #ffea00;
      }
      .fns-sticker-heading {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        color: #ffffff;
        text-transform: uppercase;
      }
      .fns-sticker-stats {
        display: flex;
        align-items: center;
        gap: 14px;
        font-size: 0.92rem;
        letter-spacing: 0.08em;
        color: #ffea00;
        text-transform: uppercase;
        height: 28px;
        line-height: 28px;
      }
      .fns-sticker-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(3, 146px);
        gap: 12px;
        width: 100%;
      }
      .fns-sticker-card {
        background: rgba(6, 6, 8, 0.88);
        border: 1px solid rgba(158, 42, 28, 0.55);
        border-radius: 0;
        padding: 8px 6px 6px 6px;
        height: 146px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        text-align: center;
        position: relative;
        overflow: hidden;
      }
      .fns-sticker-card.gold-unlocked {
        border-color: #ffd700;
        box-shadow: inset 0 0 18px rgba(255, 215, 0, 0.16);
      }
      .fns-card-index {
        position: absolute;
        top: 5px;
        left: 7px;
        font-size: 0.68rem;
        color: rgba(255, 234, 0, 0.48);
        font-family: 'Courier New', Courier, monospace;
        z-index: 2;
      }
      .fns-gold-badge {
        position: absolute;
        top: 5px;
        right: 6px;
        background: rgba(20, 16, 4, 0.95);
        border: 1px solid #ffd700;
        color: #ffd700;
        font-size: 0.64rem;
        font-weight: 700;
        padding: 1px 6px;
        cursor: pointer;
        user-select: none;
        z-index: 3;
      }
      .fns-sticker-img-wrap {
        width: 104px;
        height: 104px;
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        flex-shrink: 0;
      }
      .fns-sticker-img-wrap img {
        width: 100px;
        height: 100px;
        object-fit: contain;
        transition: transform 0.18s ease;
      }
      .fns-sticker-card.unlocked:hover .fns-sticker-img-wrap img {
        transform: scale(1.05);
      }
      .fns-sticker-card.locked .fns-sticker-img-wrap img {
        filter: brightness(0) opacity(0.22);
      }
      .fns-gold-img {
        filter: brightness(0.82) sepia(1) hue-rotate(5deg) saturate(5.8) contrast(1.18) drop-shadow(0 0 10px rgba(255, 215, 0, 0.7)) !important;
      }
      .fns-sticker-loc {
        font-size: 0.68rem;
        color: #9a9a9a;
        letter-spacing: 0.04em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        line-height: 18px;
      }
      #fns-sticker-toast {
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 14px;
        background: rgba(5, 5, 6, 0.94);
        border: 1px solid #9e2a1c;
        padding: 10px 16px;
        color: #ffea00;
        font-family: 'Courier New', Courier, monospace;
        box-shadow: 0 0 22px rgba(0, 0, 0, 0.9);
        transform: translateX(-130%);
        opacity: 0;
        transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
        pointer-events: none;
      }
      #fns-sticker-toast.fns-toast-gold {
        border-color: #ffd700;
        box-shadow: 0 0 25px rgba(255, 215, 0, 0.4);
      }
      #fns-sticker-toast.show {
        transform: translateX(0);
        opacity: 1;
      }
      .fns-toast-thumb {
        width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      #fns-sticker-toast img {
        width: 58px;
        height: 58px;
        object-fit: contain;
      }
      .fns-toast-title {
        font-weight: 700;
        font-size: 0.85rem;
        letter-spacing: 0.12em;
        color: #ffea00;
        margin-bottom: 4px;
      }
      .fns-toast-sub {
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        color: #cccccc;
      }
      #fns-radar-map-box {
        display: none;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9500;
        background: rgba(5, 5, 7, 0.92);
        border: 1px solid #9e2a1c;
        padding: 6px;
        font-family: 'Courier New', Courier, monospace;
        box-shadow: 0 0 18px rgba(0, 0, 0, 0.85);
        pointer-events: none;
      }
      .fns-radar-title {
        font-size: 0.68rem;
        font-weight: bold;
        color: #ffea00;
        letter-spacing: 0.08em;
        margin-bottom: 4px;
        text-align: center;
      }
      #fns-radar-canvas {
        display: block;
        border: 1px solid rgba(158, 42, 28, 0.45);
      }
    `;
    document.head.appendChild(style);
  }

  function updateStickerMenuUI() {
    const view = document.getElementById('fns-sticker-menu-view');
    if (!view) return;

    const normalCount = STICKER_DEFS.filter(d => saveState.normal[d.id]).length;
    const goldCount = STICKER_DEFS.filter(d => saveState.gold[d.id]).length;
    const secondRun = isSecondPlaythrough();

    const stats = view.querySelector('.fns-sticker-stats');
    if (stats) {
      const diffCfg = (window.DifficultyManager && window.DifficultyManager.getConfig) ? window.DifficultyManager.getConfig() : { name: 'PRAETI', goldChance: 0.22 };
      stats.innerHTML = `
        <span>${normalCount} / 12</span>
        <span style="color:#ffd700;">★ ${goldCount} / 12</span>
      `;
    }

    const grid = view.querySelector('.fns-sticker-grid');
    if (!grid) return;
    grid.innerHTML = '';

    STICKER_DEFS.forEach((def, idx) => {
      const hasNormal = !!saveState.normal[def.id];
      const hasGold = !!saveState.gold[def.id];
      const unlocked = hasNormal || hasGold;
      let showGold = hasGold;

      const card = document.createElement('div');
      card.className = `fns-sticker-card ${unlocked ? 'unlocked' : 'locked'} ${hasGold ? 'gold-unlocked' : ''}`;
      card.tabIndex = 0;
      card.innerHTML = `
        <span class="fns-card-index">#${String(idx + 1).padStart(2, '0')}</span>
        ${hasGold ? '<div class="fns-gold-badge" title="Gold-Filter umschalten">★ GOLD</div>' : ''}
        <div class="fns-sticker-img-wrap">
          <img src="${def.file}" alt="${unlocked ? def.levelName : '???'}" class="${showGold ? 'fns-gold-img' : ''}" />
        </div>
        <div class="fns-sticker-loc">${def.isEighthSticker ? (unlocked ? def.name : "???") : def.levelName}</div>
      `;

      const imgEl = card.querySelector('img');
      if (def.fallbackFile) {
        imgEl.onerror = function () {
          if (this.src.indexOf('FleischiQuestion') !== -1) {
            this.src = def.fallbackFile;
          }
        };
      }

      if (hasGold) {
        const badge = card.querySelector('.fns-gold-badge');
        const toggleGold = () => {
          showGold = !showGold;
          imgEl.classList.toggle('fns-gold-img', showGold);
          badge.textContent = showGold ? '★ GOLD' : 'NORMAL';
        };
        badge.addEventListener('click', e => {
          e.stopPropagation();
          toggleGold();
        });
        card.addEventListener('click', toggleGold);
      }

      grid.appendChild(card);
    });
  }

  let cachedBtnContainer = null;
  let cachedStickerView = null;

  function isMainMenuVisible() {
    if (!cachedBtnContainer) return false;
    const parent = cachedBtnContainer.parentElement;
    if (!parent) return false;
    const style = window.getComputedStyle(parent);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function closeStickerMenuIfOpen() {
    isStickerMenuOpen = false;
    if (cachedStickerView) {
      cachedStickerView.style.display = 'none';
    }
    if (cachedBtnContainer) {
      cachedBtnContainer.classList.remove('fns-hidden-by-sticker');
      Array.from(cachedBtnContainer.children).forEach(ch => {
        if (ch !== cachedStickerView) ch.classList.remove('fns-hidden-by-sticker');
      });
    }
  }

  function syncStickerMenuVisibility() {
    if (!cachedBtnContainer || !cachedStickerView) return;
    if (isStickerMenuOpen) {
      cachedBtnContainer.classList.add('fns-hidden-by-sticker');
      Array.from(cachedBtnContainer.children).forEach(ch => {
        if (ch !== cachedStickerView) ch.classList.add('fns-hidden-by-sticker');
      });
      cachedStickerView.style.display = 'block';
    } else {
      cachedStickerView.style.display = 'none';
      cachedBtnContainer.classList.remove('fns-hidden-by-sticker');
    }
  }

  function setupMainMenuButton() {
    injectStyles();
    if (document.getElementById('fns-menu-sticker-btn')) return;

    const candidates = Array.from(document.querySelectorAll('button, .menu-btn, .btn, a, div[role="button"]'));
    const levelsBtn = candidates.find(el => /^levels?$/i.test((el.textContent || '').trim()));
    const settingsBtn = candidates.find(el => /^einstellungen|settings$/i.test((el.textContent || '').trim()));

    const refBtn = levelsBtn || settingsBtn;
    if (!refBtn || !refBtn.parentElement) return;

    const btnContainer = refBtn.parentElement;
    cachedBtnContainer = btnContainer;

    const stickerBtn = document.createElement(refBtn.tagName);
    stickerBtn.id = 'fns-menu-sticker-btn';
    stickerBtn.className = refBtn.className;
    if (refBtn.getAttribute('style')) {
      stickerBtn.setAttribute('style', refBtn.getAttribute('style'));
    }
    stickerBtn.textContent = 'STICKER';

    if (settingsBtn && settingsBtn.parentElement === btnContainer) {
      btnContainer.insertBefore(stickerBtn, settingsBtn);
    } else if (levelsBtn && levelsBtn.nextSibling) {
      btnContainer.insertBefore(stickerBtn, levelsBtn.nextSibling);
    } else {
      btnContainer.appendChild(stickerBtn);
    }

    const hostPanel = btnContainer.parentElement || btnContainer;
    const stickerView = document.createElement('div');
    stickerView.id = 'fns-sticker-menu-view';
    cachedStickerView = stickerView;

    stickerView.innerHTML = `
      <div class="fns-sticker-topbar">
        <div class="fns-sticker-top-left">
          <button id="fns-sticker-back-btn">ZURÜCK</button>
          <h2 class="fns-sticker-heading">STICKER-ARCHIV</h2>
        </div>
        <div class="fns-sticker-stats"></div>
      </div>
      <div class="fns-sticker-grid"></div>
    `;
    hostPanel.appendChild(stickerView);

    stickerBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      isStickerMenuOpen = true;
      updateStickerMenuUI();
      syncStickerMenuVisibility();
    });

    stickerView.querySelector('#fns-sticker-back-btn').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      closeStickerMenuIfOpen();
    });

    Array.from(btnContainer.children).forEach(btn => {
      if (btn !== stickerBtn && btn !== stickerView) {
        btn.addEventListener('click', () => {
          closeStickerMenuIfOpen();
        });
      }
    });

    updateStickerMenuUI();
  }

  // --- CONSOLE HELPERS ---
  function resetAllStickers() {
    saveState.normal = {};
    saveState.gold = {};
    saveState.playthroughs = 1;
    saveState.levelsSeen = {};
    saveState.goldPity = 0;
    saveState.forceGold = false;
    collectedInCurrentRun = {};
    dynamicStairPlaced = false;
    writeSave();
    updateStickerMenuUI();
    if (activeLevelKey) {
      spawnForActiveLevel(activeLevelKey, activeLevelInstance);
    }
    return 'Alle Sticker erfolgreich zurückgesetzt!';
  }

  window.resetStcikers = resetAllStickers;
  window.resetStickers = resetAllStickers;

  window.unlockGoldMode = function () {
    saveState.playthroughs = 2;
    saveState.forceGold = true;
    STICKER_DEFS.forEach(d => {
      if (!d.isEighthSticker) saveState.normal[d.id] = true;
    });
    collectedInCurrentRun = {};
    dynamicStairPlaced = false;
    writeSave();
    updateStickerMenuUI();
    if (activeLevelKey) {
      spawnForActiveLevel(activeLevelKey, activeLevelInstance);
    }
    return 'Gold-Modus aktiviert!';
  };

  window.tpToSticker = function () {
    const cam = extractCamera(activeLevelInstance);
    if (!cam || activeSpawns.length === 0) return;
    const valid = activeSpawns.find(s => s && s.group && s.group.visible);
    if (!valid) return;
    const target = valid.group.position;
    cam.position.set(target.x, target.y + 0.5, target.z + 1.2);
  };

  function processRegisteredClasses() {
    if (Array.isArray(window.__FNS_REGISTER_LEVEL_CLASS__)) {
      window.__FNS_REGISTER_LEVEL_CLASS__.forEach(entry => {
        hookLevelClass(entry.key, entry.cls);
      });
    }
  }

  const domObserver = new MutationObserver(() => {
    setupMainMenuButton();
    processRegisteredClasses();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupMainMenuButton();
      processRegisteredClasses();
      domObserver.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    setupMainMenuButton();
    processRegisteredClasses();
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  requestAnimationFrame(updateLoop);

  window.StickerSystem = {
    hookLevelClass,
    notifyLevelActive,
    spawnForLevel: notifyLevelActive,
    clear: clearActiveSpawns,
    reset: resetAllStickers,
    unlockGoldMode: window.unlockGoldMode,
    tpToSticker: window.tpToSticker
  };

  processRegisteredClasses();
})();
