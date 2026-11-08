import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { FleischiMonster } from './FleischiMonster.js';

export class FloodedBoilerManager {
    constructor(scene, camera, player, audio, physics, onVictoryCallback, onCaughtCallback) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('heizungskeller', this), 200); }
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.audio = audio;
        this.physics = physics;
        this.onVictoryCallback = onVictoryCallback;
        this.onCaughtCallback = onCaughtCallback;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.waterSurfaceY = 0.48;
        this.wasInWater = false;
        this.waterSplashCooldown = 0;
        this.waterExposureTimer = 0; // Verhindert Durchrennen im Wasser!
        this.spawnGraceTimer = 2.0;
        this.time = 0;

        this.isEnteringWalk = true;
        this.enterWalkProgress = 0;
        this.entranceDoorClosing = false;
        this.entranceDoorAngle = Math.PI * 0.58;
        this.hasWalkedInside = false;

        this.staticCrates = [];
        this.floatingLogs = [];
        this.movingPlatforms = [];
        this.flickeringLights = [];
        this.steamClouds = [];
        this.waterFleischis = [];

        this.valves = [];
        this.valvesTurned = 0;
        this.totalValves = 3;
        this.lastCheckpointPos = new THREE.Vector3(0, 1.15, -1.0);
        this.exitPortalPos = null;

        this.initMaterials();
        this.buildHardcoreBoilerCourse();
    }

    initMaterials() {
        // 1. Detaillierte Heizungskeller-Ziegelwand mit Rost & Schmutz
        const wallCanvas = document.createElement('canvas');
        wallCanvas.width = 1024;
        wallCanvas.height = 1024;
        const wctx = wallCanvas.getContext('2d');

        wctx.fillStyle = '#120d0b';
        wctx.fillRect(0, 0, 1024, 1024);

        for (let y = 0; y < 1024; y += 32) {
            const offset = (y / 32) % 2 === 0 ? 0 : 32;
            for (let x = -32; x < 1024; x += 64) {
                const shade = Math.floor(Math.random() * 14) + 18;
                wctx.fillStyle = `rgb(${shade + 8}, ${shade}, ${shade - 2})`;
                wctx.fillRect(x + offset + 2, y + 2, 58, 26);
            }
        }

        for (let i = 0; i < 90; i++) {
            const rx = Math.random() * 1024;
            const ry = Math.random() * 400;
            const rw = Math.random() * 18 + 4;
            const rh = Math.random() * 500 + 150;
            const rustGrad = wctx.createLinearGradient(0, ry, 0, ry + rh);
            rustGrad.addColorStop(0, 'rgba(65, 20, 8, 0.55)');
            rustGrad.addColorStop(0.5, 'rgba(35, 10, 4, 0.35)');
            rustGrad.addColorStop(1, 'rgba(10, 5, 2, 0.0)');
            wctx.fillStyle = rustGrad;
            wctx.fillRect(rx, ry, rw, rh);
        }

        const wetGrad = wctx.createLinearGradient(0, 680, 0, 1024);
        wetGrad.addColorStop(0, 'rgba(0,0,0,0)');
        wetGrad.addColorStop(1, 'rgba(2, 5, 4, 0.95)');
        wctx.fillStyle = wetGrad;
        wctx.fillRect(0, 680, 1024, 344);

        const wallTex = new THREE.CanvasTexture(wallCanvas);
        wallTex.wrapS = THREE.RepeatWrapping;
        wallTex.wrapT = THREE.RepeatWrapping;
        wallTex.repeat.set(12, 1);
        this.wallMat = new THREE.MeshStandardMaterial({
            map: wallTex,
            bumpMap: wallTex,
            bumpScale: 0.04,
            roughness: 0.88,
            metalness: 0.12
        });

        // 2. Stahldecke
        const ceilCanvas = document.createElement('canvas');
        ceilCanvas.width = 512;
        ceilCanvas.height = 512;
        const cctx2 = ceilCanvas.getContext('2d');
        cctx2.fillStyle = '#0a0808';
        cctx2.fillRect(0, 0, 512, 512);
        for (let y = 0; y < 512; y += 16) {
            cctx2.fillStyle = y % 32 === 0 ? '#161110' : '#0c0909';
            cctx2.fillRect(0, y, 512, 12);
        }
        const ceilTex = new THREE.CanvasTexture(ceilCanvas);
        ceilTex.wrapS = THREE.RepeatWrapping;
        ceilTex.wrapT = THREE.RepeatWrapping;
        ceilTex.repeat.set(10, 30);
        this.ceilingMat = new THREE.MeshStandardMaterial({
            map: ceilTex,
            roughness: 0.8,
            metalness: 0.3
        });

        // 3. Solide Holzkiste MIT GROSSEM FLEISCHI-GESICHT OBEN & AUF DEN SEITEN!
        const crateCanvas = document.createElement('canvas');
        crateCanvas.width = 512;
        crateCanvas.height = 512;
        const cctx = crateCanvas.getContext('2d');

        const drawCrateFrame = () => {
            cctx.strokeStyle = '#1c0f05';
            cctx.lineWidth = 16;
            cctx.strokeRect(10, 10, 492, 492);
            cctx.lineWidth = 6;
            for (let y = 84; y < 512; y += 84) {
                cctx.beginPath();
                cctx.moveTo(0, y);
                cctx.lineTo(512, y);
                cctx.stroke();
            }
        };

        cctx.fillStyle = '#4a2e16';
        cctx.fillRect(0, 0, 512, 512);
        drawCrateFrame();

        const crateTex = new THREE.CanvasTexture(crateCanvas);
        crateTex.colorSpace = THREE.SRGBColorSpace;
        this.crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.72 });

        // 4. REALISTISCHE BAUMRINDEN- & JAHRESRING-TEXTUR FÜR DIE HOLZSTÄMME!
        const barkCanvas = document.createElement('canvas');
        barkCanvas.width = 512;
        barkCanvas.height = 512;
        const bctx2 = barkCanvas.getContext('2d');
        bctx2.fillStyle = '#2d1a0e';
        bctx2.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 450; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const w = Math.random() * 10 + 3;
            const h = Math.random() * 90 + 30;
            bctx2.fillStyle = Math.random() < 0.5 ? '#1c0f07' : '#3d2514';
            bctx2.fillRect(x, y, w, h);
        }
        // Moos- & Feuchtigkeitsflecken auf der Rinde
        for (let i = 0; i < 40; i++) {
            bctx2.fillStyle = 'rgba(25, 45, 20, 0.35)';
            bctx2.beginPath();
            bctx2.arc(Math.random() * 512, Math.random() * 512, Math.random() * 24 + 8, 0, Math.PI * 2);
            bctx2.fill();
        }
        const barkTex = new THREE.CanvasTexture(barkCanvas);
        barkTex.wrapS = THREE.RepeatWrapping;
        barkTex.wrapT = THREE.RepeatWrapping;
        barkTex.repeat.set(2, 4);
        this.logBarkMat = new THREE.MeshStandardMaterial({
            map: barkTex,
            bumpMap: barkTex,
            bumpScale: 0.05,
            roughness: 0.9,
            metalness: 0.05
        });

        // Jahresringe an den gesägten Enden der Holzstämme
        const ringCanvas = document.createElement('canvas');
        ringCanvas.width = 256;
        ringCanvas.height = 256;
        const rctx = ringCanvas.getContext('2d');
        rctx.fillStyle = '#8c6239';
        rctx.fillRect(0, 0, 256, 256);
        for (let r = 10; r < 120; r += 9) {
            rctx.strokeStyle = r % 18 === 0 ? '#5c3d1e' : '#734d29';
            rctx.lineWidth = 3;
            rctx.beginPath();
            rctx.arc(128, 128, r, 0, Math.PI * 2);
            rctx.stroke();
        }
        rctx.strokeStyle = '#2d1a0e';
        rctx.lineWidth = 14;
        rctx.beginPath();
        rctx.arc(128, 128, 121, 0, Math.PI * 2);
        rctx.stroke();
        const ringTex = new THREE.CanvasTexture(ringCanvas);
        this.logEndMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.8 });

        // 5. Rostige Ölfässer für Flöße
        const barrelCanvas = document.createElement('canvas');
        barrelCanvas.width = 128;
        barrelCanvas.height = 128;
        const bctx = barrelCanvas.getContext('2d');
        bctx.fillStyle = '#7a3b10';
        bctx.fillRect(0, 0, 128, 128);
        bctx.fillStyle = '#181210';
        bctx.fillRect(0, 24, 128, 22);
        bctx.fillRect(0, 82, 128, 22);
        const barrelTex = new THREE.CanvasTexture(barrelCanvas);
        this.barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, metalness: 0.5, roughness: 0.45 });

        this.overheadPipeMat = new THREE.MeshStandardMaterial({
            color: 0x3d1c12,
            roughness: 0.5,
            metalness: 0.72
        });

        this.pipeFlangeMat = new THREE.MeshStandardMaterial({
            color: 0x241510,
            roughness: 0.5,
            metalness: 0.82
        });

        this.catwalkMat = new THREE.MeshStandardMaterial({
            color: 0x22262a,
            roughness: 0.5,
            metalness: 0.75
        });

        // FLOSS-OBERSEITE MIT RIESIGEM FLEISCHI-GESICHT AUF DEN HOLZPLANKEN!
        const raftCanvas = document.createElement('canvas');
        raftCanvas.width = 512;
        raftCanvas.height = 512;
        const rftCtx = raftCanvas.getContext('2d');

        const drawRaftPlankLines = () => {
            rftCtx.strokeStyle = '#1a0d04';
            rftCtx.lineWidth = 8;
            for (let y = 64; y < 512; y += 64) {
                rftCtx.beginPath();
                rftCtx.moveTo(0, y);
                rftCtx.lineTo(512, y);
                rftCtx.stroke();
            }
            rftCtx.lineWidth = 14;
            rftCtx.strokeRect(7, 7, 498, 498);
        };

        rftCtx.fillStyle = '#4d3118';
        rftCtx.fillRect(0, 0, 512, 512);
        drawRaftPlankLines();

        const raftTex = new THREE.CanvasTexture(raftCanvas);
        raftTex.colorSpace = THREE.SRGBColorSpace;
        this.plankMat = new THREE.MeshStandardMaterial({
            map: raftTex,
            roughness: 0.80
        });

        const boilerFaceImg = new Image();
        boilerFaceImg.src = 'assets/textures/fleischi_face.png';
        boilerFaceImg.onload = () => {
            // Großes Gesicht auf die Kisten zeichnen
            cctx.fillStyle = '#4a2e16';
            cctx.fillRect(0, 0, 512, 512);
            cctx.save();
            cctx.globalAlpha = 0.92;
            cctx.drawImage(boilerFaceImg, 32, 32, 448, 448);
            cctx.restore();
            drawCrateFrame();
            crateTex.needsUpdate = true;

            // Großes Gesicht oben auf die Fass-Flöße zeichnen
            rftCtx.fillStyle = '#4d3118';
            rftCtx.fillRect(0, 0, 512, 512);
            rftCtx.save();
            rftCtx.globalAlpha = 0.92;
            rftCtx.drawImage(boilerFaceImg, 24, 24, 464, 464);
            rftCtx.restore();
            drawRaftPlankLines();
            raftTex.needsUpdate = true;
        };

        this.hazardMat = new THREE.MeshStandardMaterial({
            color: 0xcc1808,
            emissive: 0x330500,
            metalness: 0.65,
            roughness: 0.35
        });
    }

    buildHardcoreBoilerCourse() {
        this.physics.setMode('boiler', { minX: -13.2, maxX: 13.2, minZ: -113.5, maxZ: 2.5 });

        this.scene.fog = new THREE.FogExp2(0x050101, 0.052);

        this.player.groundY = 1.15;
        this.player.footY = 1.15;
        this.player.waterPenalty = 1.0;
        this.player.position.set(0, 1.15 + 1.6, 2.2);
        this.camera.position.set(0, 1.15 + 1.6, 2.2);

        const ambLight = new THREE.AmbientLight(0x1a0c0a, 0.38);
        this.group.add(ambLight);

        this.playerLight = new THREE.PointLight(0xffbb77, 1.9, 15.0);
        this.group.add(this.playerLight);

        // =========================================================================
        // 1. KELLER-ARCHITEKTUR & SCHWARZES WASSER
        // =========================================================================
        const subFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(30, 120),
            new THREE.MeshStandardMaterial({ color: 0x020304, roughness: 0.95 })
        );
        subFloor.rotation.x = -Math.PI / 2;
        subFloor.position.set(0, 0.0, -56);
        this.group.add(subFloor);
        this.physics.addRamp(-15, 15, -116, 4, 0.0, 0.0, 'z');

        this.waterGeo = new THREE.PlaneGeometry(30, 120, 48, 100);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x030507,
            emissive: 0x020000,
            roughness: 0.12,
            metalness: 0.9,
            transparent: true,
            opacity: 0.94
        });
        this.waterMesh = new THREE.Mesh(this.waterGeo, waterMat);
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.waterMesh.position.set(0, this.waterSurfaceY, -56);
        this.group.add(this.waterMesh);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 120), this.ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 5.4, -56);
        this.group.add(ceiling);

        const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.0, 120), this.wallMat);
        wallL.position.set(-14.0, 2.8, -56);
        const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.0, 120), this.wallMat);
        wallR.position.set(14.0, 2.8, -56);
        const wallBack = new THREE.Mesh(new THREE.BoxGeometry(30, 6.0, 0.8), this.wallMat);
        wallBack.position.set(0, 2.8, -114.5);
        this.group.add(wallL, wallR, wallBack);

        this.buildOverheadPipeNetworkAndHorrorLights();
        this.buildCreepyCobwebsAndHorrorProps();
        this.buildIndustrialBoilersAlongWalls();

        // =========================================================================
        // 2. START-PLATTFORM & EINGANGSTÜR
        // =========================================================================
        this.buildCatwalkPlatform(0, 1.15, -0.5, 6.5, 6.0);
        this.buildEntranceDoorOnStartPlatform();

        // =========================================================================
        // 3. SEKTION 1 (Z = -5 bis -33): HOLZSTÄMME, KISTEN & FLOSS ZU VENTIL 1/3
        // =========================================================================
        this.addStaticCrate(0.0, -6.2, 2.3, 2.3, 1.10);
        this.addStaticCrate(0.0, -9.8, 2.3, 2.3, 1.12);

        // Schwimmender Baumstamm (Holzstamm mit Rinde & Jahresringen!)
        this.addFloatingWoodLog(0.0, -15.0, 6.0, 1.14, 'z');

        // Seitlich fahrendes Fass-Floß
        this.addMovingBarrelRaft(0.0, -21.2, 2.6, 2.6, 1.15, 'x', 2.8, 1.4, 0.0);

        this.addStaticCrate(-2.3, -25.0, 2.3, 2.3, 1.18);
        this.addStaticCrate(2.3, -25.0, 2.3, 2.3, 1.18);
        this.addStaticCrate(0.0, -28.6, 2.4, 2.4, 1.20);

        // Plattform 1 (Z = -33.0) mit hochdetailliertem DRUCK-VENTIL 1/3
        this.buildCatwalkPlatform(0, 1.25, -33.0, 6.4, 4.4);
        this.addPressureValve(0, 1.25, -33.0, 1);

        // =========================================================================
        // 4. SEKTION 2 (Z = -36 bis -69): DOPPEL-HOLZSTÄMME & FLÖSSE ZU VENTIL 2/3
        // =========================================================================
        this.addMovingBarrelRaft(0.0, -38.2, 2.6, 2.6, 1.22, 'x', 3.2, 1.5, 0.0);
        this.addMovingBarrelRaft(0.0, -42.6, 2.6, 2.6, 1.25, 'x', 3.2, 1.5, Math.PI);

        this.addStaticCrate(0.0, -46.8, 2.4, 2.4, 1.25);

        // Zwei parallele dicke Holzstämme links & rechts
        this.addFloatingWoodLog(-2.6, -52.5, 6.8, 1.26, 'z');
        this.addFloatingWoodLog(2.6, -52.5, 6.8, 1.26, 'z');

        this.addStaticCrate(-1.8, -58.2, 2.3, 2.3, 1.28);
        this.addStaticCrate(1.8, -61.5, 2.3, 2.3, 1.30);
        this.addStaticCrate(-1.2, -64.8, 2.3, 2.3, 1.32);

        // Plattform 2 (Z = -69.0) mit hochdetailliertem DRUCK-VENTIL 2/3
        this.buildCatwalkPlatform(0, 1.35, -69.0, 6.4, 4.4);
        this.addPressureValve(0, 1.35, -69.0, 2);

        // =========================================================================
        // 5. SEKTION 3 (Z = -72 bis -108): ENDSPURT ZUM HAUPTVENTIL 3/3
        // =========================================================================
        this.addStaticCrate(0.0, -74.0, 2.4, 2.4, 1.32);
        this.addMovingBarrelRaft(0.0, -78.6, 2.6, 2.6, 1.32, 'x', 3.2, 1.55, 0.5);

        // Langer Baumstamm über das tiefe Becken
        this.addFloatingWoodLog(0.0, -86.5, 8.0, 1.34, 'z');

        this.addStaticCrate(-2.0, -93.2, 2.3, 2.3, 1.35);
        this.addStaticCrate(2.0, -96.6, 2.3, 2.3, 1.38);
        this.addMovingBarrelRaft(0.0, -100.5, 2.6, 2.6, 1.40, 'x', 3.0, 1.55, 1.2);

        // End-Plattform (Z = -108.5) mit HAUPTVENTIL 3/3 & Schleusentür
        this.buildCatwalkPlatform(0, 1.42, -108.5, 9.5, 9.0);
        this.addPressureValve(0, 1.42, -106.5, 3);
        this.buildExitDoorway();

        // =========================================================================
        // 6. UNTERWASSER-FLEISCHIS (TÖTEN BEIM DURCHRENNEN IM WASSER!)
        // =========================================================================
        this.spawnHorrorWaterFleischis();
    }

    
    createCobwebMaterial() {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, 512, 512);

        ctx.strokeStyle = "rgba(220, 225, 230, 0.42)";
        ctx.lineWidth = 2.0;

        // Radiale Spinnennetz-Fäden aus der Ecke (0,0) und Mitte
        for (let i = 0; i <= 18; i++) {
            const ang = (i / 18) * (Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(ang) * 700, Math.sin(ang) * 700);
            ctx.stroke();
        }

        // Konzentrische durchhängende Klebefäden
        for (let r = 36; r < 680; r += 34) {
            ctx.lineWidth = r % 68 === 0 ? 2.2 : 1.2;
            ctx.strokeStyle = "rgba(210, 215, 220, " + (0.48 - (r / 1600)).toFixed(2) + ")";
            ctx.beginPath();
            for (let a = 0; a <= 18; a++) {
                const ang = (a / 18) * (Math.PI / 2);
                const sag = (a % 2 === 0) ? 1.0 : 0.94;
                const px = Math.cos(ang) * r * sag;
                const py = Math.sin(ang) * r * sag;
                if (a === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        return new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.04,
            side: THREE.DoubleSide,
            depthWrite: false
        });
    }

    buildCreepyCobwebsAndHorrorProps() {
        const webMat = this.createCobwebMaterial();
        const hookMat = new THREE.MeshStandardMaterial({ color: 0x3a140c, metalness: 0.85, roughness: 0.4 });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        for (let z = -3; z >= -111; z -= 6) {
            // 1. Große Eck-Spinnenweben links und rechts zwischen Deckenrohren, Kesseln und Wänden
            for (const side of [-1, 1]) {
                const cornerWeb = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.4), webMat);
                cornerWeb.position.set(side * 12.1, 4.1, z);
                cornerWeb.rotation.y = side * 0.35;
                cornerWeb.rotation.z = side > 0 ? Math.PI / 2 : 0;
                // cobweb removed

                // Tiefe Hänge-Spinnenweben über dem schwarzen Wasser am Rand
                const lowWeb = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.4), webMat);
                lowWeb.position.set(side * 9.8, 1.8, z - 2.5);
                lowWeb.rotation.y = Math.PI / 2 + side * 0.25;
                // cobweb removed
            }

            // 2. Spinnenweben quer zwischen den oberen Haupt-Dampfrohren
            if (Math.abs(z) % 12 === 3) {
                const centerWeb = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.2), webMat);
                centerWeb.position.set((z % 24 === 0 ? -2.5 : 2.5), 4.2, z);
                centerWeb.rotation.y = 0.4;
                // cobweb removed

                // Rostige Fleischerhaken an Ketten über dem Parkour
                const hookGroup = new THREE.Group();
                hookGroup.position.set((z % 24 === 0 ? 1.8 : -1.8), 3.3, z - 1.5);
                const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), hookMat);
                chain.position.y = 0.8;
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 14), hookMat);
                ring.position.y = -0.35;
                hookGroup.add(chain, ring);
                this.group.add(hookGroup);
            }

            // 3. Unheimlich glühende rote Augenpaare in den stockdunklen Nischen hinter den Heizkesseln!
            if (Math.abs(z) % 18 === 9) {
                for (const side of [-1, 1]) {
                    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
                    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
                    eyeL.position.set(side * 13.1, 1.35, z - 0.14);
                    eyeR.position.set(side * 13.1, 1.35, z + 0.14);
                    this.group.add(eyeL, eyeR);
                }
            }
        }
    }

    buildOverheadPipeNetworkAndHorrorLights() {
        const mainPipeX = [-8.5, -3.2, 3.2, 8.5];
        for (const px of mainPipeX) {
            const mainGeo = new THREE.CylinderGeometry(0.32, 0.32, 118, 16);
            mainGeo.rotateX(Math.PI / 2);
            const mainPipe = new THREE.Mesh(mainGeo, this.overheadPipeMat);
            mainPipe.position.set(px, 4.85, -56);
            this.group.add(mainPipe);
        }

        const chainMat = new THREE.MeshStandardMaterial({ color: 0x2a2422, metalness: 0.85, roughness: 0.4 });
        const cageBulbMat = new THREE.MeshBasicMaterial({ color: 0xff5522 });

        for (let z = -4; z >= -110; z -= 8) {
            const crossGeo = new THREE.CylinderGeometry(0.24, 0.24, 28, 14);
            crossGeo.rotateZ(Math.PI / 2);
            const crossPipe = new THREE.Mesh(crossGeo, this.overheadPipeMat);
            crossPipe.position.set(0, 4.55, z);
            this.group.add(crossPipe);

            for (const side of [-1, 1]) {
                const downPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 5.2, 12), this.overheadPipeMat);
                downPipe.position.set(side * 13.3, 2.5, z);
                this.group.add(downPipe);

                const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12), this.pipeFlangeMat);
                flange.position.set(side * 13.3, 3.2, z);
                this.group.add(flange);

                const chainLen = 1.6 + (Math.abs(z) % 3) * 0.35;
                const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, chainLen, 6), chainMat);
                chain.position.set(side * 5.8, 4.55 - chainLen / 2, z);
                this.group.add(chain);
            }

            if (Math.abs(z) % 16 === 4) {
                const lampGroup = new THREE.Group();
                lampGroup.position.set(0, 4.35, z);

                const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.28, 8), this.pipeFlangeMat);
                const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), cageBulbMat.clone());
                bulb.position.y = -0.06;
                lampGroup.add(cage, bulb);
                this.group.add(lampGroup);

                const isRedEmergency = (Math.abs(z) % 32 === 4);
                const lightColor = isRedEmergency ? 0xff2200 : 0xff7722;
                const baseInt = isRedEmergency ? 1.8 : 1.5;

                const pLight = new THREE.PointLight(lightColor, baseInt, 15.0);
                pLight.position.set(0, 4.15, z);
                this.group.add(pLight);

                this.flickeringLights.push({
                    light: pLight,
                    bulbMesh: bulb,
                    baseIntensity: baseInt,
                    seed: Math.random() * 100
                });

                const steamGeo = new THREE.BufferGeometry();
                const sPos = new Float32Array(25 * 3);
                for (let s = 0; s < 25; s++) {
                    sPos[s * 3] = (Math.random() - 0.5) * 0.8;
                    sPos[s * 3 + 1] = -Math.random() * 1.8;
                    sPos[s * 3 + 2] = (Math.random() - 0.5) * 0.8;
                }
                steamGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
                const steamMat = new THREE.PointsMaterial({
                    color: 0x99aaaa,
                    size: 0.22,
                    transparent: true,
                    opacity: 0.25,
                    depthWrite: false
                });
                const steamMesh = new THREE.Points(steamGeo, steamMat);
                steamMesh.position.set((Math.random() < 0.5 ? -3.2 : 3.2), 4.5, z);
                this.group.add(steamMesh);
                this.steamClouds.push(steamMesh);
            }
        }
    }

    buildIndustrialBoilersAlongWalls() {
        const boilerMat = new THREE.MeshStandardMaterial({ color: 0x1c1412, metalness: 0.78, roughness: 0.45 });
        const grateMat = new THREE.MeshBasicMaterial({ color: 0xaa1100 });

        for (let bz = -12; bz >= -102; bz -= 18) {
            for (const side of [-1, 1]) {
                const bGroup = new THREE.Group();
                bGroup.position.set(side * 11.8, 0, bz);

                const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 5.0, 20), boilerMat);
                tank.position.y = 2.5;
                bGroup.add(tank);

                const exhaustPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.5, 12), this.overheadPipeMat);
                exhaustPipe.position.set(side * -1.2, 4.6, 0);
                exhaustPipe.rotation.z = side * 0.45;
                bGroup.add(exhaustPipe);

                const firebox = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.85), grateMat);
                firebox.position.set(side * -2.12, 1.25, 0);
                firebox.rotation.y = side * -Math.PI / 2;
                bGroup.add(firebox);

                const fLight = new THREE.PointLight(0xcc1100, 1.4, 11);
                fLight.position.set(side * -2.8, 1.6, 0);
                bGroup.add(fLight);

                this.group.add(bGroup);
                this.physics.addObstacle(side * 11.8 - 2.2, side * 11.8 + 2.2, bz - 2.2, bz + 2.2, -2, 6);
            }
        }
    }

    buildEntranceDoorOnStartPlatform() {
        const wallS1 = new THREE.Mesh(new THREE.BoxGeometry(14.0, 6.0, 0.6), this.wallMat);
        wallS1.position.set(-7.8, 3.0, 3.0);
        const wallS2 = new THREE.Mesh(new THREE.BoxGeometry(14.0, 6.0, 0.6), this.wallMat);
        wallS2.position.set(7.8, 3.0, 3.0);
        const wallTop = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.0, 0.6), this.wallMat);
        wallTop.position.set(0, 4.5, 3.0);
        this.group.add(wallS1, wallS2, wallTop);

        this.entranceDoorHinge = new THREE.Group();
        this.entranceDoorHinge.position.set(-0.65, 1.15, 2.95);
        this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;

        const doorPanel = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 2.45, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x3a2018, metalness: 0.5, roughness: 0.5 })
        );
        doorPanel.position.set(0.65, 1.225, 0);
        this.entranceDoorHinge.add(doorPanel);
        this.group.add(this.entranceDoorHinge);
    }

    buildCatwalkPlatform(x, y, z, w, d) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, y, d), this.catwalkMat);
        mesh.position.set(x, y / 2, z);
        this.group.add(mesh);

        const rim = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.08, 0.08, d + 0.08),
            new THREE.MeshBasicMaterial({ color: 0xaa5500 })
        );
        rim.position.set(x, y - 0.04, z);
        this.group.add(rim);

        this.physics.addRamp(x - (w / 2 + 0.12), x + (w / 2 + 0.12), z - (d / 2 + 0.12), z + (d / 2 + 0.12), y, y, 'z');
    }

    addStaticCrate(x, z, w = 2.3, d = 2.3, topY = 1.10) {
        const h = 0.75;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.crateMat);
        mesh.position.set(x, topY - h / 2, z);
        this.group.add(mesh);

        this.physics.addRamp(x - (w / 2 + 0.16), x + (w / 2 + 0.16), z - (d / 2 + 0.16), z + (d / 2 + 0.16), topY, topY, 'z');
        this.staticCrates.push({ mesh, baseY: topY - h / 2, phase: Math.random() * Math.PI * 2 });
    }

    // ECHTER 3D-HOLZSTAMM MIT BAUMRINDE, ASTSTUMPFEN & JAHRESRINGEN!
    addFloatingWoodLog(x, zCenter, length, topY = 1.18, axis = 'z') {
        const radius = 0.54;
        const logGroup = new THREE.Group();
        const baseY = topY - radius * 0.85;
        logGroup.position.set(x, baseY, zCenter);

        // Multi-Material Cylinder: Index 0 = Mantel (Baumrinde), Index 1 & 2 = Schnittflächen (Jahresringe)
        const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 24, 1, false);
        if (axis === 'z') {
            cylGeo.rotateX(Math.PI / 2);
        } else {
            cylGeo.rotateZ(Math.PI / 2);
        }
        const logMesh = new THREE.Mesh(cylGeo, [this.logBarkMat, this.logEndMat, this.logEndMat]);
        logGroup.add(logMesh);

        // Kleine seitliche Aststümpfe für echten Baumstamm-Look
        const numKnots = Math.max(2, Math.floor(length / 2.2));
        for (let i = 0; i < numKnots; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const offset = -length / 2 + 1.0 + i * 2.0;
            const knot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.10, 0.15, 0.28, 10),
                [this.logBarkMat, this.logEndMat, this.logEndMat]
            );
            if (axis === 'z') {
                knot.rotation.z = side * -Math.PI / 2.3;
                knot.position.set(side * (radius + 0.05), 0.05, offset);
            } else {
                knot.rotation.x = side * Math.PI / 2.3;
                knot.position.set(offset, 0.05, side * (radius + 0.05));
            }
            logGroup.add(knot);
        }

        this.group.add(logGroup);
        this.floatingLogs.push({ group: logGroup, baseY, phase: Math.random() * Math.PI * 2 });

        if (axis === 'z') {
            this.physics.addRamp(
                x - 0.72, x + 0.72,
                zCenter - (length / 2 + 0.18), zCenter + (length / 2 + 0.18),
                topY, topY, 'z'
            );
        } else {
            this.physics.addRamp(
                x - (length / 2 + 0.18), x + (length / 2 + 0.18),
                zCenter - 0.72, zCenter + 0.72,
                topY, topY, 'x'
            );
        }
    }

    addMovingBarrelRaft(baseX, baseZ, w, d, topY, axis, amplitude, speed, phase) {
        const raftGroup = new THREE.Group();
        raftGroup.position.set(baseX, topY - 0.35, baseZ);

        for (const bx of [-0.65, 0.65]) {
            for (const bz of [-0.65, 0.65]) {
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 14), this.barrelMat);
                barrel.rotation.z = Math.PI / 2;
                barrel.position.set(bx, -0.05, bz);
                raftGroup.add(barrel);
            }
        }

        const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), this.plankMat);
        deck.position.set(0, 0.28, 0);
        raftGroup.add(deck);

        this.group.add(raftGroup);

        const ramp = this.physics.addRamp(
            baseX - (w / 2 + 0.18), baseX + (w / 2 + 0.18),
            baseZ - (d / 2 + 0.18), baseZ + (d / 2 + 0.18),
            topY, topY, 'z'
        );

        this.movingPlatforms.push({
            group: raftGroup,
            ramp,
            baseX,
            baseZ,
            currentX: baseX,
            currentZ: baseZ,
            w,
            d,
            topY,
            axis,
            amplitude,
            speed,
            phase
        });
    }

    // HOCHDETAILLIERTES 3D-INDUSTRIE-DRUCKVENTIL (Mit Standrohr, Flanschen, Messing-Getriebe, Manometer, Achse & 6 Speichen!)
    addPressureValve(x, platformY, z, index) {
        const valveAssembly = new THREE.Group();
        valveAssembly.position.set(x, platformY, z);

        const brassMat = new THREE.MeshStandardMaterial({ color: 0xb58938, metalness: 0.85, roughness: 0.28 });
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x777d84, metalness: 0.9, roughness: 0.25 });
        const wheelPaintMat = new THREE.MeshStandardMaterial({
            color: 0xd91e11,
            emissive: 0x3a0500,
            metalness: 0.55,
            roughness: 0.35
        });

        // 1. Boden-Flanschplatte mit 4 Schrauben
        const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 16), this.pipeFlangeMat);
        basePlate.position.y = 0.04;
        valveAssembly.add(basePlate);

        // 2. Dickes vertikales Dampf-Standrohr + Mittel-Flanschringe
        const standPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.35, 18), this.overheadPipeMat);
        standPipe.position.y = 0.68;
        valveAssembly.add(standPipe);

        for (const fy of [0.45, 0.95]) {
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.07, 16), this.pipeFlangeMat);
            ring.position.y = fy;
            valveAssembly.add(ring);
        }

        // 3. Schweres Messing-Ventilgehäuse (T-Stück) oben auf dem Standrohr
        const valveBody = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), brassMat);
        valveBody.position.set(0, 1.32, 0);
        valveAssembly.add(valveBody);

        const sidePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.55, 14), this.overheadPipeMat);
        sidePipe.rotation.z = Math.PI / 2;
        sidePipe.position.set(-0.28, 1.05, 0);
        valveAssembly.add(sidePipe);

        // 4. Detailliertes Druck-Manometer (Anzeigeuhr) seitlich am Ventil!
        const gaugeStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), brassMat);
        gaugeStem.rotation.z = -Math.PI / 4;
        gaugeStem.position.set(0.18, 1.48, 0);
        valveAssembly.add(gaugeStem);

        const gaugeCase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 18), brassMat);
        gaugeCase.rotation.x = Math.PI / 2;
        gaugeCase.position.set(0.28, 1.58, 0);
        valveAssembly.add(gaugeCase);

        const gaugeFace = new THREE.Mesh(
            new THREE.CircleGeometry(0.11, 18),
            new THREE.MeshBasicMaterial({ color: 0xf5f0e1 })
        );
        gaugeFace.position.set(0.28, 1.58, 0.028);
        valveAssembly.add(gaugeFace);

        const gaugeNeedle = new THREE.Mesh(
            new THREE.BoxGeometry(0.012, 0.08, 0.01),
            new THREE.MeshBasicMaterial({ color: 0xcc0000 })
        );
        gaugeNeedle.position.set(0.29, 1.60, 0.032);
        gaugeNeedle.rotation.z = -0.6;
        valveAssembly.add(gaugeNeedle);

        // 5. Horizontale Stahl-Drehachse vom Ventilgehäuse nach vorne in das Handrad!
        const stemCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.16, 14), brassMat);
        stemCollar.rotation.x = Math.PI / 2;
        stemCollar.position.set(0, 1.32, 0.16);
        valveAssembly.add(stemCollar);

        const spindleShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.30, 14), steelMat);
        spindleShaft.rotation.x = Math.PI / 2;
        spindleShaft.position.set(0, 1.32, 0.26);
        valveAssembly.add(spindleShaft);

        // 6. DREHBARES HANDRAD MIT RADNABE, 6 SPEICHEN, AUSSENRING & DREHGRIFF!
        const wheelGroup = new THREE.Group();
        wheelGroup.position.set(0, 1.32, 0.36);

        const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.052, 16, 32), wheelPaintMat);
        wheelGroup.add(wheelRim);

        const centerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.09, 16), wheelPaintMat);
        centerHub.rotation.x = Math.PI / 2;
        wheelGroup.add(centerHub);

        const centerNut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6), steelMat);
        centerNut.rotation.x = Math.PI / 2;
        wheelGroup.add(centerNut);

        // 6 Speichen verbinden die Nabe mit dem Außenring
        for (let s = 0; s < 3; s++) {
            const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.82, 10), wheelPaintMat);
            spoke.rotation.z = (s / 3) * Math.PI;
            wheelGroup.add(spoke);
        }

        // Hervorstehender Drehknauf am Rand des Rades
        const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.16, 12), steelMat);
        handleKnob.rotation.x = Math.PI / 2;
        handleKnob.position.set(0, 0.42, 0.08);
        wheelGroup.add(handleKnob);

        // Unsichtbare Hitbox-Scheibe über das gesamte Ventilrad, damit man es überall bequem anklicken kann!
        const hitDisc = new THREE.Mesh(
            new THREE.CylinderGeometry(0.48, 0.48, 0.18, 16),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        hitDisc.rotation.x = Math.PI / 2;
        wheelGroup.add(hitDisc);

        valveAssembly.add(wheelGroup);
        this.group.add(valveAssembly);

        const light = new THREE.PointLight(0xffaa00, 2.2, 12);
        light.position.set(x, platformY + 2.4, z);
        this.group.add(light);

        const valveData = {
            index,
            wheelGroup: wheelGroup,
            paintMat: wheelPaintMat,
            hitMeshes: [wheelRim, centerHub, hitDisc],
            light,
            worldPos: new THREE.Vector3(x, platformY + 1.32, z),
            checkpointPos: new THREE.Vector3(x, platformY, z + 1.2),
            activated: false
        };

        wheelRim.userData.valveData = valveData;
        centerHub.userData.valveData = valveData;
        hitDisc.userData.valveData = valveData;
        this.valves.push(valveData);
    }

    buildExitDoorway() {
        this.exitDoorContainer = new THREE.Group();
        this.exitDoorContainer.position.set(0, 1.42, -112.8);

        const alcove = new THREE.Mesh(
            new THREE.PlaneGeometry(1.8, 2.7),
            new THREE.MeshBasicMaterial({ color: 0x050000 })
        );
        alcove.position.set(0, 1.35, 0.02);
        this.exitDoorContainer.add(alcove);
        this.exitAlcove = alcove;

        this.exitDoorHinge = new THREE.Group();
        this.exitDoorHinge.position.set(-0.85, 0, 0.06);
        const doorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.7, 2.7, 0.12),
            new THREE.MeshStandardMaterial({ color: 0x551a12, roughness: 0.5 })
        );
        doorMesh.position.set(0.85, 1.35, 0);
        this.exitDoorHinge.add(doorMesh);
        this.exitDoorContainer.add(this.exitDoorHinge);

        this.group.add(this.exitDoorContainer);
    }

    spawnHorrorWaterFleischis() {
        const configs = [
            {
                id: 1,
                minZ: -32.0,
                maxZ: -5.0,
                spawnPos: new THREE.Vector3(-5.5, -1.05, -18.0),
                patrolPoints: [
                    new THREE.Vector3(-5.0, -1.05, -10.0),
                    new THREE.Vector3(5.0, -1.05, -18.0),
                    new THREE.Vector3(-5.0, -1.05, -27.0),
                    new THREE.Vector3(5.0, -1.05, -27.0)
                ]
            },
            {
                id: 2,
                minZ: -68.0,
                maxZ: -35.0,
                spawnPos: new THREE.Vector3(5.5, -1.05, -52.0),
                patrolPoints: [
                    new THREE.Vector3(5.0, -1.05, -40.0),
                    new THREE.Vector3(-5.0, -1.05, -48.0),
                    new THREE.Vector3(5.0, -1.05, -60.0),
                    new THREE.Vector3(-5.0, -1.05, -62.0)
                ]
            },
            {
                id: 3,
                minZ: -105.0,
                maxZ: -71.0,
                spawnPos: new THREE.Vector3(-5.5, -1.05, -88.0),
                patrolPoints: [
                    new THREE.Vector3(-5.0, -1.05, -76.0),
                    new THREE.Vector3(5.0, -1.05, -84.0),
                    new THREE.Vector3(-5.0, -1.05, -96.0),
                    new THREE.Vector3(5.0, -1.05, -98.0)
                ]
            }
        ];

        const wakeRingGeo = new THREE.RingGeometry(0.38, 0.65, 24);
        wakeRingGeo.rotateX(-Math.PI / 2);

        for (const cfg of configs) {
            const entity = new FleischiMonster();
            const mGroup = entity.group;
            mGroup.position.copy(cfg.spawnPos);

            const waterGlow = new THREE.PointLight(0xff1100, 3.6, 11.0);
            waterGlow.position.set(0, 1.9, 0.4);
            mGroup.add(waterGlow);

            const wakeRings = [];
            for (let r = 0; r < 3; r++) {
                const rMat = new THREE.MeshBasicMaterial({
                    color: 0xff4422,
                    transparent: true,
                    opacity: 0.45,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const rMesh = new THREE.Mesh(wakeRingGeo, rMat);
                rMesh.position.set(cfg.spawnPos.x, this.waterSurfaceY + 0.02, cfg.spawnPos.z);
                this.group.add(rMesh);
                wakeRings.push({ mesh: rMesh, mat: rMat, phase: r / 3 });
            }

            const splashCount = 45;
            const splashGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(splashCount * 3);
            const velocities = [];
            for (let i = 0; i < splashCount; i++) {
                positions[i * 3] = 0;
                positions[i * 3 + 1] = Math.random() * 0.8;
                positions[i * 3 + 2] = 0;
                velocities.push({
                    vx: (Math.random() - 0.5) * 2.4,
                    vy: Math.random() * 3.2 + 1.5,
                    vz: (Math.random() - 0.5) * 2.4,
                    life: Math.random()
                });
            }
            splashGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const splashMat = new THREE.PointsMaterial({
                color: 0xddaaaa,
                size: 0.14,
                transparent: true,
                opacity: 0.8
            });
            const splashPoints = new THREE.Points(splashGeo, splashMat);
            splashPoints.position.set(cfg.spawnPos.x, this.waterSurfaceY, cfg.spawnPos.z);
            this.group.add(splashPoints);

            this.group.add(mGroup);
            this.waterFleischis.push({
                id: cfg.id,
                minZ: cfg.minZ,
                maxZ: cfg.maxZ,
                entity,
                group: mGroup,
                spawnPos: cfg.spawnPos.clone(),
                patrolPoints: cfg.patrolPoints,
                wpIndex: 0,
                wakeRings,
                splashPoints,
                splashVelocities: velocities,
                wasCharging: false,
                stalkSpeed: 1.85,
                // Schnell genug im Wasser (8.8 m/s), dass man NIEMALS einfach durchs Wasser rennen kann!
                chargeSpeed: 8.80
            });
        }
    }

    getHoveredInteraction(raycaster) {
        const hitList = [];
        for (const v of this.valves) {
            if (!v.activated) hitList.push(...v.hitMeshes);
        }
        if (hitList.length > 0) {
            const hits = raycaster.intersectObjects(hitList, false);
            if (hits.length > 0 && hits[0].distance < 3.8) {
                const vData = hits[0].object.userData.valveData;
                if (vData) {
                    return {
                        type: 'valve',
                        data: vData,
                        prompt: `[E] Druck-Ventil ${this.valvesTurned + 1}/${this.totalValves} aufdrehen`
                    };
                }
            }
        }
        return null;
    }

    tryInteract(raycaster) {
        const hit = this.getHoveredInteraction(raycaster);
        if (hit && hit.type === 'valve') {
            this.activateValve(hit.data);
            return true;
        }
        return false;
    }

    activateValve(vData) {
        if (vData.activated) return;
        vData.activated = true;
        this.valvesTurned++;
        this.lastCheckpointPos.copy(vData.checkpointPos);

        this.audio.playDrawerSlide();
        this.audio.playKeyPickup();

        vData.paintMat.color.setHex(0x00ff66);
        vData.paintMat.emissive.setHex(0x004411);
        vData.light.color.setHex(0x00ff66);

        let rot = 0;
        const spin = () => {
            if (rot < Math.PI * 2) {
                rot += 0.16;
                vData.wheelGroup.rotation.z = rot;
                requestAnimationFrame(spin);
            }
        };
        spin();

        const hud = document.getElementById('hud-message');
        if (this.valvesTurned >= this.totalValves) {
            this.unlockExitDoor();
        } else if (hud) {
            hud.innerText = `VENTIL ${this.valvesTurned}/${this.totalValves} AKTIVIERT (CHECKPOINT GESPEICHERT)!`;
            hud.style.color = '#00ff88';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 2500);
        }
    }

    unlockExitDoor() {
        this.audio.playMidnightGong();

        let rot = 0;
        const openDoor = () => {
            if (rot < Math.PI * 0.62) {
                rot += 0.05;
                this.exitDoorHinge.rotation.y = -rot;
                requestAnimationFrame(openDoor);
            }
        };
        openDoor();

        if (this.exitAlcove) this.exitAlcove.visible = false;
        const portalMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.75, 2.68),
            new THREE.MeshBasicMaterial({ color: 0x00ff66, side: THREE.DoubleSide })
        );
        portalMesh.position.set(0, 1.35, 0.02);
        this.exitDoorContainer.add(portalMesh);

        const portalLight = new THREE.PointLight(0x00ff66, 6.0, 16);
        portalLight.position.set(0, 2.0, 1.0);
        this.exitDoorContainer.add(portalLight);

        this.exitPortalPos = new THREE.Vector3(0, 1.42, -112.6);

        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = "ALLE 3 VENTILE OFFEN! LAUF DURCH DAS GRÜNE PORTAL!";
            hud.style.color = '#00ff66';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 3000);
        }
    }

    resetOnCatch() {
        this.player.waterPenalty = 1.0;
        this.wasInWater = false;
        this.waterExposureTimer = 0;
        this.spawnGraceTimer = 2.0;

        const cp = this.lastCheckpointPos;
        this.player.groundY = cp.y;
        this.player.footY = cp.y;
        this.player.position.set(cp.x, cp.y + 1.6, cp.z);
        this.camera.position.set(cp.x, cp.y + 1.6, cp.z);

        for (const wf of this.waterFleischis) {
            wf.group.position.copy(wf.spawnPos);
            wf.wasCharging = false;
            wf.entity.resetPose();
        }
    }

    update(delta) {
        this.time += delta;
        if (this.spawnGraceTimer > 0) {
            this.spawnGraceTimer -= delta;
        }

        if (this.isEnteringWalk) {
            this.enterWalkProgress += delta * 1.45;
            const p = Math.min(1.0, this.enterWalkProgress);

            const walkZ = 2.2 - p * 3.2;
            const bobY = Math.sin(p * Math.PI * 4.0) * 0.045;
            this.player.groundY = 1.15;
            this.player.footY = 1.15;
            this.player.position.set(0, 1.15 + 1.6, walkZ);
            this.camera.position.set(0, 1.15 + 1.6 + bobY, walkZ);

            if (p >= 1.0) {
                this.isEnteringWalk = false;
                this.entranceDoorClosing = true;
            }
        }

        if (this.entranceDoorClosing && this.entranceDoorHinge) {
            this.entranceDoorAngle -= delta * 3.8;
            if (this.entranceDoorAngle <= 0) {
                this.entranceDoorAngle = 0;
                this.entranceDoorHinge.rotation.y = 0;
                this.entranceDoorClosing = false;
                this.hasWalkedInside = true;
                this.audio.playDoorSlam();

                const hud = document.getElementById('hud-message');
                if (hud) {
                    hud.innerText = "DREHE DIE 3 VENTILE [E] AUF! SPRING ÜBER DIE KISTEN & HOLZSTÄMME – IM WASSER PACKT DICH FLEISCHI!";
                    hud.style.color = '#ff4422';
                    hud.style.display = 'block';
                    setTimeout(() => { hud.style.display = 'none'; }, 5000);
                }
            } else {
                this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;
            }
        }

        const pPos = this.player.position;
        this.playerLight.position.set(pPos.x, pPos.y + 0.8, pPos.z);

        for (const fl of this.flickeringLights) {
            const flicker = Math.sin(this.time * 14.0 + fl.seed) * Math.cos(this.time * 23.0 + fl.seed);
            if (flicker < -0.65) {
                fl.light.intensity = fl.baseIntensity * 0.15;
                fl.bulbMesh.material.color.setHex(0x330800);
            } else {
                fl.light.intensity = fl.baseIntensity * (0.9 + flicker * 0.2);
                fl.bulbMesh.material.color.setHex(0xff5522);
            }
        }

        for (const sc of this.steamClouds) {
            const posAttr = sc.geometry.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                let y = posAttr.getY(i) - delta * 0.85;
                if (y < -2.2) y = 0;
                posAttr.setY(i, y);
            }
            posAttr.needsUpdate = true;
        }

        if (this.exitPortalPos) {
            const distToExit = Math.hypot(pPos.x - this.exitPortalPos.x, pPos.z - this.exitPortalPos.z);
            if (distToExit < 1.8) {
                this.player.waterPenalty = 1.0;
                this.audio.playKeyPickup();
                this.onVictoryCallback();
                return;
            }
        }

        const wPos = this.waterGeo.attributes.position;
        for (let i = 0; i < wPos.count; i++) {
            const vx = wPos.getX(i);
            const vy = wPos.getY(i);
            const wave = Math.sin(vx * 0.5 + this.time * 2.2) * 0.045 + Math.cos(vy * 0.4 + this.time * 1.8) * 0.045;
            wPos.setZ(i, wave);
        }
        wPos.needsUpdate = true;

        for (const c of this.staticCrates) {
            c.mesh.position.y = c.baseY + Math.sin(this.time * 2.0 + c.phase) * 0.02;
        }

        for (const lg of this.floatingLogs) {
            lg.group.position.y = lg.baseY + Math.sin(this.time * 1.8 + lg.phase) * 0.02;
            lg.group.rotation.z = Math.cos(this.time * 1.4 + lg.phase) * 0.025;
        }

        for (const mp of this.movingPlatforms) {
            const prevX = mp.currentX;
            const prevZ = mp.currentZ;
            const offset = Math.sin(this.time * mp.speed + mp.phase) * mp.amplitude;

            if (mp.axis === 'x') {
                mp.currentX = mp.baseX + offset;
            } else {
                mp.currentZ = mp.baseZ + offset;
            }

            const dx = mp.currentX - prevX;
            const dz = mp.currentZ - prevZ;

            mp.group.position.set(mp.currentX, mp.topY - 0.35, mp.currentZ);
            mp.ramp.minX = mp.currentX - (mp.w / 2 + 0.18);
            mp.ramp.maxX = mp.currentX + (mp.w / 2 + 0.18);
            mp.ramp.minZ = mp.currentZ - (mp.d / 2 + 0.18);
            mp.ramp.maxZ = mp.currentZ + (mp.d / 2 + 0.18);

            if (
                this.player.isGrounded &&
                pPos.x >= mp.ramp.minX && pPos.x <= mp.ramp.maxX &&
                pPos.z >= mp.ramp.minZ && pPos.z <= mp.ramp.maxZ &&
                Math.abs(this.player.footY - mp.topY) < 0.35
            ) {
                this.player.position.x += dx;
                this.player.position.z += dz;
            }
        }

        // WASSER-CHECK: Im Wasser bist du langsam UND nach 1.8s im Wasser taucht Fleischi direkt vor dir auf und packt dich!
        const playerInWater = this.player.footY < 0.50;
        this.player.waterPenalty = playerInWater ? 0.55 : 1.0;

        if (playerInWater) {
            if (!this.wasInWater) {
                this.audio.playWaterSplash(0.95);
            }
            this.waterExposureTimer += delta;
        } else {
            this.waterExposureTimer = Math.max(0, this.waterExposureTimer - delta * 2.5);
        }
        this.wasInWater = playerInWater;

        if (this.waterSplashCooldown > 0) this.waterSplashCooldown -= delta;
        if (playerInWater && this.waterSplashCooldown <= 0 && (this.player.keys.w || this.player.keys.a || this.player.keys.s || this.player.keys.d)) {
            this.waterSplashCooldown = 0.45;
            this.audio.playWaterSplash(0.4);
        }

        if (this.hasWalkedInside && this.spawnGraceTimer <= 0) {
            // Findet den nächsten Fleischi für den Fall, dass der Spieler versucht, im Wasser durchzurennen!
            let closestWf = this.waterFleischis[0];
            let minWfDist = Infinity;

            for (const wf of this.waterFleischis) {
                const mPos = wf.group.position;
                const d = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);
                if (d < minWfDist) {
                    minWfDist = d;
                    closestWf = wf;
                }

                const inSector = pPos.z >= wf.minZ - 6.0 && pPos.z <= wf.maxZ + 6.0;
                const isCharging = playerInWater && (inSector || d < 22.0);

                if (isCharging && !wf.wasCharging) {
                    this.audio.playJumpscareSound();
                    // Wenn er noch weit weg war, taucht er in 5.5m Entfernung vor dir im Wasser auf!
                    if (d > 6.5) {
                        const lookDir = new THREE.Vector3();
                        this.camera.getWorldDirection(lookDir);
                        lookDir.y = 0;
                        lookDir.normalize();
                        mPos.x = Math.max(-11.0, Math.min(11.0, pPos.x + lookDir.x * 5.2));
                        mPos.z = pPos.z + lookDir.z * 5.2;
                    }
                }
                wf.wasCharging = isCharging;

                const targetSubmergeY = isCharging ? -0.15 : -0.95;
                mPos.y += (targetSubmergeY - mPos.y) * Math.min(1.0, delta * 6.0);

                wf.entity.animateWaterStalk(delta, isCharging);

                if (isCharging) {
                    const dir = new THREE.Vector3(pPos.x - mPos.x, 0, pPos.z - mPos.z).normalize();
                    mPos.addScaledVector(dir, wf.chargeSpeed * delta);
                    wf.group.lookAt(pPos.x, mPos.y, pPos.z);
                } else {
                    const targetWp = wf.patrolPoints[wf.wpIndex];
                    const dir = new THREE.Vector3(targetWp.x - mPos.x, 0, targetWp.z - mPos.z);
                    if (dir.length() < 0.6) {
                        wf.wpIndex = (wf.wpIndex + 1) % wf.patrolPoints.length;
                    } else {
                        dir.normalize();
                        mPos.addScaledVector(dir, wf.stalkSpeed * delta);
                    }
                    if (inSector) {
                        wf.group.lookAt(pPos.x, mPos.y, pPos.z);
                    } else {
                        wf.group.lookAt(targetWp.x, mPos.y, targetWp.z);
                    }
                }

                for (const ring of wf.wakeRings) {
                    ring.phase = (ring.phase + delta * (isCharging ? 2.2 : 0.85)) % 1.0;
                    const scale = 0.8 + ring.phase * (isCharging ? 4.2 : 2.3);
                    ring.mesh.position.set(mPos.x, this.waterSurfaceY + 0.02, mPos.z);
                    ring.mesh.scale.set(scale, scale, 1);
                    ring.mat.opacity = (1.0 - ring.phase) * (isCharging ? 0.8 : 0.4);
                }

                wf.splashPoints.position.set(mPos.x, this.waterSurfaceY, mPos.z);
                const sAttr = wf.splashPoints.geometry.attributes.position;
                const splashSpeedMult = isCharging ? 2.0 : 0.65;
                for (let i = 0; i < wf.splashVelocities.length; i++) {
                    const v = wf.splashVelocities[i];
                    v.life += delta * splashSpeedMult;
                    if (v.life >= 1.0) {
                        v.life = 0;
                        sAttr.setXYZ(i, (Math.random() - 0.5) * 0.9, 0.05, (Math.random() - 0.5) * 0.9);
                    } else {
                        const px = v.vx * v.life * (isCharging ? 1.25 : 0.45);
                        const py = v.vy * v.life - 4.8 * v.life * v.life;
                        const pz = v.vz * v.life * (isCharging ? 1.25 : 0.45);
                        sAttr.setXYZ(i, px, Math.max(0, py), pz);
                    }
                }
                sAttr.needsUpdate = true;

                const newDist = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);
                if (playerInWater && newDist <= 1.45) {
                    this.audio.playWaterSplash(1.0);
                    this.audio.playJumpscareSound();
                    if (this.onCaughtCallback) {
                        this.onCaughtCallback(wf.entity, wf.group);
                    }
                    return;
                }
            }

            // Wenn der Spieler länger als 1.8 Sekunden im Wasser bleibt (Versuch durchzurennen),
            // schießt Fleischi direkt vor ihm aus dem Wasser hoch und packt ihn garantiert!
            if (playerInWater && this.waterExposureTimer >= 1.8 && closestWf) {
                this.audio.playWaterSplash(1.0);
                this.audio.playJumpscareSound();
                if (this.onCaughtCallback) {
                    this.onCaughtCallback(closestWf.entity, closestWf.group);
                }
                return;
            }
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof FloodedBoilerManager !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'heizungskeller', cls: FloodedBoilerManager });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('heizungskeller', FloodedBoilerManager);
  }
}
