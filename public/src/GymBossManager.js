import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { FleischiMonster } from './FleischiMonster.js';

export class GymBossManager {
    constructor(scene, camera, player, audio, physics, onVictoryCallback, onCaughtCallback) {
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.audio = audio;
        this.physics = physics;
        this.onVictoryCallback = onVictoryCallback;
        this.onCaughtCallback = onCaughtCallback;

        this.hiddenSceneObjects = [];
        this.scene.children.forEach((child) => {
            if (child !== this.camera && child.visible) {
                this.hiddenSceneObjects.push(child);
                child.visible = false;
            }
        });

        if (this.camera.parent !== this.scene) {
            this.scene.add(this.camera);
        }
        this.hiddenCameraChildren = [];
        this.camera.children.forEach((c) => {
            if (c.visible) {
                this.hiddenCameraChildren.push(c);
                c.visible = false;
            }
        });

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(0, 0, 0);
        this.camera.quaternion.setFromEuler(this.camera.rotation);

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.isEnteringWalk = true;
        this.enterWalkProgress = 0;
        this.entranceDoorClosing = false;
        this.entranceDoorAngle = Math.PI * 0.58;
        this.hasWalkedInside = false;

        this.time = 0;
        this.flickeringLights = [];
        this.obstaclesBoxes = [];

        const diffCfg = (typeof window !== 'undefined' && window.DifficultyManager)
            ? window.DifficultyManager.getConfig()
            : { id: 'praeti', speedMult: 1.0 };

        this.diffId = diffCfg.id || 'praeti';
        this.maxBossHp = this.diffId === 'mats' ? 650 : (this.diffId === 'milan' ? 1250 : 950);
        this.bossHp = this.maxBossHp;
        this.bossDead = false;
        this.bossDeathTimer = 0;

        this.maxPlayerShield = 100;
        this.playerShield = 100;
        // Deutlich reduzierter Schallwellen-Schaden + kurzer Schutz nach Treffer
        this.sonicWaveDamage = this.diffId === 'mats' ? 10 : (this.diffId === 'milan' ? 18 : 14);
        this.playerHitCooldown = 0;
        this.spawnGraceTimer = 3.5;

        // Warden-Fleischi Verhalten
        this.wardenSpeed = 3.45;
        this.stepSoundTimer = 0;
        this.sonicCooldown = this.diffId === 'mats' ? 6.4 : (this.diffId === 'milan' ? 3.8 : 5.0);
        this.sonicTimer = 3.4;
        this.isChargingSonic = false;
        this.sonicChargeTime = 0;
        this.sonicChargeDuration = 1.40;
        this.activeSonicWaves = [];

        // Zahlen-Pistole
        this.projectiles = [];
        this.floatingDamageTexts = [];
        this.shootCooldown = 0;
        this.gunRecoil = 0;
        this.currentGunNumber = this.pickNextGunNumber();

        this.exitPortalPos = null;

        this.initMaterials();
        this.buildHorrorGymHall();
        this.buildGymEquipmentFull();
        this.buildWardenFleischiBoss();
        this.buildNumberPistolOnCamera();
        this.createBossHealthBarHUD();
        this.setupGunInputListeners();
    }

    pickNextGunNumber() {
        const pool = ['7', '13', '42', '64', '128', '256', '512', '9', '3.14', '0', '1', '88'];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // HOCHAUFLÖSENDE PROZEDURALE HORROR-TEXTUREN FÜR ALLE TURNGERÄTE
    createVaultWoodMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#5c3818';
        ctx.fillRect(0, 0, 512, 512);

        // Holzmaserung & Fasern
        for (let i = 0; i < 420; i++) {
            const y = Math.random() * 512;
            const h = 2 + Math.random() * 6;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(35, 16, 5, 0.32)' : 'rgba(130, 85, 40, 0.22)';
            ctx.fillRect(0, y, 512, h);
        }

        // Typische Sprungkasten-Holzzinken an den Rändern + Griffloch-Schatten
        ctx.fillStyle = '#2d1708';
        for (let y = 0; y < 512; y += 32) {
            ctx.fillRect(0, y, 22, 16);
            ctx.fillRect(490, y + 16, 22, 16);
        }

        // Horizontale Kastenspalt-Fugen & dunkle Schmutz-/Blutspuren
        ctx.strokeStyle = '#1a0c03';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, 506, 506);

