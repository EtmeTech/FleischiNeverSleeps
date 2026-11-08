/**
 * FleischiNeverSleeps - StickerManager (v7)
 * - Dual-Zone Support für SchoolLevelManager (School Hallway + 2er-Potenzen-Treppenhaus gleichzeitig!)
 * - Automatische Treppenturm- & 3D-Schild-Erkennung für das 2er-Potenzen-Treppenhaus
 * - Mega Labyrinth: Mind. 20m Abstand zum Spawn, verteilt in echten Gängen + Live-Radar-Karte
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'fleischi_stickers_save_v1';
  const GOLD_SPAWN_CHANCE = 0.65;
  const PICKUP_RADIUS = 2.15;
  const STICKER_HEIGHT_OFFSET = 0.72;

  const STICKER_DEFS = [
    {
      id: 'gang',
      name: 'Absolute Cinema',
      file: '/assets/Sticker/AbsuluteCinema.webp',
      levelName: 'Der Gang',
      multiSpawn: false,
      showOnMap: false,
      strategy: 'hallway_outside_room'
    },
    {
      id: 'fleischrooms',
      name: 'Absolute Depression',
      file: '/assets/Sticker/AbsuluteDeprision.webp',
      levelName: 'Fleischrooms',
      multiSpawn: true,
      showOnMap: false,
      strategy: 'fleischrooms_spread'
    },
    {
      id: 'school_hallway',
      name: 'Date vs. Nachsitzen',
      file: '/assets/Sticker/DateVsNachsitzen.webp',
      levelName: 'School Hallway',
      multiSpawn: true,
      showOnMap: false,
      strategy: 'school_middle'
    },
    {
      id: 'potenz_treppenhaus',
      name: 'Logik ruft an',
      file: '/assets/Sticker/LogikRuftAn.webp',
      levelName: 'Treppenhaus der 2er-Potenzen',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'staircase_landing'
    },
    {
      id: 'mega_labyrinth',
      name: 'Fleischi Spiderman',
      file: '/assets/Sticker/FleischiSpiderman.webp',
      levelName: 'Mega Labyrinth',
      multiSpawn: true,
      showOnMap: true,
      strategy: 'labyrinth_open_corners'
    },
    {
      id: 'heizungskeller',
      name: 'Nice.',
      file: '/assets/Sticker/nice.webp',
      levelName: 'Überfluteter Heizungskeller',
      multiSpawn: false,
      attachToRaft: true,
      showOnMap: false,
      strategy: 'raft_mid'
    },
    {
      id: 'bibliothek',
      name: 'Yesss!',
      file: '/assets/Sticker/Yesss.webp',
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
      levelName: 'Geheimer 8. Sticker',
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
    if (normalCount >= 4) return true;
    if (levelKey && saveState.normal[levelKey] && (saveState.levelsSeen[levelKey] || 0) >= 1) return true;
    return false;
  }

  // --- THREE.JS & CANVAS TEXTURE TRACKING ---
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

  // Markiert Canvas-Texturen, auf die das Spiel "GESUCHTER AUSGANG", "FOLGE:" oder Türnummern ("2^8") schreibt
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
    }
  }

  // --- SOUND ---
  function playLegoCollectSound(isGold) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
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
        gain.gain.exponentialRampToValueAtTime(0.16, now + idx * 0.08 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.48);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.52);
      });

      const finalTime = now + 1.25;
      [1046.5, 1567.98, 2093.0].forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, finalTime);
        gain.gain.setValueAtTime(0.001, finalTime);
        gain.gain.exponentialRampToValueAtTime(0.2, finalTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, finalTime + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(finalTime);
        osc.stop(finalTime + 0.85);
      });
    } catch (e) {}
  }

  // --- TEXTURES ---
  function createGlowTexture(c1, c2) {
    const canvas = document.createElement('canvas');
    canvas.dataset.fnsInternal = '1';
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0.0, c1);
    g.addColorStop(0.45, c2);
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new window.THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function createRaysTexture() {
    const canvas = document.createElement('canvas');
    canvas.dataset.fnsInternal = '1';
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.translate(256, 256);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / rays);
      const g = ctx.createLinearGradient(0, 0, 245, 0);
      g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      g.addColorStop(0.45, 'rgba(255, 252, 220, 0.55)');
      g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(245, -18);
      ctx.lineTo(245, 18);
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
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, 512, 512);

    if (isGold) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const goldGrad = ctx.createLinearGradient(0, 0, 512, 512);
      goldGrad.addColorStop(0.0, '#ffd700');
      goldGrad.addColorStop(0.35, '#ffef8a');
      goldGrad.addColorStop(0.65, '#d4af37');
      goldGrad.addColorStop(1.0, '#ffae00');
      ctx.fillStyle = goldGrad;
      ctx.fillRect(0, 0, 512, 512);

      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255, 200, 20, 0.22)';
      ctx.fillRect(0, 0, 512, 512);

      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, 0, 0, 512, 512);
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function loadStickerTexture(def, isGold, cb) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      cb(drawStickerCanvas(img, isGold));
    };
    img.onerror = function () {
      if (def.fallbackFile && img.src.indexOf('FleischiQuestion') !== -1) {
        img.src = def.fallbackFile;
      }
    };
    img.src = def.file;
  }

  // --- GEOMETRY & FLOOR/CORRIDOR ENGINE ---
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

  function getCollidableMeshes(scene) {
    const list = [];
    if (!scene) return list;
    scene.traverse(o => {
      if (o.isMesh && o.visible && !o.userData?.isStickerPart) {
        list.push(o);
      }
    });
    return list;
  }

  function raycastFloorStrict(meshes, x, startY, z, maxDist) {
    const THREE = window.THREE;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, startY, z),
      new THREE.Vector3(0, -1, 0),
      0.02,
      maxDist || 6.0
    );
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length > 0) {
      return hits[0].point.y;
    }
    return null;
  }

  function centerInCorridor(meshes, x, y, z) {
    const THREE = window.THREE;
    const origin = new THREE.Vector3(x, y, z);

    const rayPosX = new THREE.Raycaster(origin, new THREE.Vector3(1, 0, 0), 0.02, 4.5).intersectObjects(meshes, false);
    const rayNegX = new THREE.Raycaster(origin, new THREE.Vector3(-1, 0, 0), 0.02, 4.5).intersectObjects(meshes, false);
    let cx = x;
    if (rayPosX.length > 0 && rayNegX.length > 0) {
      const dPos = rayPosX[0].distance;
      const dNeg = rayNegX[0].distance;
      if (dPos + dNeg >= 1.2 && dPos + dNeg <= 7.0) {
        cx = x + (dPos - dNeg) * 0.45;
      }
    } else if (rayPosX.length > 0 && rayPosX[0].distance < 0.8) {
      cx = x - (0.85 - rayPosX[0].distance);
    } else if (rayNegX.length > 0 && rayNegX[0].distance < 0.8) {
      cx = x + (0.85 - rayNegX[0].distance);
    }

    const origin2 = new THREE.Vector3(cx, y, z);
    const rayPosZ = new THREE.Raycaster(origin2, new THREE.Vector3(0, 0, 1), 0.02, 4.5).intersectObjects(meshes, false);
    const rayNegZ = new THREE.Raycaster(origin2, new THREE.Vector3(0, 0, -1), 0.02, 4.5).intersectObjects(meshes, false);
    let cz = z;
    if (rayPosZ.length > 0 && rayNegZ.length > 0) {
      const dPos = rayPosZ[0].distance;
      const dNeg = rayNegZ[0].distance;
      if (dPos + dNeg >= 1.2 && dPos + dNeg <= 7.0) {
        cz = z + (dPos - dNeg) * 0.45;
      }
    } else if (rayPosZ.length > 0 && rayPosZ[0].distance < 0.8) {
      cz = z - (0.85 - rayPosZ[0].distance);
    } else if (rayNegZ.length > 0 && rayNegZ[0].distance < 0.8) {
      cz = z + (0.85 - rayNegZ[0].distance);
    }

    return { x: cx, y, z: cz };
  }

  function isInsideLevelAndOpen(meshes, obstacles, x, refEyeY, z) {
    const THREE = window.THREE;
    const floorY = raycastFloorStrict(meshes, x, refEyeY - 0.1, z, 4.5);
    if (floorY === null) return null;

    const testY = floorY + STICKER_HEIGHT_OFFSET;

    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      if (
        x >= ob.min.x - 0.55 && x <= ob.max.x + 0.55 &&
        z >= ob.min.z - 0.55 && z <= ob.max.z + 0.55 &&
        testY >= ob.min.y - 0.15 && testY <= ob.max.y + 0.15
      ) {
        return null;
      }
    }

    const pt = new THREE.Vector3(x, testY, z);
    const dirs4 = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1)
    ];

    let wallsSeen = 0;
    for (let d = 0; d < dirs4.length; d++) {
      const hits = new THREE.Raycaster(pt, dirs4[d], 0.02, 40.0).intersectObjects(meshes, false);
      if (hits.length > 0) {
        wallsSeen++;
        if (hits[0].distance < 0.6) return null;
      }
    }

    const upHits = new THREE.Raycaster(pt, new THREE.Vector3(0, 1, 0), 0.1, 18.0).intersectObjects(meshes, false);
    if (wallsSeen < 2 && upHits.length === 0) return null;

    const centered = centerInCorridor(meshes, x, testY, z);
    const finalFloorY = raycastFloorStrict(meshes, centered.x, refEyeY - 0.1, centered.z, 4.5);
    if (finalFloorY === null) return null;

    return { x: centered.x, y: finalFloorY + STICKER_HEIGHT_OFFSET, z: centered.z };
  }

  function analyzeSceneGeometry(meshes, camPos) {
    const THREE = window.THREE;
    const obstacles = [];
    const walkableSurfaces = [];
    const potenzSigns = [];
    const highTowerMeshes = [];
    const levelBox = new THREE.Box3();
    const towerBox = new THREE.Box3();
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    meshes.forEach(m => {
      box.setFromObject(m);
      box.getSize(size);
      box.getCenter(center);

      if (size.x > 450 || size.z > 450 || (size.x < 0.18 && size.z < 0.18)) return;
      levelBox.union(box);

      // Alle Meshes, die höher als 4.6m liegen, gehören im SchoolLevelManager garantiert zum 2er-Potenzen-Treppenturm!
      if (box.max.y > 4.6 && size.x < 40 && size.z < 40) {
        towerBox.union(box);
        highTowerMeshes.push({
          mesh: m,
          x: center.x,
          y: box.max.y,
          centerY: center.y,
          z: center.z,
          sizeX: size.x,
          sizeY: size.y,
          sizeZ: size.z,
          box: box.clone()
        });
      }

      // Prüfe ob dieses Mesh das markierte 2er-Potenzen-Schild oder Tür-Schild ist
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mat => {
        if (mat && mat.map && mat.map.image) {
          if (mat.map.image.__fnsPotenzSign || mat.map.image.__fnsPotenzDoor) {
            potenzSigns.push({
              mesh: m,
              isMainSign: !!mat.map.image.__fnsPotenzSign,
              center: center.clone(),
              box: box.clone()
            });
          }
        }
      });

      if (size.y <= 1.6 && size.x >= 0.7 && size.z >= 0.7) {
        walkableSurfaces.push({
          mesh: m,
          x: center.x,
          y: box.max.y,
          z: center.z,
          sizeX: size.x,
          sizeY: size.y,
          sizeZ: size.z,
          box: box.clone()
        });
      }

      if (size.y >= 1.2 && box.max.y >= camPos.y - 4.0) {
        if (size.x > 10 && size.z > 10 && box.containsPoint(camPos)) return;
        obstacles.push(box.clone());
      }
    });

    cachedObstacleBoxes = obstacles;
    return { obstacles, walkableSurfaces, potenzSigns, highTowerMeshes, towerBox, levelBox };
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
    const meshes = getCollidableMeshes(scene);

    const camPos = new THREE.Vector3(0, 1.6, 0);
    const camDir = new THREE.Vector3(0, 0, -1);
    if (cam) {
      cam.getWorldPosition(camPos);
      cam.getWorldDirection(camDir);
      camDir.y = 0;
      if (camDir.lengthSq() > 0.001) camDir.normalize();
      else camDir.set(0, 0, -1);
    }

    const { obstacles, walkableSurfaces, potenzSigns, highTowerMeshes, towerBox, levelBox } = analyzeSceneGeometry(meshes, camPos);
    const startFloorY = raycastFloorStrict(meshes, camPos.x, camPos.y, camPos.z, 5.0) ?? (camPos.y - 1.55);

    // 1. DER GANG
    if (strategy === 'hallway_outside_room') {
      const fwdHits = new THREE.Raycaster(new THREE.Vector3(camPos.x, camPos.y - 0.2, camPos.z), camDir, 0.2, 60.0).intersectObjects(meshes, false);
      const maxClear = fwdHits.length > 0 ? fwdHits[0].distance : 22.0;
      const dist = maxClear > 8.0 ? Math.min(15.0, maxClear * 0.6) : 11.0;
      const pt = camPos.clone().addScaledVector(camDir, dist);
      const fy = raycastFloorStrict(meshes, pt.x, camPos.y, pt.z, 5.0) ?? startFloorY;
      return [{ x: pt.x, y: fy + STICKER_HEIGHT_OFFSET, z: pt.z }];
    }

    // 2. SCHOOL HALLWAY (Exakt mittig auf der Haupt-Schulgang-Achse!)
    if (strategy === 'school_middle') {
      const axes = [
        camDir.clone(),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0)
      ];
      let bestAxis = camDir.clone();
      let bestLen = 0;
      axes.forEach(ax => {
        ax.y = 0;
        if (ax.lengthSq() < 0.01) return;
        ax.normalize();
        const hits = new THREE.Raycaster(new THREE.Vector3(camPos.x, camPos.y - 0.3, camPos.z), ax, 0.3, 100.0).intersectObjects(meshes, false);
        const clearDist = hits.length > 0 ? hits[0].distance : 40.0;
        if (clearDist > bestLen) {
          bestLen = clearDist;
          bestAxis = ax;
        }
      });

      const d1 = Math.min(16.0, Math.max(8.0, bestLen * 0.48));
      const p1 = camPos.clone().addScaledVector(bestAxis, d1);
      const fy1 = raycastFloorStrict(meshes, p1.x, camPos.y, p1.z, 5.0) ?? startFloorY;
      return [{ x: p1.x, y: fy1 + STICKER_HEIGHT_OFFSET, z: p1.z }];
    }

    // 3. TREPPENHAUS DER 2ER-POTENZEN (In SchoolLevelManager.js: Findet den Treppenturm & das "GESUCHTER AUSGANG"-Schild!)
    if (strategy === 'staircase_landing') {
      const spots = [];

      // Methode A: Anhand des 3D-Schilds ("GESUCHTER AUSGANG" / "FOLGE:") im Treppenhaus
      const mainSigns = potenzSigns.filter(s => s.isMainSign);
      const doorSigns = potenzSigns.filter(s => !s.isMainSign);

      mainSigns.forEach(sign => {
        // Prüfe in 4 Richtungen um das Schild (2.2m Abstand), wo der freie Raum vor der Treppe ist
        const testOffsets = [
          { dx: 2.2, dz: 0 },
          { dx: -2.2, dz: 0 },
          { dx: 0, dz: 2.2 },
          { dx: 0, dz: -2.2 }
        ];
        testOffsets.forEach(off => {
          const tx = sign.center.x + off.dx;
          const tz = sign.center.z + off.dz;
          const fy = raycastFloorStrict(meshes, tx, sign.center.y + 1.2, tz, 4.5);
          if (fy !== null) {
            const c = centerInCorridor(meshes, tx, fy + 0.85, tz);
            spots.push({ x: c.x, y: fy + 0.85, z: c.z });
          }
        });
      });

      // Methode B: Direkt auf den Treppen-Podesten im 2er-Potenzen-Treppenturm (towerBox = alle Meshes mit y > 4.6m)
      if (!towerBox.isEmpty()) {
        const towerCenter = new THREE.Vector3();
        towerBox.getCenter(towerCenter);

        // Suche alle begehbaren Stufen/Podeste innerhalb der (X, Z)-Grundfläche des Treppenturms
        const towerSurfaces = walkableSurfaces.filter(ws =>
          ws.x >= towerBox.min.x - 2.0 && ws.x <= towerBox.max.x + 2.0 &&
          ws.z >= towerBox.min.z - 2.0 && ws.z <= towerBox.max.z + 2.0 &&
          ws.sizeX <= 12.0 && ws.sizeZ <= 12.0
        );
        towerSurfaces.sort((a, b) => a.y - b.y);

        towerSurfaces.forEach(ts => {
          if (spots.length >= 8) return;
          const sp = { x: ts.x, y: ts.y + 0.85, z: ts.z };
          if (!spots.some(ex => Math.hypot(ex.x - sp.x, ex.z - sp.z) < 2.0 && Math.abs(ex.y - sp.y) < 1.8)) {
            spots.push(sp);
          }
        });

        // Zusätzlich im Zentrum und an den 4 Quadranten des Treppenturms auf Etagenhöhe (y = 1.2m, 3.8m, 6.8m) raycasten
        const samplePts = [
          { x: towerCenter.x, z: towerCenter.z },
          { x: towerCenter.x + 2.2, z: towerCenter.z + 2.2 },
          { x: towerCenter.x - 2.2, z: towerCenter.z + 2.2 },
          { x: towerCenter.x + 2.2, z: towerCenter.z - 2.2 },
          { x: towerCenter.x - 2.2, z: towerCenter.z - 2.2 }
        ];
        [startFloorY + 2.2, startFloorY + 4.8, startFloorY + 7.5].forEach(testY => {
          samplePts.forEach(pt => {
            if (spots.length >= 10) return;
            const fy = raycastFloorStrict(meshes, pt.x, testY, pt.z, 3.2);
            if (fy !== null && fy >= startFloorY - 0.2) {
              const sp = { x: pt.x, y: fy + 0.85, z: pt.z };
              if (!spots.some(ex => Math.hypot(ex.x - sp.x, ex.z - sp.z) < 2.2 && Math.abs(ex.y - sp.y) < 1.8)) {
                spots.push(sp);
              }
            }
          });
        });
      }

      // Methode C: Vor den 2er-Potenz-Türen (2^1, 2^2, 2^3...)
      doorSigns.slice(0, 4).forEach(ds => {
        const c = centerInCorridor(meshes, ds.center.x, ds.center.y - 0.3, ds.center.z);
        spots.push({ x: c.x, y: ds.center.y - 0.3, z: c.z });
      });

      return spots;
    }

    // 4. MEGA LABYRINTH (Mind. 20m vom Spawn entfernt, auf allen Etagen/Ecken in echten Gängen)
    if (strategy === 'labyrinth_open_corners') {
      const validCorridorSpots = [];

      if (!levelBox.isEmpty()) {
        const minX = levelBox.min.x + 2.0;
        const maxX = levelBox.max.x - 2.0;
        const minZ = levelBox.min.z + 2.0;
        const maxZ = levelBox.max.z - 2.0;
        const spanX = Math.max(10, maxX - minX);
        const spanZ = Math.max(10, maxZ - minZ);
        const stepX = Math.max(3.0, spanX / 13);
        const stepZ = Math.max(3.0, spanZ / 13);

        const testEyeHeights = [camPos.y, camPos.y - 3.2, camPos.y + 3.2, camPos.y - 6.4];

        for (let hIdx = 0; hIdx < testEyeHeights.length; hIdx++) {
          const testEyeY = testEyeHeights[hIdx];
          if (testEyeY < levelBox.min.y || testEyeY > levelBox.max.y + 2.0) continue;

          for (let x = minX; x <= maxX; x += stepX) {
            for (let z = minZ; z <= maxZ; z += stepZ) {
              if (Math.hypot(x - camPos.x, z - camPos.z) < 20.0) continue;
              const openSpot = isInsideLevelAndOpen(meshes, obstacles, x, testEyeY, z);
              if (openSpot && Math.hypot(openSpot.x - camPos.x, openSpot.z - camPos.z) >= 19.5) {
                validCorridorSpots.push(openSpot);
              }
            }
          }
        }
      }

      walkableSurfaces.forEach(ws => {
        if (Math.hypot(ws.x - camPos.x, ws.z - camPos.z) >= 20.0) {
          const openSpot = isInsideLevelAndOpen(meshes, obstacles, ws.x, ws.y + 1.4, ws.z);
          if (openSpot) validCorridorSpots.push(openSpot);
        }
      });

      const chosen = [];
      if (validCorridorSpots.length > 0) {
        validCorridorSpots.sort((a, b) =>
          Math.hypot(b.x - camPos.x, b.z - camPos.z) - Math.hypot(a.x - camPos.x, a.z - camPos.z)
        );
        chosen.push(validCorridorSpots[0]);

        while (chosen.length < 7) {
          let bestCandidate = null;
          let bestMinDist = -1;
          for (let i = 0; i < validCorridorSpots.length; i++) {
            const cand = validCorridorSpots[i];
            let minDistToChosen = Infinity;
            for (let j = 0; j < chosen.length; j++) {
              const d = Math.hypot(cand.x - chosen[j].x, cand.z - chosen[j].z) + Math.abs(cand.y - chosen[j].y) * 2.0;
              if (d < minDistToChosen) minDistToChosen = d;
            }
            if (minDistToChosen > bestMinDist && minDistToChosen >= 12.0) {
              bestMinDist = minDistToChosen;
              bestCandidate = cand;
            }
          }
          if (!bestCandidate) break;
          chosen.push(bestCandidate);
        }
      }

      return chosen;
    }

    // 5. FLEISCHROOMS
    if (strategy === 'fleischrooms_spread') {
      const chosen = [];
      if (!levelBox.isEmpty()) {
        const minX = levelBox.min.x + 3.0;
        const maxX = levelBox.max.x - 3.0;
        const minZ = levelBox.min.z + 3.0;
        const maxZ = levelBox.max.z - 3.0;
        const stepX = Math.max(4.0, (maxX - minX) / 10);
        const stepZ = Math.max(4.0, (maxZ - minZ) / 10);

        for (let x = minX; x <= maxX; x += stepX) {
          for (let z = minZ; z <= maxZ; z += stepZ) {
            if (Math.hypot(x - camPos.x, z - camPos.z) < 16.0) continue;
            const sp = isInsideLevelAndOpen(meshes, obstacles, x, camPos.y, z);
            if (sp && !chosen.some(c => Math.hypot(c.x - sp.x, c.z - sp.z) < 22.0)) {
              chosen.push(sp);
              if (chosen.length >= 5) return chosen;
            }
          }
        }
      }
      return chosen;
    }

    // 6. BIBLIOTHEK
    if (strategy === 'library_aisle') {
      const chosen = [];
      if (!levelBox.isEmpty()) {
        const minX = levelBox.min.x + 2.5;
        const maxX = levelBox.max.x - 2.5;
        const minZ = levelBox.min.z + 2.5;
        const maxZ = levelBox.max.z - 2.5;
        const stepX = Math.max(3.0, (maxX - minX) / 8);
        const stepZ = Math.max(3.0, (maxZ - minZ) / 8);

        for (let x = minX; x <= maxX; x += stepX) {
          for (let z = minZ; z <= maxZ; z += stepZ) {
            if (Math.hypot(x - camPos.x, z - camPos.z) < 9.0) continue;
            const sp = isInsideLevelAndOpen(meshes, obstacles, x, camPos.y, z);
            if (sp) {
              sp.y = startFloorY + STICKER_HEIGHT_OFFSET;
              if (!chosen.some(c => Math.hypot(c.x - sp.x, c.z - sp.z) < 12.0)) {
                chosen.push(sp);
                if (chosen.length >= 3) return chosen;
              }
            }
          }
        }
      }
      const p = camPos.clone().addScaledVector(camDir, 10.5);
      return [{ x: p.x, y: startFloorY + STICKER_HEIGHT_OFFSET, z: p.z }];
    }

    // 7. GEHEIMER 8. STICKER
    if (strategy === 'secret_spread') {
      if (!levelBox.isEmpty()) {
        const minX = levelBox.min.x + 3.0;
        const maxX = levelBox.max.x - 3.0;
        const minZ = levelBox.min.z + 3.0;
        const maxZ = levelBox.max.z - 3.0;
        const stepX = Math.max(4.0, (maxX - minX) / 8);
        const stepZ = Math.max(4.0, (maxZ - minZ) / 8);

        for (let x = maxX; x >= minX; x -= stepX) {
          for (let z = maxZ; z >= minZ; z -= stepZ) {
            if (Math.hypot(x - camPos.x, z - camPos.z) < 25.0) continue;
            const sp = isInsideLevelAndOpen(meshes, obstacles, x, camPos.y, z);
            if (sp && !activeSpawns.some(a => a && a.group && Math.hypot(a.group.position.x - sp.x, a.group.position.z - sp.z) < 18.0)) {
              return [sp];
            }
          }
        }
      }
      return [];
    }

    return [];
  }

  // --- CREATE 3D STICKER MESH ---
  function createStickerInstance(scene, def, isGold, pos, raftData) {
    const THREE = window.THREE;
    if (!THREE || !scene) return;

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

    const geo = new THREE.PlaneGeometry(1.12, 1.12);
    const mat = new THREE.MeshBasicMaterial({
      color: isGold ? 0xffe680 : 0xffffff,
      side: THREE.FrontSide,
      transparent: true
    });

    const frontMesh = new THREE.Mesh(geo, mat);
    frontMesh.position.z = 0.003;
    frontMesh.userData.isStickerPart = true;
    group.add(frontMesh);

    const backMesh = new THREE.Mesh(geo, mat);
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
    const whiteMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), whiteOverlayMat);
    whiteMesh.userData.isStickerPart = true;
    group.add(whiteMesh);

    const glowTex = isGold
      ? createGlowTexture('rgba(255, 220, 40, 0.95)', 'rgba(255, 165, 0, 0.45)')
      : createGlowTexture('rgba(255, 255, 255, 0.72)', 'rgba(180, 210, 255, 0.18)');
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      opacity: isGold ? 0.9 : 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(2.2, 2.2, 1);
    glowSprite.userData.isStickerPart = true;
    group.add(glowSprite);

    const raysTex = createRaysTexture();
    const raysMat1 = new THREE.SpriteMaterial({
      map: raysTex,
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
      map: raysTex,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const raysSprite2 = new THREE.Sprite(raysMat2);
    raysSprite2.scale.set(3.3, 3.3, 1);
    raysSprite2.userData.isStickerPart = true;
    group.add(raysSprite2);

    const particles = [];
    const pGeo = new THREE.PlaneGeometry(0.09, 0.09);
    for (let i = 0; i < 26; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: isGold ? 0xffd700 : 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isGold ? 0.85 : 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.userData.isStickerPart = true;
      const angle = (i / 26) * Math.PI * 2;
      const radius = 0.5 + Math.random() * 0.5;
      const heightOffset = (Math.random() - 0.5) * 1.0;
      pMesh.position.set(Math.cos(angle) * radius, heightOffset, Math.sin(angle) * radius);
      group.add(pMesh);
      particles.push({ mesh: pMesh, mat: pMat, angle, radius, heightOffset, speed: 1.6 + Math.random() * 2.2 });
    }

    const light = new THREE.PointLight(isGold ? 0xffc400 : 0xffffff, isGold ? 2.2 : 0.85, 6.5);
    light.userData.isStickerPart = true;
    group.add(light);

    loadStickerTexture(def, isGold, tex => {
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
      particles,
      light,
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
        if (s && s.group && s.group.parent) {
          s.group.parent.remove(s.group);
        }
        activeSpawns.splice(i, 1);
      }
    }
  }

  function clearActiveSpawns() {
    clearSpawnsByDefId(null);
  }

  function decideSpawnMode(def, levelKey) {
    const secondRun = isSecondPlaythrough(levelKey);
    if (def.isEighthSticker && !secondRun) return null;

    const hasNormal = !!saveState.normal[def.id];
    const hasGold = !!saveState.gold[def.id];

    if (!hasNormal) return { isGold: false };

    if (secondRun && !hasGold) {
      if (saveState.forceGold || saveState.goldPity >= 1 || Math.random() < GOLD_SPAWN_CHANCE) {
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

  function spawnSingleStickerDef(def, scene, cam, inst) {
    if (!def) return;
    clearSpawnsByDefId(def.id);
    const mode = decideSpawnMode(def, def.id);
    if (!mode) return;

    if (def.attachToRaft) {
      const camPos = new window.THREE.Vector3();
      if (cam) cam.getWorldPosition(camPos);
      const raftData = findMidRaftInBoilerLevel(inst, scene, camPos);
      if (raftData) {
        createStickerInstance(scene, def, mode.isGold, null, raftData);
      } else {
        const spots = computeLocationsForStrategy('school_middle', inst, scene, cam);
        spots.forEach(pt => createStickerInstance(scene, def, mode.isGold, pt, null));
      }
    } else {
      const spots = computeLocationsForStrategy(def.strategy, inst, scene, cam);
      spots.forEach(pt => createStickerInstance(scene, def, mode.isGold, pt, null));
    }
  }

  function spawnForActiveLevel(levelKey, inst) {
    ensureThreeHook();
    const scene = extractScene(inst);
    const cam = extractCamera(inst);
    if (!scene || !window.THREE) return;

    const meshes = getCollidableMeshes(scene);
    if (meshes.length < 2) {
      clearTimeout(spawnTimeout);
      spawnTimeout = setTimeout(() => spawnForActiveLevel(levelKey, inst), 300);
      return;
    }

    clearActiveSpawns();

    if (cam) {
      lastSpawnPlayerPos = new window.THREE.Vector3();
      cam.getWorldPosition(lastSpawnPlayerPos);
    }
    levelLoadTimestamp = performance.now();

    // WICHTIG: SchoolLevelManager enthält SOWOHL den School Hallway ALS AUCH das 2er-Potenzen-Treppenhaus!
    if (levelKey === 'school_hallway' || levelKey === 'potenz_treppenhaus') {
      const schoolDef = STICKER_DEFS.find(d => d.id === 'school_hallway');
      const stairDef = STICKER_DEFS.find(d => d.id === 'potenz_treppenhaus');
      spawnSingleStickerDef(schoolDef, scene, cam, inst);
      spawnSingleStickerDef(stairDef, scene, cam, inst);
      saveState.levelsSeen['school_hallway'] = (saveState.levelsSeen['school_hallway'] || 0) + 1;
      saveState.levelsSeen['potenz_treppenhaus'] = (saveState.levelsSeen['potenz_treppenhaus'] || 0) + 1;
    } else {
      const def = STICKER_DEFS.find(d => d.id === levelKey);
      spawnSingleStickerDef(def, scene, cam, inst);
      saveState.levelsSeen[levelKey] = (saveState.levelsSeen[levelKey] || 0) + 1;
    }

    // 8. Sticker (ab 2. Durchlauf, außer im Mega Labyrinth)
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
    }, 350);
  }

  // --- COLLECT & LEGO ANIMATION ---
  function triggerCollect(targetSpawn) {
    if (!targetSpawn || targetSpawn.collecting) return;
    targetSpawn.collecting = true;
    targetSpawn.collectTime = 0;
    targetSpawn.spinSpeed = 3.8;

    const def = targetSpawn.def;
    const isGold = targetSpawn.isGold;

    collectedInCurrentRun[def.id] = true;
    if (isGold) {
      saveState.gold[def.id] = true;
    } else {
      saveState.normal[def.id] = true;
    }
    writeSave();

    // Nur die anderen Kopien DESSELBEN Stickers entfernen (lässt den Treppenhaus-Sticker im SchoolLevel unberührt!)
    for (let i = activeSpawns.length - 1; i >= 0; i--) {
      const other = activeSpawns[i];
      if (!other) {
        activeSpawns.splice(i, 1);
        continue;
      }
      if (other !== targetSpawn && other.def && other.def.id === def.id) {
        if (other.group && other.group.parent) {
          other.group.parent.remove(other.group);
        }
        activeSpawns.splice(i, 1);
      }
    }

    playLegoCollectSound(isGold);
    showStickerToast(def, isGold);
    updateStickerMenuUI();
  }

  // --- LIVE-KARTE / MINIMAP ---
  function updateMinimapDisplay(playerPos, camDir, now) {
    let mapBox = document.getElementById('fns-radar-map-box');
    const mapRelevantSpawns = activeSpawns.filter(s => s && s.group && !s.collecting && s.def && s.def.showOnMap);
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

    ctx.strokeStyle = 'rgba(158, 42, 28, 0.22)';
    ctx.lineWidth = 1;
    for (let g = 23; g < W; g += 23) {
      ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(W, g); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(158, 42, 28, 0.55)';
    for (let i = 0; i < cachedObstacleBoxes.length; i++) {
      const b = cachedObstacleBoxes[i];
      const rx = cx + (b.min.x - playerPos.x) * scale;
      const ry = cy + (b.min.z - playerPos.z) * scale;
      const rw = Math.max(2, (b.max.x - b.min.x) * scale);
      const rh = Math.max(2, (b.max.z - b.min.z) * scale);
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
      ctx.fillText(`${Math.round(distM)}m`, 0, -7);
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

  // Dynamischer Treppenhaus-Prüfer: Wenn der Spieler im SchoolLevel die Treppe betritt (oder "SCHIEBETÜR VERRIEGELT" erscheint),
  // stellt er sicher, dass direkt auf der Treppe vor dem Spieler ein Exemplar von LogikRuftAn.webp liegt!
  let dynamicStairPlaced = false;
  function checkDynamicStairwellProximity(playerPos, camDir, scene) {
    if (!playerPos || !camDir || !scene) return;
    if (activeLevelKey !== 'school_hallway' && activeLevelKey !== 'potenz_treppenhaus') return;
    if (collectedInCurrentRun['potenz_treppenhaus']) return;

    const stairDef = STICKER_DEFS.find(d => d.id === 'potenz_treppenhaus');
    const mode = decideSpawnMode(stairDef, 'potenz_treppenhaus');
    if (!mode) return;

    // Wenn der Spieler auf der Treppe nach oben geht (playerPos.y > 2.2) oder die Schiebetür-Meldung aktiv ist:
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

    if (now - lastHudCheck > 450) {
      lastHudCheck = now;
      syncStickerMenuVisibility();
      checkDynamicStairwellProximity(playerPos, camDir, scene);
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
      if (!s || !s.group) continue;

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

        if (s.isGold) {
          s.raysMat1.rotation += dt * 0.9;
          s.particles.forEach(p => {
            p.angle += dt * p.speed;
            p.mesh.position.x = Math.cos(p.angle) * p.radius;
            p.mesh.position.z = Math.sin(p.angle) * p.radius;
            p.mesh.rotation.y += dt * 4.0;
          });
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
        s.collectTime += dt;
        const t = s.collectTime;
        const duration = 1.65;

        s.spinSpeed += dt * 44.0;
        s.group.rotation.y += dt * s.spinSpeed;
        s.group.position.y += dt * 0.42;

        const glowP = Math.min(1.0, t / 1.25);
        s.whiteOverlayMat.opacity = Math.pow(glowP, 1.35) * 0.96;
        s.glowMat.opacity = 0.9 + glowP * 0.1;
        const haloScale = 2.2 + glowP * 3.4;
        s.glowSprite.scale.set(haloScale, haloScale, 1);

        const rayAlpha = Math.sin(Math.min(1.0, t / duration) * Math.PI);
        s.raysMat1.opacity = rayAlpha * 0.95;
        s.raysMat2.opacity = rayAlpha * 0.85;
        s.raysMat1.rotation += dt * 3.6;
        s.raysMat2.rotation -= dt * 2.9;
        const rayScale = 2.6 + glowP * 2.9;
        s.raysSprite1.scale.set(rayScale, rayScale, 1);
        s.raysSprite2.scale.set(rayScale * 1.15, rayScale * 1.15, 1);

        s.light.color.setHex(0xffffff);
        s.light.intensity = 2.5 + glowP * 8.0;
        s.light.distance = 8.0 + glowP * 9.0;

        s.particles.forEach(p => {
          p.mat.color.setHex(0xffffff);
          p.mat.opacity = rayAlpha;
          p.angle += dt * (p.speed * 4.5);
          const rad = p.radius * (1.0 + glowP * 1.6);
          p.mesh.position.x = Math.cos(p.angle) * rad;
          p.mesh.position.z = Math.sin(p.angle) * rad;
          p.mesh.position.y = p.heightOffset + Math.sin(t * 10.0 + p.angle) * 0.22;
          p.mesh.rotation.x += dt * 8.0;
          p.mesh.rotation.y += dt * 8.0;
        });

        if (t > 1.25) {
          const shrink = Math.max(0.001, 1.18 * (1.0 - (t - 1.25) / (duration - 1.25)));
          s.group.scale.set(shrink, shrink, shrink);
        } else {
          const pop = 1.0 + glowP * 0.18;
          s.group.scale.set(pop, pop, pop);
        }

        if (t >= duration) {
          if (s.group.parent) s.group.parent.remove(s.group);
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
        grid-template-rows: repeat(2, 198px);
        gap: 12px;
        width: 100%;
      }
      .fns-sticker-card {
        background: rgba(6, 6, 8, 0.88);
        border: 1px solid rgba(158, 42, 28, 0.55);
        border-radius: 0;
        padding: 8px 6px 6px 6px;
        height: 198px;
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
        width: 152px;
        height: 152px;
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        flex-shrink: 0;
      }
      .fns-sticker-img-wrap img {
        width: 148px;
        height: 148px;
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
      stats.innerHTML = `
        <span>GEFUNDEN: ${normalCount} / ${secondRun ? 8 : 7}</span>
        <span style="color:#ffd700;">★ GOLD: ${goldCount} / 8</span>
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
      card.innerHTML = `
        <span class="fns-card-index">#0${idx + 1}</span>
        ${hasGold ? '<div class="fns-gold-badge" title="Gold-Filter umschalten">★ GOLD</div>' : ''}
        <div class="fns-sticker-img-wrap">
          <img src="${def.file}" alt="${unlocked ? def.levelName : '???'}" class="${showGold ? 'fns-gold-img' : ''}" />
        </div>
        <div class="fns-sticker-loc">${unlocked ? def.levelName : `??? (${def.levelName})`}</div>
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
        badge.addEventListener('click', () => {
          showGold = !showGold;
          imgEl.classList.toggle('fns-gold-img', showGold);
          badge.textContent = showGold ? '★ GOLD' : 'NORMAL';
        });
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
    if (!cam || activeSpawns.length === 0) {
      console.warn('[StickerSystem] Kein aktiver Sticker im aktuellen Level.');
      return;
    }
    const valid = activeSpawns.find(s => s && s.group);
    if (!valid) return;
    const target = valid.group.position;
    cam.position.set(target.x, target.y + 0.5, target.z + 1.2);
    console.log('[StickerSystem] Zum Sticker teleportiert:', target);
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
