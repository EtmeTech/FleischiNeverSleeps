import { milanMode } from './MilanModeManager.js';
import { ProceduralTextures } from './ProceduralTextures.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { FleischiMonster } from './FleischiMonster.js';
import { BackroomsLogic } from './BackroomsLogic.js';

export class FleischroomsManager {
    constructor(scene, camera, player, audio, physics, onWalkThroughExitPortal, onCaughtInFleischrooms) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('fleischrooms', this), 200); }
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.audio = audio;
        this.physics = physics;
        this.onWalkThroughExitPortal = onWalkThroughExitPortal;
        this.onCaughtInFleischrooms = onCaughtInFleischrooms;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.chunkSize = 16;
        this.activeChunks = new Map();
        this.doorMeshes = [];
        this.exitPortalPos = null;
        this.exitPortalMesh = null;

        this.monsterEntity = null;
        this.monsterGroup = null;
        this.isMonsterChasing = false;
        this.chaseTimer = 0;
        this.monsterSpeed = 4.6;

        this.logic = new BackroomsLogic(this, 10);

        this.initMaterials();
        this.initLevel();
    }

    createTwistedFaceMaterial(repeatX, repeatY) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#3a1a08';
        ctx.fillRect(0, 0, 1024, 1024);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);

        const img = new Image();
        img.src = 'assets/textures/fleischi_face.png';
        img.onload = () => {
            for (let y = 0; y <= 1024; y += 110) {
                for (let x = 0; x <= 1024; x += 110) {
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(Math.random() * Math.PI * 2);
                    ctx.drawImage(img, -85, -85, 170, 170);
                    ctx.restore();
                }
            }

            for (let i = 0; i < 220; i++) {
                const cx = Math.random() * 1024;
                const cy = Math.random() * 1024;
                const w = Math.random() * 80 + 85;
                const h = Math.random() * 80 + 85;
                const angle = Math.random() * Math.PI * 2;

                for (let ox of [-1024, 0, 1024]) {
                    for (let oy of [-1024, 0, 1024]) {
                        if (cx + ox > -180 && cx + ox < 1204 && cy + oy > -180 && cy + oy < 1204) {
                            ctx.save();
                            ctx.translate(cx + ox, cy + oy);
                            ctx.rotate(angle);
                            ctx.scale(Math.random() < 0.5 ? -1 : 1, 1);
                            ctx.drawImage(img, -w / 2, -h / 2, w, h);
                            ctx.restore();
                        }
                    }
                }
            }

            tex.needsUpdate = true;
        };

        return new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.72,
            metalness: 0.05
        });
    }

    initMaterials() {
        this.wallMat = this.createTwistedFaceMaterial(2, 1);
        this.floorCeilMat = this.createTwistedFaceMaterial(3, 3);
        this.frameMat = ProceduralTextures.createFurnitureWood('#210905', '#0d0301');
        this.doorWoodMat = ProceduralTextures.createDetailedDoorMaterial('#6b180f', '#380904', '#94281b');
        this.handleMat = new THREE.MeshStandardMaterial({
            color: 0xffdd44,
            emissive: 0x553300,
            metalness: 0.92,
            roughness: 0.18
        });
    }

    initLevel() {
        this.physics.setMode('fleischrooms', null);

        this.physics.addObstacle(-1.3, -1.1, -53.1, -50.0);
        this.physics.addObstacle(1.1, 1.3, -53.1, -50.0);
        this.physics.addObstacle(-1.3, 1.3, -53.2, -52.9);

        const ambLight = new THREE.AmbientLight(0xffe699, 0.95);
        this.group.add(ambLight);

        this.playerLight = new THREE.PointLight(0xffdd88, 2.2, 22);
        this.playerLight.position.set(this.player.position.x, 3.2, this.player.position.z);
        this.group.add(this.playerLight);

        const counterHud = document.getElementById('door-counter-hud');
        if (counterHud) counterHud.style.display = 'none';

        this.initChaserMonster();
        this.updateInfiniteChunks();
    }

    hashCoords(cx, cz) {
        const h = Math.sin(cx * 127.1 + cz * 311.7) * 43758.5453123;
        return h - Math.floor(h);
    }

    createDoorOnWall(parentGroup, localX, localZ, rotY, worldX, worldZ, wallMesh, wallObstacle) {
        const doorContainer = new THREE.Group();
        doorContainer.position.set(localX, 0, localZ);
        doorContainer.rotation.y = rotY;

        const alcove = new THREE.Mesh(
            new THREE.PlaneGeometry(1.3, 2.4),
            new THREE.MeshBasicMaterial({ color: 0x050000 })
        );
        alcove.position.set(0, 1.2, -0.04);
        doorContainer.add(alcove);

        const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.55, 0.22), this.frameMat);
        frameL.position.set(-0.68, 1.27, 0);
        const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.55, 0.22), this.frameMat);
        frameR.position.set(0.68, 1.27, 0);
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.16, 0.22), this.frameMat);
        frameTop.position.set(0, 2.50, 0);
        doorContainer.add(frameL, frameR, frameTop);

        const hingeGroup = new THREE.Group();
        hingeGroup.position.set(-0.6, 0, 0.05);
        hingeGroup.userData = {
            opened: false,
            baseRotY: 0,
            rotY: rotY,
            worldPos: new THREE.Vector3(worldX, 1.2, worldZ),
            container: doorContainer,
            alcove: alcove,
            wallMesh: wallMesh,
            wallObstacle: wallObstacle
        };

        const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.09), this.doorWoodMat);
        doorPanel.position.set(0.6, 1.2, 0);
        hingeGroup.add(doorPanel);

        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 14), this.handleMat);
        handle.position.set(1.02, 1.15, 0.08);
        hingeGroup.add(handle);

        const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.025), this.handleMat);
        lockPlate.position.set(1.02, 1.10, 0.052);
        hingeGroup.add(lockPlate);

        for (const hy of [0.45, 1.20, 1.95]) {
            const hingePin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), this.handleMat);
            hingePin.position.set(0.02, hy, 0.055);
            hingeGroup.add(hingePin);
        }

        doorPanel.userData.hingeGroup = hingeGroup;
        handle.userData.hingeGroup = hingeGroup;

        doorContainer.add(hingeGroup);
        parentGroup.add(doorContainer);

        this.doorMeshes.push(doorPanel, handle);
        return [doorPanel, handle];
    }

    generateChunk(cx, cz) {
        const key = `${cx},${cz}`;
        if (this.activeChunks.has(key)) return;

        const chunkGroup = new THREE.Group();
        const worldX = cx * this.chunkSize;
        const worldZ = cz * this.chunkSize;
        chunkGroup.position.set(worldX, 0, worldZ);

        const obstacles = [];
        const chunkDoorMeshes = [];

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.chunkSize, this.chunkSize), this.floorCeilMat);
        floor.rotation.x = -Math.PI / 2;
        chunkGroup.add(floor);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(this.chunkSize, this.chunkSize), this.floorCeilMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 4.2;
        chunkGroup.add(ceiling);

        const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 0.08, 0.6),
            new THREE.MeshBasicMaterial({ color: 0xfff6cc })
        );
        lamp.position.set(0, 4.15, 0);
        chunkGroup.add(lamp);

        const r = this.hashCoords(cx, cz);
        const isElevatorChunk = (cx === 0 && cz === -3);

        if (!isElevatorChunk) {
            const wall1 = new THREE.Mesh(new THREE.BoxGeometry(7.5, 4.2, 0.5), this.wallMat);
            wall1.position.set(-2.5, 2.1, -5.0);
            chunkGroup.add(wall1);
            const obs1 = this.physics.addObstacle(worldX - 6.25, worldX + 1.25, worldZ - 5.25, worldZ - 4.75);
            obstacles.push(obs1);

            chunkDoorMeshes.push(...this.createDoorOnWall(chunkGroup, -2.5, -4.72, 0, worldX - 2.5, worldZ - 4.72, wall1, obs1));
            chunkDoorMeshes.push(...this.createDoorOnWall(chunkGroup, 0.0, -5.28, Math.PI, worldX, worldZ - 5.28, wall1, obs1));
        }

        const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 7.5), this.wallMat);
        const zOff = r > 0.5 ? 2.0 : -1.5;
        wall2.position.set(5.0, 2.1, zOff);
        chunkGroup.add(wall2);
        const obs2 = this.physics.addObstacle(worldX + 4.75, worldX + 5.25, worldZ + zOff - 3.75, worldZ + zOff + 3.75);
        obstacles.push(obs2);

        chunkDoorMeshes.push(...this.createDoorOnWall(chunkGroup, 4.72, zOff, -Math.PI / 2, worldX + 4.72, worldZ + zOff, wall2, obs2));

        if (!isElevatorChunk) {
            const wall3 = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.2, 0.5), this.wallMat);
            wall3.position.set(-3.5, 2.1, 4.5);
            chunkGroup.add(wall3);
            const obs3 = this.physics.addObstacle(worldX - 6.25, worldX - 0.75, worldZ + 4.25, worldZ + 4.75);
            obstacles.push(obs3);
            chunkDoorMeshes.push(...this.createDoorOnWall(chunkGroup, -3.5, 4.22, Math.PI, worldX - 3.5, worldZ + 4.22, wall3, obs3));
        }

        this.group.add(chunkGroup);
        this.activeChunks.set(key, { group: chunkGroup, obstacles, chunkDoorMeshes });
    }

    updateInfiniteChunks() {
        const pCx = Math.round(this.player.position.x / this.chunkSize);
        const pCz = Math.round(this.player.position.z / this.chunkSize);

        const needed = new Set();
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const cx = pCx + dx;
                const cz = pCz + dz;
                const key = `${cx},${cz}`;
                needed.add(key);
                this.generateChunk(cx, cz);
            }
        }

        for (const [key, data] of this.activeChunks.entries()) {
            if (!needed.has(key) && !this.exitPortalPos) {
                this.group.remove(data.group);
                for (const obs of data.obstacles) {
                    this.physics.removeObstacle(obs);
                }
                for (const dm of data.chunkDoorMeshes) {
                    const idx = this.doorMeshes.indexOf(dm);
                    if (idx !== -1) this.doorMeshes.splice(idx, 1);
                }
                this.activeChunks.delete(key);
            }
        }
    }

    initChaserMonster() {
        this.monsterEntity = new FleischiMonster();
        this.monsterGroup = this.monsterEntity.group;
        this.monsterGroup.visible = false;
        this.group.add(this.monsterGroup);
    }

    spawnMonsterBehindPlayer(distance = 8.5) {
        this.audio.playJumpscareSound();
        this.isMonsterChasing = true;
        this.chaseTimer = 11.0;

        const lookDir = new THREE.Vector3();
        this.camera.getWorldDirection(lookDir);
        lookDir.y = 0;
        lookDir.normalize();
        const spawnPos = this.player.position.clone().addScaledVector(lookDir, -distance);
        spawnPos.y = 0;
        this.monsterGroup.position.copy(spawnPos);
        this.monsterGroup.visible = true;
    }

    // Erzeugt das leuchtend grüne Portal HINTER der 10. Tür, in das man selbst reinlaufen muss!
    activateExitPortal(doorObj) {
        this.isMonsterChasing = false;
        if (this.monsterGroup) this.monsterGroup.visible = false;
        this.audio.playMidnightGong();

        // Wand-Collider an dieser Tür entfernen, damit man direkt in das grüne Portal reinlaufen kann!
        if (doorObj.userData.wallObstacle) {
            this.physics.removeObstacle(doorObj.userData.wallObstacle);
            doorObj.userData.wallObstacle = null;
        }

        // Schwarze Nische hinter der Tür durch das leuchtend grüne Portal ersetzen
        if (doorObj.userData.alcove) {
            doorObj.userData.alcove.visible = false;
        }

        const portalMat = new THREE.MeshBasicMaterial({
            color: 0x00ff66,
            side: THREE.DoubleSide
        });
        this.exitPortalMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 2.42), portalMat);
        this.exitPortalMesh.position.set(0, 1.2, -0.02);
        doorObj.userData.container.add(this.exitPortalMesh);

        const portalLight = new THREE.PointLight(0x00ff66, 6.0, 12.0);
        portalLight.position.set(0, 1.6, 0.5);
        doorObj.userData.container.add(portalLight);

        this.exitPortalPos = doorObj.userData.worldPos.clone();
    }

    resetOnCatch() {
        this.isMonsterChasing = false;
        if (this.monsterGroup) this.monsterGroup.visible = false;
        this.player.position.set(0, 1.6, -48.5);
        this.updateInfiniteChunks();
    }

    getHoveredDoor(raycaster) {
        const hits = raycaster.intersectObjects(this.doorMeshes, false);
        if (hits.length > 0) {
            const hinge = hits[0].object.userData.hingeGroup;
            if (hinge && !hinge.userData.opened && this.camera.position.distanceTo(hinge.userData.worldPos) < 3.6) {
                return hinge;
            }
        }
        return null;
    }

    tryInteractDoor(raycaster) {
        const doorHinge = this.getHoveredDoor(raycaster);
        if (doorHinge) {
            this.logic.onDoorInteract(doorHinge);
            return true;
        }
        return false;
    }

    update(delta) {
        this.playerLight.position.set(this.player.position.x, 3.2, this.player.position.z);
        this.updateInfiniteChunks();

        // Erst wenn man wirklich in das grüne Portal hinter der 10. Tür hineinläuft (< 1.15m),
        // betritt man den School Hallway!
        if (this.exitPortalPos) {
            const distToPortal = Math.hypot(
                this.player.position.x - this.exitPortalPos.x,
                this.player.position.z - this.exitPortalPos.z
            );
            if (distToPortal < 1.15) {
                this.exitPortalPos = null;
                if (this.onWalkThroughExitPortal) {
                    this.onWalkThroughExitPortal();
                }
                return;
            }
        }

        if (this.isMonsterChasing && this.monsterGroup && this.monsterGroup.visible) {
            this.chaseTimer -= delta;

            const pPos = this.player.position;
            const mPos = this.monsterGroup.position;
            if (window.__fnsMultiplayerActive && typeof window.__fnsIsMpAuthority === 'function' && !window.__fnsIsMpAuthority()) {
                const horizDistClient = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);
                if (horizDistClient <= 1.35) {
                    this.isMonsterChasing = false;
                    this.audio.playJumpscareSound();
                    if (this.onCaughtInFleischrooms) this.onCaughtInFleischrooms();
                }
                return;
            }
            const targetPos = (typeof window.__fnsGetClosestPlayerPos === 'function')
                ? window.__fnsGetClosestPlayerPos('fleischrooms', mPos, pPos)
                : pPos;
            this.monsterGroup.lookAt(targetPos.x, 0, targetPos.z);

            const horizDist = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);

            if (horizDist <= 1.35) {
                this.isMonsterChasing = false;
                this.audio.playJumpscareSound();
                if (this.onCaughtInFleischrooms) {
                    this.onCaughtInFleischrooms();
                }
                return;
            }

            const toMonster = new THREE.Vector3(mPos.x - pPos.x, 0, mPos.z - pPos.z).normalize();
            const lookDir = new THREE.Vector3();
            this.camera.getWorldDirection(lookDir);
            lookDir.y = 0;
            lookDir.normalize();
            const isLookingAtMonster = lookDir.dot(toMonster) > 0.45 && horizDist > 2.0;

            if (!isLookingAtMonster) {
                this.monsterEntity.animate(delta, true);
                const dir = new THREE.Vector3(targetPos.x - mPos.x, 0, targetPos.z - mPos.z).normalize();
                mPos.addScaledVector(dir, this.monsterSpeed * delta);
            } else {
                this.monsterEntity.animate(delta, false);
            }

            if (horizDist > 19.0 || this.chaseTimer <= 0) {
                this.isMonsterChasing = false;
                this.monsterGroup.visible = false;
            }
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof FleischroomsManager !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'fleischrooms', cls: FleischroomsManager });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('fleischrooms', FleischroomsManager);
  }
}


// [MILAN_MODE_HOOK]

(() => {
    const cls = (typeof FleischroomsManager !== 'undefined') ? FleischroomsManager : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('Fleischrooms', this);
            if (milanMode.isMilan && (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick'))) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.45;
                }
            }
            return orig.apply(this, args);
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