        for (let i = 0; i < 25; i++) {
            const gx = Math.random() * 512;
            const gy = Math.random() * 512;
            const gr = 18 + Math.random() * 55;
            const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
            g.addColorStop(0, i % 3 === 0 ? 'rgba(65, 8, 5, 0.55)' : 'rgba(10, 6, 3, 0.5)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(gx, gy, gr, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.025,
            roughness: 0.58,
            metalness: 0.08
        });
    }

    createVintageLeatherMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Dunkles, abgenutztes Turnleder (Cognac/Dunkelbraun)
        const bgGrad = ctx.createRadialGradient(256, 256, 40, 256, 256, 340);
        bgGrad.addColorStop(0, '#4d2412');
        bgGrad.addColorStop(1, '#261006');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 512, 512);

        // feine Lederporen & Falten
        for (let i = 0; i < 650; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(15, 5, 2, 0.38)' : 'rgba(110, 55, 30, 0.18)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 26, y + (Math.random() - 0.5) * 26);
            ctx.stroke();
        }

        // Dicke Sattlernaht ringsum
        ctx.strokeStyle = '#8c6239';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(22, 22, 468, 468);
        ctx.setLineDash([]);

        // Magnesia-/Kreidespuren & dunkle Blutflecken
        for (let i = 0; i < 18; i++) {
            const cx = 60 + Math.random() * 390;
            const cy = 60 + Math.random() * 390;
            const r = 15 + Math.random() * 45;
            const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
            g.addColorStop(0, i % 2 === 0 ? 'rgba(55, 4, 4, 0.65)' : 'rgba(180, 175, 165, 0.16)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.03,
            roughness: 0.46,
            metalness: 0.12
        });
    }

    createGymMatMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Klassisches Turnmatten-Blau mit gewebter Planen-Struktur
        ctx.fillStyle = '#0f2f4a';
        ctx.fillRect(0, 0, 512, 512);

        // Gewebe-Raster
        ctx.strokeStyle = 'rgba(6, 18, 30, 0.45)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 512; i += 6) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, 512);
            ctx.moveTo(0, i); ctx.lineTo(512, i);
            ctx.stroke();
        }

        // Schwarze verstärkte Kunstleder-Ecken der Weichbodenmatte
        ctx.fillStyle = '#101317';
        const cSize = 74;
        ctx.fillRect(0, 0, cSize, cSize);
        ctx.fillRect(512 - cSize, 0, cSize, cSize);
        ctx.fillRect(0, 512 - cSize, cSize, cSize);
        ctx.fillRect(512 - cSize, 512 - cSize, cSize, cSize);

        // Umlaufende Gurtband-Naht
        ctx.strokeStyle = '#081726';
        ctx.lineWidth = 10;
        ctx.strokeRect(14, 14, 484, 484);

        // Abnutzung, Schuhabdrücke & Blutspritzer
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const r = 15 + Math.random() * 60;
            const g = ctx.createRadialGradient(x, y, 3, x, y, r);
            g.addColorStop(0, i % 3 === 0 ? 'rgba(60, 6, 6, 0.55)' : 'rgba(5, 10, 14, 0.55)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.028,
            roughness: 0.68,
            metalness: 0.06
        });
    }

    createBrushedSteelMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2b3036';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 180; i++) {
            ctx.fillStyle = i % 3 === 0 ? 'rgba(70, 22, 10, 0.3)' : 'rgba(15, 18, 22, 0.35)';
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 28, 4);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.015,
            roughness: 0.36,
            metalness: 0.82
        });
    }

    createBackboardMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 384;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#d4d0c8';
        ctx.fillRect(0, 0, 512, 384);

        // Roter Basketball-Rahmen + Zielquadrat
        ctx.strokeStyle = '#b81d13';
        ctx.lineWidth = 14;
        ctx.strokeRect(18, 18, 476, 348);
        ctx.lineWidth = 12;
        ctx.strokeRect(176, 170, 160, 128);

        // Schmutz & Risse auf dem Backboard
        for (let i = 0; i < 35; i++) {
            ctx.fillStyle = 'rgba(20, 15, 12, 0.22)';
            ctx.beginPath();
            ctx.arc(Math.random() * 512, Math.random() * 384, 10 + Math.random() * 40, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.4,
            metalness: 0.1
        });
    }

    initMaterials() {
        const floorCanvas = document.createElement('canvas');
        floorCanvas.width = 2048;
        floorCanvas.height = 2048;
        const fctx = floorCanvas.getContext('2d');

        fctx.fillStyle = '#2a1b10';
        fctx.fillRect(0, 0, 2048, 2048);

        for (let y = 0; y < 2048; y += 32) {
            for (let x = 0; x < 2048; x += 128) {
                const off = (y / 32) % 2 === 0 ? 0 : 64;
                const shade = 28 + Math.floor(Math.random() * 18);
                fctx.fillStyle = `rgb(${shade + 14}, ${shade + 4}, ${Math.max(8, shade - 8)})`;
                fctx.fillRect((x + off) % 2048, y + 1, 126, 30);
            }
        }

        for (let i = 0; i < 85; i++) {
            const gx = Math.random() * 2048;
            const gy = Math.random() * 2048;
            const gr = 30 + Math.random() * 120;
            const grad = fctx.createRadialGradient(gx, gy, 5, gx, gy, gr);
            grad.addColorStop(0, i % 3 === 0 ? 'rgba(65, 5, 5, 0.65)' : 'rgba(8, 8, 8, 0.6)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            fctx.fillStyle = grad;
            fctx.beginPath();
            fctx.arc(gx, gy, gr, 0, Math.PI * 2);
            fctx.fill();
        }

        fctx.strokeStyle = 'rgba(220, 215, 195, 0.55)';
        fctx.lineWidth = 18;
        fctx.strokeRect(140, 140, 1768, 1768);

        fctx.beginPath();
        fctx.moveTo(140, 1024);
        fctx.lineTo(1908, 1024);
        fctx.stroke();

        fctx.beginPath();
        fctx.arc(1024, 1024, 240, 0, Math.PI * 2);
        fctx.stroke();

        fctx.strokeStyle = 'rgba(215, 155, 30, 0.5)';
        fctx.lineWidth = 14;
        fctx.strokeRect(624, 140, 800, 380);
        fctx.strokeRect(624, 1528, 800, 380);

        const floorTex = new THREE.CanvasTexture(floorCanvas);
        floorTex.colorSpace = THREE.SRGBColorSpace;
        this.gymFloorMat = new THREE.MeshStandardMaterial({
            map: floorTex,
            bumpMap: floorTex,
            bumpScale: 0.02,
            roughness: 0.42,
            metalness: 0.15
        });

        const wallCanvas = document.createElement('canvas');
        wallCanvas.width = 1024;
        wallCanvas.height = 1024;
        const wctx = wallCanvas.getContext('2d');

        wctx.fillStyle = '#181a1d';
        wctx.fillRect(0, 0, 1024, 620);

        wctx.fillStyle = '#102436';
        wctx.fillRect(0, 620, 1024, 404);
        wctx.strokeStyle = '#07111a';
        wctx.lineWidth = 8;
        for (let x = 0; x < 1024; x += 128) {
            wctx.strokeRect(x + 4, 624, 120, 396);
        }

        for (let i = 0; i < 60; i++) {
            const rx = Math.random() * 1024;
            const ry = Math.random() * 850;
            const rh = 100 + Math.random() * 260;
            const g = wctx.createLinearGradient(0, ry, 0, ry + rh);
            g.addColorStop(0, i % 3 === 0 ? 'rgba(60, 8, 5, 0.55)' : 'rgba(5, 5, 5, 0.65)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            wctx.fillStyle = g;
            wctx.fillRect(rx, ry, 14 + Math.random() * 20, rh);
        }

        const wallTex = new THREE.CanvasTexture(wallCanvas);
        wallTex.colorSpace = THREE.SRGBColorSpace;
        wallTex.wrapS = THREE.RepeatWrapping;
        wallTex.wrapT = THREE.RepeatWrapping;
        wallTex.repeat.set(6, 1);

        this.gymWallMat = new THREE.MeshStandardMaterial({
            map: wallTex,
            bumpMap: wallTex,
            bumpScale: 0.03,
            roughness: 0.8,
            metalness: 0.1
        });

        this.boxWoodMat = this.createVaultWoodMaterial();
        this.leatherMat = this.createVintageLeatherMaterial();
        this.blueMatMaterial = this.createGymMatMaterial();
        this.steelMat = this.createBrushedSteelMaterial();
        this.backboardMat = this.createBackboardMaterial();
    }

    addColliderBox(x, y, z, w, h, d, meshMat = null, climbable = false) {
        let mesh = null;
        if (meshMat) {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), meshMat);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
        }
        const minX = x - w / 2;
        const maxX = x + w / 2;
        const minZ = z - d / 2;
        const maxZ = z + d / 2;

        if (climbable) {
            this.physics.addRamp(minX - 0.1, maxX + 0.1, minZ - 0.1, maxZ + 0.1, y + h / 2, y + h / 2, 'z');
        } else {
            this.physics.addObstacle(minX, maxX, minZ, maxZ, y - h / 2, y + h / 2);
            this.obstaclesBoxes.push({ minX, maxX, minZ, maxZ });
        }
        return mesh;
    }

    buildHorrorGymHall() {
        this.physics.setMode('school', null);
        this.scene.fog = new THREE.FogExp2(0x060203, 0.032);

        this.player.isHiddenInLocker = false;
        this.player.groundY = 0;
        this.player.footY = 0;
        this.player.waterPenalty = 1.0;
        this.player.position.set(0, 1.6, 2.2);
        this.camera.position.set(0, 1.6, 2.2);

        const amb = new THREE.AmbientLight(0x221c28, 0.65);
        this.group.add(amb);

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 54), this.gymFloorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0.01, -22);
        floor.receiveShadow = true;
        this.group.add(floor);
        this.physics.addRamp(-18, 18, -49, 5, 0, 0, 'z');

        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(36, 54),
            new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.9 })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 9.0, -22);
        this.group.add(ceiling);

        this.addColliderBox(-18.2, 4.5, -22, 0.6, 9.0, 54, this.gymWallMat, false);
        this.addColliderBox(18.2, 4.5, -22, 0.6, 9.0, 54, this.gymWallMat, false);
        this.addColliderBox(0, 4.5, -48.8, 36.8, 9.0, 0.6, this.gymWallMat, false);

        this.addColliderBox(-9.5, 4.5, 4.2, 17.4, 9.0, 0.6, this.gymWallMat, false);
        this.addColliderBox(9.5, 4.5, 4.2, 17.4, 9.0, 0.6, this.gymWallMat, false);
        const topWall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 6.4, 0.6), this.gymWallMat);
        topWall.position.set(0, 5.8, 4.2);
        this.group.add(topWall);

        this.entranceDoorHinge = new THREE.Group();
        this.entranceDoorHinge.position.set(-0.7, 0, 4.15);
        this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;
        const doorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 2.6, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x4a1810, roughness: 0.5 })
        );
        doorMesh.position.set(0.7, 1.3, 0);
        this.entranceDoorHinge.add(doorMesh);
        this.group.add(this.entranceDoorHinge);

        this.exitDoorGroup = new THREE.Group();
        this.exitDoorGroup.position.set(0, 0, -48.4);
        this.exitDoorHinge = new THREE.Group();
        this.exitDoorHinge.position.set(-1.1, 0, 0.08);
        const exitPanel = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 3.0, 0.14),
            new THREE.MeshStandardMaterial({ color: 0x3a120d, metalness: 0.5, roughness: 0.45 })
        );
        exitPanel.position.set(1.1, 1.5, 0);
        this.exitDoorHinge.add(exitPanel);
        this.exitDoorGroup.add(this.exitDoorHinge);
        this.group.add(this.exitDoorGroup);

        for (let z = -2; z >= -44; z -= 8.5) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(35.6, 0.45, 0.35), this.steelMat);
            beam.position.set(0, 8.65, z);
            this.group.add(beam);

            for (const lx of [-9.5, 0, 9.5]) {
                const isRed = ((Math.abs(Math.round(z)) + Math.abs(Math.round(lx))) % 3 === 0);
                const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.6), this.steelMat);
                lampHousing.position.set(lx, 8.38, z);
                const bulbMat = new THREE.MeshBasicMaterial({ color: isRed ? 0xff2211 : 0x99ccff });
                const bulb = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.45), bulbMat);
                bulb.rotation.x = Math.PI / 2;
                bulb.position.y = -0.09;
                lampHousing.add(bulb);
                this.group.add(lampHousing);

                const pLight = new THREE.PointLight(isRed ? 0xff2211 : 0x88bbee, isRed ? 1.9 : 1.7, 24);
                pLight.position.set(lx, 8.0, z);
                this.group.add(pLight);

                this.flickeringLights.push({
                    light: pLight,
                    bulbMat,
                    isRed,
                    baseInt: isRed ? 1.9 : 1.7,
                    seed: Math.random() * 100
                });
            }
        }
    }

    buildGymEquipmentFull() {
        this.buildBasketballHoop(0, 5.2, -48.1, 0);
        this.buildBasketballHoop(-17.5, 5.2, -16.0, Math.PI / 2);
        this.buildBasketballHoop(17.5, 5.2, -16.0, -Math.PI / 2);
        this.buildBasketballHoop(-17.5, 5.2, -32.0, Math.PI / 2);
        this.buildBasketballHoop(17.5, 5.2, -32.0, -Math.PI / 2);

        for (let z = -6; z >= -42; z -= 9) {
            this.buildWallBars(-17.65, z, Math.PI / 2);
            this.buildWallBars(17.65, z, -Math.PI / 2);
        }

        const vaultPositions = [
            [-6.5, -10.5, 0.2],
            [6.5, -11.0, -0.15],
            [-8.5, -22.0, 0.4],
            [8.5, -22.5, -0.35],
            [0.0, -17.5, 0.0],
            [-6.8, -34.0, -0.25],
            [6.8, -34.5, 0.3],
            [0.0, -29.5, Math.PI / 2]
        ];
        for (const [vx, vz, rot] of vaultPositions) {
            this.buildVaultingBox(vx, vz, rot);
        }

        // Detaillierte Weichbodenmatten mit Trageschlaufen
        const flatMats = [
            [-4.2, -7.0, 3.2, 2.2],
            [4.8, -15.5, 3.0, 2.0],
            [-4.5, -27.0, 3.4, 2.2],
            [4.5, -38.0, 3.2, 2.2],
            [0.0, -42.5, 4.0, 2.4]
        ];
        for (const [mx, mz, mw, md] of flatMats) {
            this.buildDetailedGymMat(mx, mz, mw, md);
        }

        this.buildPommelHorse(-11.5, -15.0, 0.3);
        this.buildPommelHorse(11.5, -18.0, -0.4);
        this.buildPommelHorse(-11.0, -29.0, -0.2);
        this.buildPommelHorse(11.5, -31.0, 0.25);

        this.buildParallelBars(-12.5, -39.5);
        this.buildParallelBars(12.5, -8.5);

        this.buildGymBench(-14.5, -12.0, 4.5);
        this.buildGymBench(14.5, -25.0, 4.5);
        this.buildGymBench(-14.5, -36.0, 4.5);

        const ballPositions = [
            [-2.5, -6.5], [3.2, -9.0], [-5.0, -19.5], [5.8, -24.0], [-3.0, -33.0], [2.8, -39.5]
        ];
        for (const [bx, bz] of ballPositions) {
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), this.leatherMat);
            ball.position.set(bx, 0.28, bz);
            ball.castShadow = true;
            this.group.add(ball);
        }
    }

    buildDetailedGymMat(mx, mz, mw, md) {
        const mGroup = new THREE.Group();
        mGroup.position.set(mx, 0, mz);

        const matMesh = new THREE.Mesh(new THREE.BoxGeometry(mw, 0.32, md), this.blueMatMaterial);
        matMesh.position.y = 0.16;
        matMesh.castShadow = true;
        matMesh.receiveShadow = true;
        mGroup.add(matMesh);

        // Seitliche schwarze Trageschlaufen
        const strapMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.8 });
        for (const sx of [-mw * 0.28, mw * 0.28]) {
            for (const sz of [-md / 2 - 0.02, md / 2 + 0.02]) {
                const strap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.04), strapMat);
                strap.position.set(sx, 0.16, sz);
                mGroup.add(strap);
            }
        }

        this.group.add(mGroup);
        this.physics.addRamp(mx - mw / 2, mx + mw / 2, mz - md / 2, mz + md / 2, 0.32, 0.32, 'z');
    }

    buildBasketballHoop(x, y, z, rotY) {
        const hGroup = new THREE.Group();
        hGroup.position.set(x, y, z);
        hGroup.rotation.y = rotY;

        for (const sy of [-0.25, 0.25]) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 1.15), this.steelMat);
            arm.position.set(0, sy, 0.55);
            hGroup.add(arm);
        }

        const board = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.25, 0.08), this.backboardMat);
        board.position.set(0, 0.1, 1.12);
        hGroup.add(board);

        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.28, 0.026, 12, 24),
            new THREE.MeshStandardMaterial({ color: 0xcc2808, roughness: 0.35, metalness: 0.75 })
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.set(0, -0.28, 1.44);
        hGroup.add(rim);

        const net = new THREE.Mesh(
            new THREE.CylinderGeometry(0.27, 0.18, 0.48, 14, 4, true),
            new THREE.MeshBasicMaterial({ color: 0xbbbbbb, wireframe: true })
        );
        net.position.set(0, -0.52, 1.44);
        hGroup.add(net);

        this.group.add(hGroup);
    }

    buildWallBars(x, z, rotY) {
        const wGroup = new THREE.Group();
        wGroup.position.set(x, 0, z);
        wGroup.rotation.y = rotY;

        for (const sx of [-1.1, 0, 1.1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.45, 0.16), this.boxWoodMat);
            post.position.set(sx, 1.72, 0);
            wGroup.add(post);
        }
        for (let ry = 0.35; ry <= 3.25; ry += 0.26) {
            const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.22, 10), this.boxWoodMat);
            rung.rotation.z = Math.PI / 2;
            rung.position.set(0, ry, 0.02);
            wGroup.add(rung);
        }
        this.group.add(wGroup);
    }

    buildVaultingBox(x, z, rotY) {
        const vGroup = new THREE.Group();
        vGroup.position.set(x, 0, z);
        vGroup.rotation.y = rotY;

        // Gummifüße unten
        for (const fx of [-0.72, 0.72]) {
            for (const fz of [-0.42, 0.42]) {
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), this.steelMat);
                foot.position.set(fx, 0.03, fz);
                vGroup.add(foot);
            }
        }

        // 4 gestapelte gezinkte Holzkastenelemente mit Grifflöchern an den Seiten
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x090402 });
        for (let i = 0; i < 4; i++) {
            const w = 1.66 - i * 0.045;
            const d = 0.96 - i * 0.028;
            const y = 0.16 + i * 0.24;
            const boxPart = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), this.boxWoodMat);
            boxPart.position.y = y;
            boxPart.castShadow = true;
            boxPart.receiveShadow = true;
            vGroup.add(boxPart);

            // Dunkle Fuge zwischen den Kastenteilen
            const seam = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.02, d - 0.02), holeMat);
            seam.position.y = y + 0.12;
            vGroup.add(seam);

            // Seitliche Grifflöcher im obersten und mittleren Kasten
            if (i === 2 || i === 3) {
                for (const side of [-1, 1]) {
                    const cutout = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.08), holeMat);
                    cutout.rotation.y = side * (Math.PI / 2);
                    cutout.position.set(side * (w / 2 + 0.002), y, 0);
                    vGroup.add(cutout);
                }
            }
        }

        // Abgerundetes Echtleder-Polster oben auf dem Sprungkasten
        const topPad = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.18, 0.88), this.leatherMat);
        topPad.position.y = 1.10;
        topPad.castShadow = true;
        topPad.receiveShadow = true;
        vGroup.add(topPad);

        const topCushion = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.44, 1.52, 16), this.leatherMat);
        topCushion.rotation.z = Math.PI / 2;
        topCushion.scale.set(0.22, 1.0, 1.0);
        topCushion.position.y = 1.16;
        vGroup.add(topCushion);

        this.group.add(vGroup);

        const halfW = rotY === Math.PI / 2 ? 0.55 : 0.88;
        const halfD = rotY === Math.PI / 2 ? 0.88 : 0.55;
        this.physics.addRamp(x - halfW, x + halfW, z - halfD, z + halfD, 1.22, 1.22, 'z');
        this.obstaclesBoxes.push({ minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD });
    }

    buildPommelHorse(x, z, rotY) {
        const pGroup = new THREE.Group();
        pGroup.position.set(x, 0, z);
        pGroup.rotation.y = rotY;

        // Abgerundeter Leder-Rumpf des Pauschenpferds
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.38, 0.46), this.leatherMat);
        body.position.y = 1.15;
        body.castShadow = true;
        pGroup.add(body);

        for (const endX of [-0.77, 0.77]) {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 14), this.leatherMat);
            cap.scale.set(0.6, 0.82, 1.0);
            cap.position.set(endX, 1.15, 0);
            pGroup.add(cap);
        }

        for (const px of [-0.28, 0.28]) {
            const pommel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.024, 10, 18, Math.PI), this.steelMat);
            pommel.position.set(px, 1.35, 0);
            pGroup.add(pommel);
        }

        // Spreizbeine mit Huf-Standfüßen und Spannkette
        for (const lx of [-0.62, 0.62]) {
            for (const lz of [-0.24, 0.24]) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.045, 1.14, 10), this.steelMat);
                leg.position.set(lx, 0.56, lz);
                leg.rotation.z = lx > 0 ? 0.12 : -0.12;
                leg.rotation.x = lz > 0 ? -0.10 : 0.10;
                pGroup.add(leg);

                const rubberFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 10), this.leatherMat);
                rubberFoot.position.set(lx * 1.12, 0.025, lz * 1.25);
                pGroup.add(rubberFoot);
            }
        }
        this.group.add(pGroup);
        this.physics.addObstacle(x - 0.85, x + 0.85, z - 0.4, z + 0.4, 0, 1.5);
    }

    buildParallelBars(x, z) {
        const bGroup = new THREE.Group();
        bGroup.position.set(x, 0, z);

        const base = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 2.85), this.steelMat);
        base.position.y = 0.06;
        bGroup.add(base);

        for (const sx of [-0.46, 0.46]) {
            for (const sz of [-1.05, 1.05]) {
                const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 1.65, 12), this.steelMat);
                upright.position.set(sx, 0.85, sz);
                bGroup.add(upright);
            }
            const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 2.9, 12), this.boxWoodMat);
            rail.rotation.x = Math.PI / 2;
            rail.position.set(sx, 1.68, 0);
            bGroup.add(rail);
        }
        this.group.add(bGroup);
        this.physics.addObstacle(x - 0.9, x + 0.9, z - 1.4, z + 1.4, 0, 1.8);
    }

    buildGymBench(x, z, len) {
        const bench = new THREE.Group();
        bench.position.set(x, 0, z);
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.065, len), this.boxWoodMat);
        top.position.y = 0.38;
        top.castShadow = true;
        bench.add(top);

        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len - 0.3), this.boxWoodMat);
        beam.position.y = 0.16;
        bench.add(beam);

        for (const sz of [-len / 2 + 0.4, 0, len / 2 - 0.4]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.12), this.boxWoodMat);
            leg.position.set(0, 0.18, sz);
            bench.add(leg);
        }
        this.group.add(bench);
        this.physics.addRamp(x - 0.3, x + 0.3, z - len / 2, z + len / 2, 0.41, 0.41, 'z');
    }

    buildWardenFleischiBoss() {
        this.bossEntity = new FleischiMonster();
        this.bossGroup = this.bossEntity.group;
        this.bossGroup.position.set(0, 0, -34.0);
        this.bossGroup.scale.set(1.25, 1.25, 1.25);

        // BLUTROTER SCHALLKERN IM BRUSTKORB
        this.wardenCoreMat = new THREE.MeshBasicMaterial({
            color: 0xff1100,
            transparent: true,
            opacity: 0.38
        });
        this.wardenCoreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), this.wardenCoreMat);
        this.wardenCoreMesh.position.set(0, 1.78, 0.14);
        this.bossGroup.add(this.wardenCoreMesh);

        this.wardenCoreLight = new THREE.PointLight(0xff1100, 2.0, 12.0);
        this.wardenCoreLight.position.set(0, 1.85, 0.35);
        this.bossGroup.add(this.wardenCoreLight);

        this.group.add(this.bossGroup);
    }

    buildNumberPistolOnCamera() {
        this.gunGroup = new THREE.Group();
        this.gunGroup.position.set(0.27, -0.21, -0.44);
        this.gunGroup.rotation.set(0.04, -0.12, 0);

        const gunMetal = new THREE.MeshStandardMaterial({
            color: 0x383e48,
            emissive: 0x0c0e12,
            metalness: 0.75,
            roughness: 0.28
        });
        const gunAccent = new THREE.MeshStandardMaterial({
            color: 0x991e14,
            emissive: 0x2a0502,
            metalness: 0.5,
            roughness: 0.35
        });

        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.095, 0.38), gunMetal);
        barrel.position.set(0, 0.04, -0.08);
        this.gunGroup.add(barrel);

        for (const sx of [-0.045, 0.045]) {
            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.01, 0.026, 0.32),
                new THREE.MeshBasicMaterial({ color: 0xffaa00 })
            );
            rail.position.set(sx, 0.045, -0.09);
            this.gunGroup.add(rail);
        }

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.17, 0.095), gunAccent);
        grip.position.set(0, -0.06, 0.05);
        grip.rotation.x = 0.28;
        this.gunGroup.add(grip);

        this.gunScreenCanvas = document.createElement('canvas');
        this.gunScreenCanvas.width = 128;
        this.gunScreenCanvas.height = 64;
        this.gunScreenTex = new THREE.CanvasTexture(this.gunScreenCanvas);
        const screenMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.084, 0.046),
            new THREE.MeshBasicMaterial({ map: this.gunScreenTex })
        );
        screenMesh.position.set(0, 0.10, 0.06);
        screenMesh.rotation.x = -0.32;
        this.gunGroup.add(screenMesh);
        this.updateGunScreenTexture();

        this.gunViewLight = new THREE.PointLight(0xffcfa3, 0.9, 1.8);
        this.gunViewLight.position.set(-0.1, 0.18, 0.2);
        this.gunGroup.add(this.gunViewLight);

        this.muzzleFlashLight = new THREE.PointLight(0xffaa00, 0.0, 6.0);
        this.muzzleFlashLight.position.set(0, 0.05, -0.32);
        this.gunGroup.add(this.muzzleFlashLight);

        this.camera.add(this.gunGroup);
    }

    updateGunScreenTexture() {
        if (!this.gunScreenCanvas) return;
        const ctx = this.gunScreenCanvas.getContext('2d');
        ctx.fillStyle = '#140505';
        ctx.fillRect(0, 0, 128, 64);
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 60);
        ctx.fillStyle = '#ffea00';
        ctx.font = 'bold 36px Courier New, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(this.currentGunNumber), 64, 34);
        this.gunScreenTex.needsUpdate = true;
    }

    createBossHealthBarHUD() {
        let hud = document.getElementById('fns-boss-hp-hud');
        if (hud) hud.remove();

        hud = document.createElement('div');
        hud.id = 'fns-boss-hp-hud';
        hud.style.cssText = `
            position: fixed;
            top: 18px;
            left: 22px;
            width: 320px;
            background: rgba(14, 5, 5, 0.88);
            border: 2px solid #992211;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8);
            padding: 10px 14px;
            font-family: 'Courier New', Courier, monospace;
            z-index: 280;
            pointer-events: none;
        `;

        hud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <span style="color:#ffea00; font-size:16px; font-weight:bold; letter-spacing:1px;">
                    Fleischi
                </span>
                <span id="fns-boss-hp-text" style="color:#ff6655; font-size:13px; font-weight:bold;">
                    ${this.bossHp} / ${this.maxBossHp}
                </span>
            </div>
            <div style="width:100%; height:14px; background:#1a0606; border:1px solid #661810; margin-bottom:9px;">
                <div id="fns-boss-hp-fill" style="height:100%; width:100%; background:#cc1810; transition:width 0.1s;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; color:#ffaa00; font-weight:bold; margin-bottom:4px;">
                <span>Dein Schild</span>
                <span id="fns-player-shield-text">100%</span>
            </div>
            <div style="width:100%; height:8px; background:#1a0e05; border:1px solid #664410;">
                <div id="fns-player-shield-fill" style="width:100%; height:100%; background:#ffaa00; transition:width 0.15s;"></div>
            </div>
        `;
        document.body.appendChild(hud);
        this.bossHudEl = hud;
    }

    updateBossHUD() {
        if (!this.bossHudEl) return;
        const pct = Math.max(0, Math.min(100, (this.bossHp / this.maxBossHp) * 100));
        const fill = document.getElementById('fns-boss-hp-fill');
        const txt = document.getElementById('fns-boss-hp-text');
        if (fill) fill.style.width = `${pct}%`;
        if (txt) txt.textContent = `${Math.max(0, Math.ceil(this.bossHp))} / ${this.maxBossHp}`;

        const sPct = Math.max(0, Math.min(100, (this.playerShield / this.maxPlayerShield) * 100));
        const sFill = document.getElementById('fns-player-shield-fill');
        const sTxt = document.getElementById('fns-player-shield-text');
        if (sFill) sFill.style.width = `${sPct}%`;
        if (sTxt) sTxt.textContent = `${Math.round(sPct)}%`;
    }

    setupGunInputListeners() {
        this._onMouseDown = (e) => {
            if (e.button === 0 && !this.isEnteringWalk && !this.bossDead) {
                const menuEl = document.getElementById('main-menu-overlay');
                if (menuEl && window.getComputedStyle(menuEl).display !== 'none') return;
                this.fireNumberProjectile();
            }
        };
        this._onKeyDown = (e) => {
            if (this.isEnteringWalk || this.bossDead) return;
            const isInteract = (this.player && this.player.matchesBind && this.player.matchesBind(e.code, 'interact')) || e.code === 'KeyE';
            if (isInteract) {
                const menuEl = document.getElementById('main-menu-overlay');
                if (menuEl && window.getComputedStyle(menuEl).display !== 'none') return;
                this.fireNumberProjectile();
            }
        };
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('keydown', this._onKeyDown);
    }

    createNumberSpriteMaterial(numStr, color = '#ffaa00') {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffea00';
        ctx.font = '900 64px Courier New, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numStr, 64, 64);

        const tex = new THREE.CanvasTexture(canvas);
        return new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
    }

    fireNumberProjectile() {
        if (this.shootCooldown > 0 || this.bossDead) return;
        this.shootCooldown = 0.20;
        this.gunRecoil = 1.0;

        if (this.audio && this.audio.playTick) {
            this.audio.playTick(1.85);
        }
        if (this.muzzleFlashLight) {
            this.muzzleFlashLight.intensity = 4.0;
        }

        const numStr = this.currentGunNumber;
        this.currentGunNumber = this.pickNextGunNumber();
        this.updateGunScreenTexture();

        const startPos = new THREE.Vector3();
        this.camera.getWorldPosition(startPos);
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        dir.normalize();

        startPos.addScaledVector(dir, 0.7);
        startPos.y -= 0.1;

        const projGroup = new THREE.Group();
        projGroup.position.copy(startPos);

        const sprite = new THREE.Sprite(this.createNumberSpriteMaterial(numStr, '#ffaa00'));
        sprite.scale.set(0.65, 0.65, 1);
        projGroup.add(sprite);

        const coreOrb = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffea00 })
        );
        projGroup.add(coreOrb);

        this.group.add(projGroup);
        this.projectiles.push({
            group: projGroup,
            dir: dir.clone(),
            speed: 32.0,
            life: 2.2,
            numStr,
            damage: numStr === '256' || numStr === '512' ? 55 : 35
        });
    }

    spawnFloatingHitNumber(pos, dmg) {
        const sprite = new THREE.Sprite(this.createNumberSpriteMaterial(`-${dmg}`, '#ff3311'));
        sprite.position.set(
            pos.x + (Math.random() - 0.5) * 0.8,
            pos.y + 2.2 + Math.random() * 0.4,
            pos.z + (Math.random() - 0.5) * 0.8
        );
        sprite.scale.set(0.85, 0.85, 1);
        this.group.add(sprite);
        this.floatingDamageTexts.push({ sprite, life: 0.75 });
    }

    // ROTE SCHALLWELLEN (STATT BLAU)
    fireWardenSonicBoom() {
        if (this.bossDead) return;
        if (this.audio) {
            if (this.audio.playCableSnap) this.audio.playCableSnap();
            if (this.audio.playMetalBang) this.audio.playMetalBang();
        }

        const origin = new THREE.Vector3(
            this.bossGroup.position.x,
            1.75,
            this.bossGroup.position.z
        );
        const rawPPos = this.player.position;
        const pPos = (typeof window.__fnsGetClosestPlayerPos === 'function')
            ? window.__fnsGetClosestPlayerPos('gym', origin, rawPPos)
            : rawPPos;
        const dir = new THREE.Vector3(pPos.x - origin.x, ((pPos.y || 1.6) - 0.3) - origin.y, pPos.z - origin.z).normalize();

        const waveGroup = new THREE.Group();
        waveGroup.position.copy(origin);

        const ringGeo = new THREE.TorusGeometry(0.85, 0.08, 10, 28);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff1100,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending
        });
        const mainRing = new THREE.Mesh(ringGeo, ringMat);
        waveGroup.add(mainRing);

        const innerRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.45, 0.055, 8, 20),
            new THREE.MeshBasicMaterial({
                color: 0xff7755,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending
            })
        );
        waveGroup.add(innerRing);

        waveGroup.lookAt(origin.clone().add(dir));
        this.group.add(waveGroup);

        this.activeSonicWaves.push({
            group: waveGroup,
            mainRing,
            ringMat,
            dir,
            speed: 20.0,
            life: 2.6,
            trailTimer: 0
        });
    }

    triggerBossDefeat() {
        if (this.bossDead) return;
        this.bossDead = true;
        this.bossHp = 0;
        this.updateBossHUD();

        if (this.audio) {
            this.audio.playMidnightGong();
            this.audio.playDoorSlam();
        }

        // Nach kurzem Umfallen des Bosses direkt Sieg auslösen
        setTimeout(() => {
            if (this.onVictoryCallback) {
                const cb = this.onVictoryCallback;
                this.onVictoryCallback = null;
                this.dispose();
                cb();
            }
        }, 1400);
    }

    getHoveredInteraction() {
        return null;
    }

    tryInteract() {
        this.fireNumberProjectile();
        return true;
    }

    resetOnCatch() {
        this.player.groundY = 0;
        this.player.footY = 0;
        this.player.position.set(0, 1.6, 1.5);
        this.camera.position.set(0, 1.6, 1.5);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(0, 0, 0);
        this.camera.quaternion.setFromEuler(this.camera.rotation);

        this.bossGroup.position.set(0, 0, -34.0);
        this.playerShield = this.maxPlayerShield;
        this.spawnGraceTimer = 3.5;
        this.isChargingSonic = false;
        this.sonicTimer = 3.2;
        this.updateBossHUD();
    }

    dispose() {
        if (this.bossHudEl) {
            this.bossHudEl.remove();
            this.bossHudEl = null;
        }
        if (this.gunGroup && this.gunGroup.parent) {
            this.gunGroup.parent.remove(this.gunGroup);
        }
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        if (this.hiddenSceneObjects) {
            this.hiddenSceneObjects.forEach((obj) => { obj.visible = true; });
            this.hiddenSceneObjects = [];
        }
        if (this.hiddenCameraChildren) {
            this.hiddenCameraChildren.forEach((c) => { c.visible = true; });
            this.hiddenCameraChildren = [];
        }
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('keydown', this._onKeyDown);
    }

    update(delta) {
        this.time += delta;

        if (this.shootCooldown > 0) this.shootCooldown -= delta;
        if (this.playerHitCooldown > 0) this.playerHitCooldown -= delta;
        if (this.spawnGraceTimer > 0) this.spawnGraceTimer -= delta;
        if (this.muzzleFlashLight && this.muzzleFlashLight.intensity > 0) {
            this.muzzleFlashLight.intensity = Math.max(0, this.muzzleFlashLight.intensity - delta * 28.0);
        }

        if (this.gunGroup) {
            this.gunRecoil = Math.max(0, this.gunRecoil - delta * 6.5);
            const walkBob = Math.sin(this.time * 7.5) * 0.007;
            this.gunGroup.position.set(0.27, -0.21 + walkBob + this.gunRecoil * 0.03, -0.44 + this.gunRecoil * 0.09);
            this.gunGroup.rotation.x = 0.04 + this.gunRecoil * 0.28;
        }

        for (const fl of this.flickeringLights) {
            const f = Math.sin(this.time * 14.0 + fl.seed) * Math.cos(this.time * 23.0 + fl.seed);
            if (f < -0.72) {
                fl.light.intensity = fl.baseInt * 0.22;
            } else {
                fl.light.intensity = fl.baseInt * (0.92 + f * 0.12);
            }
        }

        if (this.isEnteringWalk) {
            this.enterWalkProgress += delta * 1.45;
            const p = Math.min(1.0, this.enterWalkProgress);
            const walkZ = 3.8 - p * 2.4;
            this.player.position.set(0, 1.6, walkZ);
            this.camera.position.set(0, 1.6 + Math.sin(p * Math.PI * 4) * 0.04, walkZ);
            if (p >= 1.0) {
                this.isEnteringWalk = false;
                this.entranceDoorClosing = true;
            }
            return;
        }

        if (this.entranceDoorClosing && this.entranceDoorHinge) {
            this.entranceDoorAngle -= delta * 3.8;
            if (this.entranceDoorAngle <= 0) {
                this.entranceDoorAngle = 0;
                this.entranceDoorHinge.rotation.y = 0;
                this.entranceDoorClosing = false;
                this.hasWalkedInside = true;
                if (this.audio) this.audio.playDoorSlam();
            } else {
                this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;
            }
        }

        for (let i = this.floatingDamageTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingDamageTexts[i];
            ft.life -= delta;
            ft.sprite.position.y += delta * 1.4;
            ft.sprite.material.opacity = Math.max(0, ft.life / 0.75);
            if (ft.life <= 0) {
                this.group.remove(ft.sprite);
                this.floatingDamageTexts.splice(i, 1);
            }
        }

        const bPos = this.bossGroup.position;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.life -= delta;
            p.group.position.addScaledVector(p.dir, p.speed * delta);

            if (!this.bossDead) {
                const dx = p.group.position.x - bPos.x;
                const dz = p.group.position.z - bPos.z;
                const dy = p.group.position.y - (bPos.y + 1.65);
                if (Math.hypot(dx, dz) < 1.15 && Math.abs(dy) < 1.75) {
                    this.bossHp -= p.damage;
                    if (typeof window !== 'undefined' && typeof window.__fnsBroadcastBossDamage === 'function') {
                        window.__fnsBroadcastBossDamage(p.damage);
                    }
                    this.spawnFloatingHitNumber(bPos, p.damage);
                    this.updateBossHUD();

                    if (this.bossEntity.skinMat) {
                        this.bossEntity.skinMat.emissive.setHex(0x551100);
                        setTimeout(() => {
                            if (this.bossEntity && this.bossEntity.skinMat) {
                                this.bossEntity.skinMat.emissive.setHex(0x000000);
                            }
                        }, 90);
                    }

                    this.group.remove(p.group);
                    this.projectiles.splice(i, 1);

                    if (this.bossHp <= 0) {
                        this.triggerBossDefeat();
                    }
                    continue;
                }
            }

            if (p.life <= 0) {
                this.group.remove(p.group);
                this.projectiles.splice(i, 1);
            }
        }

        const pPos = this.player.position;
        for (let i = this.activeSonicWaves.length - 1; i >= 0; i--) {
            const w = this.activeSonicWaves[i];
            w.life -= delta;
            w.group.position.addScaledVector(w.dir, w.speed * delta);
            const scale = 1.0 + (2.6 - w.life) * 0.85;
            w.group.scale.set(scale, scale, scale);

            w.trailTimer += delta;
            if (w.trailTimer >= 0.08) {
                w.trailTimer = 0;
                const echoRing = new THREE.Mesh(
                    new THREE.TorusGeometry(0.65 * scale, 0.045, 8, 20),
                    new THREE.MeshBasicMaterial({
                        color: 0xcc0000,
                        transparent: true,
                        opacity: 0.65,
                        blending: THREE.AdditiveBlending
                    })
                );
                echoRing.position.copy(w.group.position);
                echoRing.quaternion.copy(w.group.quaternion);
                this.group.add(echoRing);
                setTimeout(() => { this.group.remove(echoRing); }, 420);
            }

            const distToPlayer = w.group.position.distanceTo(pPos);
            if (distToPlayer < 1.55) {
                if (this.playerHitCooldown <= 0 && this.spawnGraceTimer <= 0) {
                    this.playerHitCooldown = 0.65;
                    this.playerShield = Math.max(0, this.playerShield - this.sonicWaveDamage);
                    this.updateBossHUD();
                    if (this.audio && this.audio.playBoneCrack) this.audio.playBoneCrack();
                    this.player.position.addScaledVector(w.dir, 0.85);
                }

                this.group.remove(w.group);
                this.activeSonicWaves.splice(i, 1);

                if (this.playerShield <= 0 && this.onCaughtCallback) {
                    this.onCaughtCallback(this.bossEntity, this.bossGroup);
                    return;
                }
                continue;
            }

            if (w.life <= 0) {
                this.group.remove(w.group);
                this.activeSonicWaves.splice(i, 1);
            }
        }

        if (this.bossDead) {
            this.bossDeathTimer += delta;
            this.bossGroup.position.y = Math.max(-2.6, this.bossGroup.position.y - delta * 1.6);
            this.bossGroup.rotation.x = Math.min(Math.PI / 2, this.bossGroup.rotation.x + delta * 1.4);
            return;
        }

        // Schnellere Schild-Regeneration (5.0 pro Sekunde)
        if (this.playerShield < this.maxPlayerShield) {
            this.playerShield = Math.min(this.maxPlayerShield, this.playerShield + delta * 5.0);
            this.updateBossHUD();
        }

        const isMpClient = !!(window.__fnsMultiplayerActive && typeof window.__fnsIsMpAuthority === 'function' && !window.__fnsIsMpAuthority());
        const targetPlayerPos = (typeof window.__fnsGetClosestPlayerPos === 'function')
            ? window.__fnsGetClosestPlayerPos('gym', bPos, pPos)
            : pPos;

        this.sonicTimer -= delta;
        if (!this.isChargingSonic && this.sonicTimer <= 0) {
            this.isChargingSonic = true;
            this.sonicChargeTime = 0;
            if (this.audio && this.audio.playMidnightGong) this.audio.playMidnightGong();
        }

        if (this.isChargingSonic) {
            this.sonicChargeTime += delta;
            const cProg = Math.min(1.0, this.sonicChargeTime / this.sonicChargeDuration);
            this.bossEntity.animateWarden(delta, true, cProg);
            this.bossGroup.lookAt(targetPlayerPos.x, 0, targetPlayerPos.z);

            this.wardenCoreMat.opacity = 0.4 + cProg * 0.6;
            this.wardenCoreMesh.scale.setScalar(1.0 + cProg * 1.6);
            this.wardenCoreLight.intensity = 2.0 + cProg * 6.0;

            if (this.sonicChargeTime >= this.sonicChargeDuration) {
                this.isChargingSonic = false;
                this.sonicTimer = this.sonicCooldown;
                this.wardenCoreMesh.scale.setScalar(1.0);
                this.wardenCoreLight.intensity = 2.0;
                this.fireWardenSonicBoom();
            }
        } else {
            this.bossEntity.animateWarden(delta, false, 0);

            if (isMpClient && typeof window.__fnsApplyClientBoss === 'function') {
                window.__fnsApplyClientBoss(this.bossGroup, delta);
            } else {
                const toTarget = new THREE.Vector3(targetPlayerPos.x - bPos.x, 0, targetPlayerPos.z - bPos.z);
                const tDist = toTarget.length();
                if (tDist > 0.01) {
                    toTarget.normalize();
                    const desiredPos = bPos.clone().addScaledVector(toTarget, this.wardenSpeed * delta);
                    const resolvedPos = this.physics.resolveMovement(bPos, desiredPos, 0.55, 0.0);
                    bPos.x = resolvedPos.x;
                    bPos.z = resolvedPos.z;
                    this.bossGroup.lookAt(targetPlayerPos.x, 0, targetPlayerPos.z);
                }
            }

            const distToLocal = Math.hypot(pPos.x - bPos.x, pPos.z - bPos.z);
            this.stepSoundTimer += delta;
            if (this.stepSoundTimer >= 0.55) {
                this.stepSoundTimer = 0;
                if (distToLocal < 18.0 && this.audio && this.audio.playDoorSlam) {
                    this.audio.playDoorSlam();
                }
            }

            if (this.spawnGraceTimer <= 0 && distToLocal <= 1.55) {
                if (this.audio) this.audio.playJumpscareSound();
                if (this.onCaughtCallback) {
                    this.onCaughtCallback(this.bossEntity, this.bossGroup);
                }
            }
        }
    }
}


// [MILAN_MODE_HOOK_B2]

(() => {
    const cls = (typeof GymBossManager !== 'undefined') ? GymBossManager : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('GymBoss', this);
            milanMode.registerMonster(this);
            if (this._milanFurzKnockedDown && (method.toLowerCase().includes('update') || method.toLowerCase().includes('attack') || method.toLowerCase().includes('move'))) {
                return; // Boss is stunned by Milan Furz smoke!
            }
            if (milanMode.isMilan && (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick'))) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.6;
                }
            }
            return orig.apply(this, args);
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
