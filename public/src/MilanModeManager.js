import * as THREE from 'three';
// MilanModeManager.js - Extreme Milan Difficulty & Furz-Button Mechanic

export class MilanModeManager {
    constructor() {
        this.isMilan = false;
        this.cooldownDuration = 45000; // 45s huge cooldown
        this.lastFurzTime = -999999;
        this.stunDuration = 9.0; // seconds Fleischies stay knocked on the floor
        this.furzRadius = 38.0;

        this.scene = null;
        this.camera = null;
        this.THREE = (typeof THREE !== 'undefined' ? THREE : ((typeof window !== 'undefined' && window.THREE) ? window.THREE : null));

        this.registeredMonsters = new Set();
        this.levelManagers = new Map();
        this.spawnedMilanClones = [];
        this.smokeParticles = [];
        this.shockwaves = [];
        this.knockedMeshes = new Map();
        this.lastFrameTime = performance.now();
        this.lastFrameId = -1;
        this.smokeTexture = null;
        this.monsterTextures = {};
        this.audioCtx = null;

        this.uiContainer = null;
        this.uiProgressBar = null;
        this.uiCooldownText = null;
        this.uiScreenFx = null;

        if (typeof window !== 'undefined') {
            window.milanMode = this;
            window.MilanModeManager = MilanModeManager;
            this._initWhenReady();
        }
    }

    _initWhenReady() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        this._createUI();
        this._bindHotkeys();
        this._hookRenderer();
        this._startDifficultyWatcher();
        this._startAutonomousLoop();
    }

    setTHREE(threeLib) {
        if (threeLib && !this.THREE) {
            this.THREE = threeLib;
            this._hookRenderer();
        }
    }

    _hookRenderer() {
        const T = this.THREE || (typeof window !== 'undefined' ? window.THREE : null);
        if (!T || !T.WebGLRenderer || T.WebGLRenderer.prototype._milanHooked) return;
        this.THREE = T;

        const self = this;
        const origRender = T.WebGLRenderer.prototype.render;
        T.WebGLRenderer.prototype.render = function (scene, camera) {
            if (scene && scene.isScene && camera && camera.isCamera) {
                if (scene.children && scene.children.length >= 2 && camera.isPerspectiveCamera) {
                    self.scene = scene;
                    self.camera = camera;
                    self._onBeforeSceneRender(scene, camera);
                }
            }
            return origRender.apply(this, arguments);
        };
        T.WebGLRenderer.prototype._milanHooked = true;
    }

    _startAutonomousLoop() {
        const tick = (now) => {
            const dt = Math.min(0.1, Math.max(0.001, (now - this.lastFrameTime) / 1000));
            this.lastFrameTime = now;
            this.update(dt);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    _startDifficultyWatcher() {
        const check = () => {
            const detected = this.detectMilanDifficulty();
            if (detected !== this.isMilan) {
                this.setMilanActive(detected);
            }
            this._updateUIVisibility();
        };
        setInterval(check, 250);
        window.addEventListener('click', () => setTimeout(check, 60));
    }

    detectMilanDifficulty() {
        if (this._explicitMilan !== undefined) return this._explicitMilan;

        try {
            const dm = window.difficultyManager || window.game?.difficultyManager || window.app?.difficultyManager;
            if (dm) {
                const val = dm.currentDifficulty || dm.difficulty || dm.selectedDifficulty || dm.mode || (typeof dm.getDifficulty === 'function' ? dm.getDifficulty() : '');
                if (typeof val === 'string' && val.toLowerCase().includes('milan')) return true;
                if (val && typeof val === 'object' && String(val.id || val.name || '').toLowerCase().includes('milan')) return true;
            }

            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.toLowerCase().includes('diff')) {
                    const v = localStorage.getItem(k);
                    if (v && v.toLowerCase().includes('milan')) return true;
                }
            }

            const selectedEls = document.querySelectorAll('.selected, .active, [aria-selected="true"], .difficulty-selected');
            for (const el of selectedEls) {
                const txt = (el.getAttribute('data-difficulty') || el.id || el.textContent || '').toLowerCase();
                if (txt.includes('milan')) return true;
            }
        } catch (e) {}

        return false;
    }

    setMilanActive(active) {
        const wasMilan = this.isMilan;
        this.isMilan = Boolean(active);
        this._explicitMilan = this.isMilan;
        this._updateUIVisibility();

        if (this.isMilan && !wasMilan) {
            this._applyHardcoreToAllRegistered();
        }
    }

    registerDifficultyManager(dm) {
        if (!dm) return;
        window.difficultyManager = dm;
        const val = dm.currentDifficulty || dm.difficulty || dm.selectedDifficulty || '';
        if (String(val).toLowerCase().includes('milan')) {
            this.setMilanActive(true);
        }
    }

    registerMonster(monster) {
        if (!monster) return;
        this.registeredMonsters.add(monster);
        if (this.isMilan) {
            this._buffMonsterInstance(monster);
        }
    }

    registerLevelManager(levelType, manager) {
        if (!manager) return;
        this.levelManagers.set(levelType, manager);
        if (this.isMilan) {
            setTimeout(() => this._enhanceLevelForMilan(levelType, manager), 400);
        }
    }

    _applyHardcoreToAllRegistered() {
        for (const m of this.registeredMonsters) {
            this._buffMonsterInstance(m);
        }
        for (const [type, mgr] of this.levelManagers.entries()) {
            this._enhanceLevelForMilan(type, mgr);
        }
    }

    _buffMonsterInstance(m) {
        if (!m || m._milanBuffed) return;
        m._milanBuffed = true;

        const speedProps = [
            'speed', 'moveSpeed', 'baseSpeed', 'walkSpeed', 'runSpeed',
            'chaseSpeed', 'patrolSpeed', 'stalkSpeed', 'maxSpeed', 'huntSpeed'
        ];
        for (const prop of speedProps) {
            if (typeof m[prop] === 'number' && m[prop] > 0) {
                m['_orig_' + prop] = m[prop];
                m[prop] *= 1.95; // Nearly 2x faster in Milan mode
            }
        }

        const rangeProps = [
            'aggroRange', 'detectionRange', 'sightRange', 'hearingRange',
            'senseRange', 'chaseRange', 'visionDistance'
        ];
        for (const prop of rangeProps) {
            if (typeof m[prop] === 'number' && m[prop] > 0) {
                m['_orig_' + prop] = m[prop];
                m[prop] *= 2.4;
            }
        }
    }

    getMonsterSpeedMultiplier(monster) {
        if (!this.isMilan) return 1.0;
        if (monster && monster._milanFurzKnockedDown) return 0.0;
        return 1.85;
    }

    _enhanceLevelForMilan(levelType, mgr) {
        if (!this.isMilan || !mgr || mgr._milanLevelEnhanced) return;
        mgr._milanLevelEnhanced = true;

        // 1. Buff any existing monster arrays or single monster references on the level manager
        const arrayNames = ['monsters', 'fleischies', 'enemies', 'entities', 'stalkers', 'hunters', 'clones'];
        for (const arrName of arrayNames) {
            if (Array.isArray(mgr[arrName])) {
                mgr[arrName].forEach(m => this.registerMonster(m));
            }
        }
        if (mgr.monster) this.registerMonster(mgr.monster);
        if (mgr.fleischi) this.registerMonster(mgr.fleischi);
        if (mgr.enemy) this.registerMonster(mgr.enemy);

        // 2. Boost level-wide speed properties if stored directly on the manager
        const mgrSpeedProps = ['monsterSpeed', 'fleischiSpeed', 'enemySpeed', 'chaseSpeed', 'stalkerSpeed', 'baseMonsterSpeed'];
        for (const prop of mgrSpeedProps) {
            if (typeof mgr[prop] === 'number' && mgr[prop] > 0) {
                mgr[prop] *= 1.95;
            }
        }

        // 3. Call native spawn methods extra times if available
        const extraNativeSpawns = levelType === 'MultiFloorLabyrinth' ? 6 : (levelType === 'Fleischrooms' ? 4 : 2);
        const spawnMethodNames = ['spawnMonster', 'spawnFleischi', 'addMonster', 'addFleischi', 'createMonster', 'createFleischi'];
        let usedNativeSpawner = false;

        for (const fnName of spawnMethodNames) {
            if (typeof mgr[fnName] === 'function') {
                for (let i = 0; i < extraNativeSpawns; i++) {
                    try {
                        const spawned = mgr[fnName]();
                        if (spawned) this.registerMonster(spawned);
                        usedNativeSpawner = true;
                    } catch (e) {}
                }
                break;
            }
        }

        // (Keine Zylinder-Klone mehr: Milan-Schwierigkeit läuft über echte Fleischis + höhere Tür-Spawn-Chance)
    }

    _spawnAutonomousMilanFleischies(scene, count, levelType, mgr) {
        return; // deaktiviert: die roten Zylinder-Klone sind entfernt
        // eslint-disable-next-line no-unreachable
        const T = this.THREE || window.THREE;
        if (!T || !scene) return;

        // Clean up clones from destroyed scenes
        this.spawnedMilanClones = this.spawnedMilanClones.filter(c => c.scene === scene);
        if (this.spawnedMilanClones.length >= 14) return;

        const texLoader = new T.TextureLoader();
        const faceTex = texLoader.load('assets/textures/fleischi_face_monster.png');
        const milanTex = texLoader.load('assets/textures/Milan.png');

        const basePos = this.camera ? this.camera.position : new T.Vector3(0, 1.7, 0);
        const floorHeight = (mgr && typeof mgr.floorHeight === 'number') ? mgr.floorHeight : 4.5;
        const numFloors = (levelType === 'MultiFloorLabyrinth') ? (mgr?.numFloors || mgr?.floors || 3) : 1;

        for (let i = 0; i < count; i++) {
            const group = new T.Group();
            group.name = `MilanHunterFleischi_${i}`;
            group.userData.isFleischi = true;
            group.userData.isMilanClone = true;

            // Body
            const bodyGeo = new T.CylinderGeometry(0.42, 0.52, 1.65, 12);
            const bodyMat = new T.MeshStandardMaterial({
                color: 0x3a0d0d,
                roughness: 0.55,
                metalness: 0.15,
                emissive: 0x1a0000
            });
            const bodyMesh = new T.Mesh(bodyGeo, bodyMat);
            bodyMesh.position.y = 0.825;
            group.add(bodyMesh);

            // Head billboard / sphere with Fleischi Monster / Milan texture
            const headGeo = new T.PlaneGeometry(1.15, 1.15);
            const headMat = new T.MeshBasicMaterial({
                map: (i % 2 === 0) ? faceTex : milanTex,
                transparent: true,
                side: T.DoubleSide
            });
            const headMesh = new T.Mesh(headGeo, headMat);
            headMesh.position.y = 1.95;
            group.add(headMesh);

            // Glowing red Milan eyes aura light
            const auraLight = new T.PointLight(0xff1e00, 1.4, 7.5);
            auraLight.position.set(0, 1.9, 0.3);
            group.add(auraLight);

            // Distribute around the labyrinth/Fleischrooms at a safe initial distance (14-36m)
            const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.5);
            const dist = 15 + Math.random() * 22;
            const floorIdx = (levelType === 'MultiFloorLabyrinth') ? (i % numFloors) : 0;
            const spawnY = (levelType === 'MultiFloorLabyrinth')
                ? (floorIdx * floorHeight)
                : Math.max(0, basePos.y - 1.6);

            group.position.set(
                basePos.x + Math.cos(angle) * dist,
                spawnY,
                basePos.z + Math.sin(angle) * dist
            );

            scene.add(group);

            const cloneObj = {
                mesh: group,
                headMesh,
                scene,
                speed: 4.8 + Math.random() * 1.6, // Fast & terrifying in Milan mode
                floorY: spawnY,
                patrolAngle: angle,
                patrolTimer: Math.random() * 5,
                _milanFurzKnockedDown: false,
                _milanFurzTimer: 0,
                _origY: spawnY
            };

            this.spawnedMilanClones.push(cloneObj);
            this.registeredMonsters.add(cloneObj);
        }
    }

    _discoverSceneFleischies(scene) {
        const found = [];
        if (!scene || !scene.children) return found;

        scene.traverse((obj) => {
            if (!obj || obj === scene) return;
            const name = String(obj.name || '').toLowerCase();
            const ud = obj.userData || {};
            if (
                ud.isFleischi ||
                ud.isMonster ||
                ud.isEnemy ||
                name.includes('fleischi') ||
                name.includes('monster') ||
                name.includes('stalker') ||
                name.includes('blind')
            ) {
                // Prefer top-level group/mesh directly under scene
                let root = obj;
                while (root.parent && root.parent !== scene) {
                    root = root.parent;
                }
                if (!found.includes(root)) {
                    found.push(root);
                }
            } else if (obj.isMesh && obj.material && obj.material.map && obj.material.map.image) {
                const src = String(obj.material.map.image.src || '').toLowerCase();
                if (src.includes('fleischi') || src.includes('milan') || src.includes('mats') || src.includes('praeti')) {
                    let root = obj;
                    while (root.parent && root.parent !== scene) {
                        root = root.parent;
                    }
                    if (!found.includes(root)) {
                        found.push(root);
                    }
                }
            }
        });
        return found;
    }

    getCooldownRemainingMs() {
        const elapsed = performance.now() - this.lastFurzTime;
        return Math.max(0, this.cooldownDuration - elapsed);
    }

    triggerFurz() {
        if (!this.isMilan || !this._isInGame()) return false;

        const remaining = this.getCooldownRemainingMs();
        if (remaining > 0) {
            this._shakeButtonOnCooldown();
            this._playDrySputterSound();
            return false;
        }

        this.lastFurzTime = performance.now();

        // 1. Play massive reverberating Furz sound
        this._playMegaFurzSound();

        // 2. Trigger 2D HUD toxic smoke & screen shake
        this._triggerScreenFurzFX();

        // 3. Spawn 3D volumetric smoke cloud + shockwave in Three.js scene
        const origin = this._getPlayerWorldPosition();
        if (this.scene && origin) {
            this._spawn3DFurzSmoke(origin);
        }

        // 4. Knock down all Fleischies in the smoke radius!
        this._knockdownAllFleischies(origin);

        return true;
    }

    _getPlayerWorldPosition() {
        const T = this.THREE || window.THREE;
        if (this.camera && this.camera.position) {
            return this.camera.position.clone();
        }
        if (T) return new T.Vector3(0, 1.7, 0);
        return { x: 0, y: 1.7, z: 0 };
    }

    _knockdownAllFleischies(origin) {
        let count = 0;
        const targets = new Set();

        // Collect from registered monsters
        for (const m of this.registeredMonsters) {
            const mesh = m.mesh || m.model || m.group || m.object3D || m.root || (m.isObject3D ? m : null);
            if (mesh) targets.add({ wrapper: m, mesh });
            else targets.add({ wrapper: m, mesh: null });
        }

        // Collect from active level managers
        for (const mgr of this.levelManagers.values()) {
            const arrNames = ['monsters', 'fleischies', 'enemies', 'entities', 'stalkers', 'hunters'];
            for (const name of arrNames) {
                if (Array.isArray(mgr[name])) {
                    for (const item of mgr[name]) {
                        const mesh = item?.mesh || item?.model || item?.group || item?.object3D || (item?.isObject3D ? item : null);
                        targets.add({ wrapper: item, mesh });
                    }
                }
            }
            for (const single of ['monster', 'fleischi', 'enemy', 'boss']) {
                if (mgr[single]) {
                    const item = mgr[single];
                    const mesh = item?.mesh || item?.model || item?.group || item?.object3D || (item?.isObject3D ? item : null);
                    targets.add({ wrapper: item, mesh });
                }
            }
        }

        // Collect from Three.js scene traversal
        if (this.scene) {
            const sceneMeshes = this._discoverSceneFleischies(this.scene);
            for (const mesh of sceneMeshes) {
                targets.add({ wrapper: mesh.userData?.monsterInstance || mesh, mesh });
            }
        }

        for (const entry of targets) {
            const { wrapper, mesh } = entry;
            const pos = mesh?.position || wrapper?.position;

            if (pos && origin) {
                const dx = pos.x - origin.x;
                const dz = pos.z - origin.z;
                const dist = Math.hypot(dx, dz);
                if (dist > this.furzRadius) continue;
            }

            if (wrapper) {
                wrapper._milanFurzKnockedDown = true;
                wrapper._milanFurzTimer = this.stunDuration;
                wrapper.isStunned = true;
            }

            if (mesh) {
                const existing = this.knockedMeshes.get(mesh);
                const origY = existing ? existing.origY : mesh.position.y;
                const origRotX = existing ? existing.origRotX : mesh.rotation.x;
                const origRotZ = existing ? existing.origRotZ : mesh.rotation.z;

                this.knockedMeshes.set(mesh, {
                    wrapper,
                    mesh,
                    timer: this.stunDuration,
                    maxTime: this.stunDuration,
                    origY,
                    origRotX,
                    origRotZ,
                    lockedX: mesh.position.x,
                    lockedZ: mesh.position.z,
                    fallDir: (Math.random() < 0.5 ? 1 : -1)
                });

                // Spawn localized toxic smoke puffs directly on the knocked-down Fleischi
                if (this.scene && mesh.position) {
                    this._spawnChokeSmokeOnFleischi(mesh.position);
                }
            }
            count++;
        }

        // Play thud sound as Fleischies collapse onto the floor
        setTimeout(() => {
            try {
                const thud = new Audio('assets/soundeffect/playBoneCrack.mp3');
                thud.volume = 0.65;
                thud.play().catch(() => {});
            } catch (e) {}
        }, 220);

        return Math.max(1, count);
    }

    _getSmokeTexture() {
        if (this.smokeTexture) return this.smokeTexture;
        const T = this.THREE || window.THREE;
        if (!T) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
        grad.addColorStop(0.0, 'rgba(165, 230, 45, 0.88)');
        grad.addColorStop(0.35, 'rgba(115, 175, 25, 0.65)');
        grad.addColorStop(0.7, 'rgba(72, 95, 18, 0.28)');
        grad.addColorStop(1.0, 'rgba(30, 45, 10, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        this.smokeTexture = new T.CanvasTexture(canvas);
        return this.smokeTexture;
    }

    _spawn3DFurzSmoke(origin) {
        const T = this.THREE || window.THREE;
        if (!T || !this.scene) return;

        const tex = this._getSmokeTexture();

        // 1. Expanding ground toxic shockwave ring
        const ringGeo = new T.RingGeometry(0.4, 1.35, 36);
        const ringMat = new T.MeshBasicMaterial({
            color: 0x9be62b,
            transparent: true,
            opacity: 0.85,
            side: T.DoubleSide,
            depthWrite: false
        });
        const ringMesh = new T.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(origin.x, origin.y - 1.35, origin.z);
        this.scene.add(ringMesh);
        this.shockwaves.push({ mesh: ringMesh, age: 0, maxAge: 1.45 });

        // 2. 55 volumetric billowing gas clouds
        for (let i = 0; i < 55; i++) {
            const mat = new T.SpriteMaterial({
                map: tex,
                color: (i % 3 === 0) ? 0xb8ff3b : ((i % 2 === 0) ? 0x7ab818 : 0x8f7a24),
                transparent: true,
                opacity: 0.78,
                depthWrite: false
            });
            const sprite = new T.Sprite(mat);
            const angle = Math.random() * Math.PI * 2;
            const speed = 2.0 + Math.random() * 9.5;
            const initialDist = 0.3 + Math.random() * 1.4;

            sprite.position.set(
                origin.x + Math.cos(angle) * initialDist,
                origin.y - 0.9 + (Math.random() * 0.9),
                origin.z + Math.sin(angle) * initialDist
            );

            const startScale = 1.1 + Math.random() * 1.4;
            sprite.scale.set(startScale, startScale, startScale);
            this.scene.add(sprite);

            this.smokeParticles.push({
                sprite,
                vx: Math.cos(angle) * speed,
                vy: 0.25 + Math.random() * 0.85,
                vz: Math.sin(angle) * speed,
                age: 0,
                maxAge: 4.5 + Math.random() * 2.5,
                growRate: 1.2 + Math.random() * 1.5
            });
        }
    }

    _spawnChokeSmokeOnFleischi(pos) {
        const T = this.THREE || window.THREE;
        if (!T || !this.scene || !pos) return;
        const tex = this._getSmokeTexture();

        for (let i = 0; i < 10; i++) {
            const mat = new T.SpriteMaterial({
                map: tex,
                color: 0xa6ff2e,
                transparent: true,
                opacity: 0.85,
                depthWrite: false
            });
            const sprite = new T.Sprite(mat);
            sprite.position.set(
                pos.x + (Math.random() - 0.5) * 1.2,
                pos.y + 0.4 + Math.random() * 1.1,
                pos.z + (Math.random() - 0.5) * 1.2
            );
            sprite.scale.set(0.9, 0.9, 0.9);
            this.scene.add(sprite);

            this.smokeParticles.push({
                sprite,
                vx: (Math.random() - 0.5) * 0.8,
                vy: 0.4 + Math.random() * 0.6,
                vz: (Math.random() - 0.5) * 0.8,
                age: 0,
                maxAge: 6.5 + Math.random() * 2.0,
                growRate: 0.45
            });
        }
    }

    _onBeforeSceneRender(scene, camera) {
        if (!this.isMilan) return;

        // Enforce knockdown pose right before WebGLRenderer draws the frame
        for (const [mesh, state] of this.knockedMeshes.entries()) {
            if (!mesh || state.timer <= 0) continue;

            const elapsed = state.maxTime - state.timer;
            const fallDuration = 0.35;
            const recoverDuration = 1.1;

            // Lock horizontal position so fallen Fleischies cannot slide or chase
            mesh.position.x = state.lockedX;
            mesh.position.z = state.lockedZ;

            if (elapsed < fallDuration) {
                // Falling down due to the Furz smoke
                const t = elapsed / fallDuration;
                const ease = 1 - Math.pow(1 - t, 3);
                mesh.rotation.z = state.origRotZ + (Math.PI / 2) * state.fallDir * ease;
                mesh.rotation.x = state.origRotX - 0.35 * ease;
                mesh.position.y = state.origY - 0.55 * ease;
            } else if (state.timer > recoverDuration) {
                // Flat on the ground, coughing/twitching in the smoke
                const twitch = Math.sin(elapsed * 22) * 0.06;
                mesh.rotation.z = state.origRotZ + (Math.PI / 2) * state.fallDir + twitch;
                mesh.rotation.x = state.origRotX - 0.35 + twitch * 0.5;
                mesh.position.y = state.origY - 0.55;
            } else {
                // Slowly getting back up
                const t = state.timer / recoverDuration;
                mesh.rotation.z = state.origRotZ + (Math.PI / 2) * state.fallDir * t;
                mesh.rotation.x = state.origRotX - 0.35 * t;
                mesh.position.y = state.origY - 0.55 * t;
            }
        }
    }

    update(dt) {
        this._updateCooldownUI();

        // Update 3D smoke particles
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.age += dt;
            if (p.age >= p.maxAge) {
                if (p.sprite.parent) p.sprite.parent.remove(p.sprite);
                p.sprite.material.dispose();
                this.smokeParticles.splice(i, 1);
                continue;
            }
            const progress = p.age / p.maxAge;
            const damping = Math.max(0.12, 1 - progress * 0.85);
            p.sprite.position.x += p.vx * damping * dt;
            p.sprite.position.y += p.vy * dt;
            p.sprite.position.z += p.vz * damping * dt;

            const s = p.sprite.scale.x + p.growRate * dt;
            p.sprite.scale.set(s, s, s);
            p.sprite.material.opacity = Math.max(0, (1 - progress) * 0.78);
        }

        // Update 3D shockwave rings
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.age += dt;
            if (sw.age >= sw.maxAge) {
                if (sw.mesh.parent) sw.mesh.parent.remove(sw.mesh);
                sw.mesh.geometry.dispose();
                sw.mesh.material.dispose();
                this.shockwaves.splice(i, 1);
                continue;
            }
            const t = sw.age / sw.maxAge;
            const scale = 1 + t * 24;
            sw.mesh.scale.set(scale, scale, 1);
            sw.mesh.material.opacity = (1 - t) * 0.85;
        }

        // Update knockdown timers
        for (const [mesh, state] of this.knockedMeshes.entries()) {
            state.timer -= dt;
            if (state.timer <= 0) {
                if (mesh) {
                    mesh.rotation.x = state.origRotX;
                    mesh.rotation.z = state.origRotZ;
                    mesh.position.y = state.origY;
                }
                if (state.wrapper) {
                    state.wrapper._milanFurzKnockedDown = false;
                    state.wrapper._milanFurzTimer = 0;
                    state.wrapper.isStunned = false;
                }
                this.knockedMeshes.delete(mesh);
            }
        }

        // Update autonomous Milan Hunter Fleischies
        if (this.isMilan && this.camera) {
            const playerPos = this.camera.position;
            for (const clone of this.spawnedMilanClones) {
                if (!clone.mesh || clone.scene !== this.scene) continue;
                if (clone._milanFurzKnockedDown) continue;

                // Face player
                if (clone.headMesh) {
                    clone.headMesh.lookAt(playerPos.x, clone.mesh.position.y + 1.95, playerPos.z);
                }

                const dx = playerPos.x - clone.mesh.position.x;
                const dz = playerPos.z - clone.mesh.position.z;
                const dy = Math.abs(playerPos.y - (clone.mesh.position.y + 1.5));
                const dist = Math.hypot(dx, dz);

                // Pursue player relentlessly if on same floor or within 32m
                if (dist > 1.35 && dy < 4.2) {
                    const dirX = dx / dist;
                    const dirZ = dz / dist;
                    clone.mesh.position.x += dirX * clone.speed * dt;
                    clone.mesh.position.z += dirZ * clone.speed * dt;
                    clone.mesh.rotation.y = Math.atan2(dirX, dirZ);
                } else if (dist > 1.35) {
                    // Roam/patrol floor aggressively
                    clone.patrolTimer += dt;
                    if (clone.patrolTimer > 3.5) {
                        clone.patrolTimer = 0;
                        clone.patrolAngle += (Math.random() - 0.5) * 2.2;
                    }
                    clone.mesh.position.x += Math.cos(clone.patrolAngle) * (clone.speed * 0.75) * dt;
                    clone.mesh.position.z += Math.sin(clone.patrolAngle) * (clone.speed * 0.75) * dt;
                }

                // Bobbing sprint animation
                clone.mesh.position.y = clone.floorY + Math.abs(Math.sin(performance.now() * 0.012)) * 0.14;
            }
        }
    }

    _bindHotkeys() {
        window.addEventListener('keydown', (e) => {
            if (!this.isMilan) return;
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea') return;

            if (e.code === 'KeyG') {
                e.preventDefault();
                this.triggerFurz();
            }
        });
    }

    _createUI() {
        if (document.getElementById('milan-furz-hud')) return;

        // Gleiches Rot/Gelb-Design wie Hauptmenü-Buttons (.horror-menu-btn) & Level-Buttons
        const style = document.createElement('style');
        style.textContent = `
            #milan-furz-hud {
                position: fixed;
                bottom: 22px;
                right: 22px;
                z-index: 9500;
                display: none;
                user-select: none;
                font-family: 'Courier New', Courier, monospace;
            }
            #milan-furz-btn {
                position: relative;
                overflow: hidden;
                display: flex;
                align-items: center;
                gap: 14px;
                min-width: 200px;
                padding: 12px 20px 14px 16px;
                background: rgba(14, 5, 5, 0.88);
                color: #ffea00;
                border: 2px solid #992211;
                font-family: 'Courier New', Courier, monospace;
                font-weight: bold;
                text-align: left;
                text-transform: uppercase;
                letter-spacing: 2px;
                cursor: pointer;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.75);
                transition: 0.16s;
            }
            #milan-furz-btn:hover {
                background: rgba(130, 15, 10, 0.92);
                color: #ffffff;
                border-color: #ffaa00;
                transform: translateY(-3px);
                box-shadow: 0 0 22px rgba(255, 40, 10, 0.55);
            }
            #milan-furz-btn:active {
                transform: scale(0.96);
            }
            #milan-furz-btn.on-cooldown,
            #milan-furz-btn.on-cooldown:hover {
                background: rgba(14, 5, 5, 0.88);
                color: #886666;
                border-color: #3a1210;
                transform: none;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.75);
                cursor: not-allowed;
            }
            #milan-furz-btn.cooldown-shake {
                animation: milanFurzShake 0.32s ease;
                border-color: #ff3311 !important;
            }
            @keyframes milanFurzShake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                50% { transform: translateX(5px); }
                75% { transform: translateX(-3px); }
            }
            #milan-furz-keybind {
                background: #2b110e;
                color: #ffea00;
                border: 1px solid #ffaa00;
                padding: 4px 10px;
                font-size: 16px;
                font-weight: bold;
                letter-spacing: 0;
            }
            #milan-furz-btn.on-cooldown #milan-furz-keybind {
                color: #886666;
                border-color: #5a2a22;
            }
            #milan-furz-text {
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            #milan-furz-title {
                font-size: 18px;
            }
            #milan-furz-cooldown-label {
                font-size: 12px;
                letter-spacing: 1.5px;
                color: #ffaa00;
            }
            #milan-furz-btn.on-cooldown #milan-furz-cooldown-label {
                color: #ff6655;
            }
            #milan-furz-progress {
                position: absolute;
                left: 0;
                bottom: 0;
                height: 4px;
                width: 100%;
                background: #ffea00;
                transform-origin: left center;
            }
            #milan-furz-btn.on-cooldown #milan-furz-progress {
                background: #ff3311;
            }
            #milan-furz-screen-fx {
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 9400;
                opacity: 0;
                background: radial-gradient(circle at 50% 65%, rgba(145, 220, 30, 0.12) 0%, rgba(105, 165, 20, 0.38) 65%, rgba(45, 75, 10, 0.72) 100%);
                transition: opacity 0.35s ease;
            }
        `;
        document.head.appendChild(style);

        const hud = document.createElement('div');
        hud.id = 'milan-furz-hud';
        hud.innerHTML = `
            <div id="milan-furz-btn" title="Milan Furz-Attacke [G] - Lässt Fleischies im Rauch umfallen!">
                <span id="milan-furz-keybind">G</span>
                <div id="milan-furz-text">
                    <span id="milan-furz-title">Furz</span>
                    <span id="milan-furz-cooldown-label">BEREIT</span>
                </div>
                <div id="milan-furz-progress"></div>
            </div>
        `;
        document.body.appendChild(hud);

        const screenFx = document.createElement('div');
        screenFx.id = 'milan-furz-screen-fx';
        document.body.appendChild(screenFx);

        this.uiContainer = hud;
        this.uiBtn = hud.querySelector('#milan-furz-btn');
        this.uiProgressBar = hud.querySelector('#milan-furz-progress');
        this.uiCooldownText = hud.querySelector('#milan-furz-cooldown-label');
        this.uiScreenFx = screenFx;

        this.uiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.triggerFurz();
        });
    }

    // Läuft das eigentliche Spiel? (Hauptmenü ist weg => Spiel läuft)
    _isInGame() {
        const menu = document.getElementById('main-menu-overlay');
        if (!menu) return false;
        return window.getComputedStyle(menu).display === 'none';
    }

    _updateUIVisibility() {
        if (!this.uiContainer) return;
        const show = this.isMilan && this._isInGame();
        this.uiContainer.style.display = show ? 'block' : 'none';

        // Nicht mit der Sticker-Radarkarte (unten rechts) überlappen
        if (show) {
            const radar = document.getElementById('fns-radar-map-box');
            const radarVisible = radar && window.getComputedStyle(radar).display !== 'none';
            this.uiContainer.style.bottom = radarVisible ? (radar.offsetHeight + 34) + 'px' : '22px';
        }
    }

    _updateCooldownUI() {
        if (!this.uiContainer || !this.isMilan) return;
        const remaining = this.getCooldownRemainingMs();
        const total = this.cooldownDuration;

        if (remaining <= 0) {
            this.uiBtn.classList.remove('on-cooldown');
            this.uiCooldownText.textContent = 'BEREIT';
            if (this.uiProgressBar) this.uiProgressBar.style.transform = 'scaleX(1)';
        } else {
            this.uiBtn.classList.add('on-cooldown');
            const secs = Math.ceil(remaining / 1000);
            this.uiCooldownText.textContent = `${secs}s COOLDOWN`;
            if (this.uiProgressBar) {
                this.uiProgressBar.style.transform = `scaleX(${(1 - remaining / total).toFixed(3)})`;
            }
        }
    }

    _shakeButtonOnCooldown() {
        if (!this.uiBtn) return;
        this.uiBtn.classList.remove('cooldown-shake');
        void this.uiBtn.offsetWidth;
        this.uiBtn.classList.add('cooldown-shake');
    }

    _triggerScreenFurzFX() {
        if (this.uiScreenFx) {
            this.uiScreenFx.style.opacity = '1';
            setTimeout(() => {
                if (this.uiScreenFx) this.uiScreenFx.style.opacity = '0';
            }, 3400);
        }
    }

    _getAudioContext() {
        if (!this.audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) this.audioCtx = new Ctx();
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
        return this.audioCtx;
    }

    _playMegaFurzSound() {
        const ctx = this._getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const duration = 1.45;

        // 1. Sub-bass wet rumble sawtooth with flutter LFO
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const masterGain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(92, now);
        osc.frequency.exponentialRampToValueAtTime(36, now + 0.55);
        osc.frequency.exponentialRampToValueAtTime(58, now + 0.9);
        osc.frequency.exponentialRampToValueAtTime(28, now + duration);

        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(26, now);
        lfo.frequency.linearRampToValueAtTime(14, now + duration);
        lfoGain.gain.setValueAtTime(32, now);

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(340, now);
        filter.Q.setValueAtTime(6.5, now);

        masterGain.gain.setValueAtTime(0.01, now);
        masterGain.gain.linearRampToValueAtTime(0.85, now + 0.05);
        masterGain.gain.exponentialRampToValueAtTime(0.55, now + 0.8);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(filter);
        filter.connect(masterGain);
        masterGain.connect(ctx.destination);

        osc.start(now);
        lfo.start(now);
        osc.stop(now + duration);
        lfo.stop(now + duration);

        // 2. Filtered gas hiss / splatter burst
        const bufferSize = ctx.sampleRate * duration;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.sin((i / ctx.sampleRate) * 95);
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(190, now);
        bandpass.Q.setValueAtTime(2.5, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.65, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        whiteNoise.connect(bandpass);
        bandpass.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        whiteNoise.start(now);
        whiteNoise.stop(now + duration);
    }

    _playDrySputterSound() {
        const ctx = this._getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
    }
}

export const milanMode = new MilanModeManager();
export default milanMode;