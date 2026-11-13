import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { FleischiMonster } from './FleischiMonster.js';

export class SchoolLevelManager {
    constructor(scene, camera, player, audio, physics, onExitSchoolStairwell, onCaughtCallback) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('school_hallway', this), 200); }
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.audio = audio;
        this.physics = physics;
        this.onExitSchoolStairwell = onExitSchoolStairwell;
        this.onCaughtCallback = onCaughtCallback;

        this.origin = new THREE.Vector3(0, 0, 0);
        this.rotY = 0;
        this.transformData = { ox: 0, oz: 0, rotY: 0 };

        this.isEnteringWalk = true;
        this.enterWalkProgress = 0;
        this.entranceDoorClosing = false;
        this.entranceDoorAngle = Math.PI * 0.58;
        this.hasWalkedInside = false;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.lockers = [];
        this.lockerMeshes = [];
        this.activeLocker = null;

        this.lockerAnimState = 'none';
        this.lockerAnimProgress = 0;
        this.lockerStartCamPos = new THREE.Vector3();
        this.lockerStartQuat = new THREE.Quaternion();
        this.lockerPeekYawOffset = 0;
        this.lockerPeekPitchOffset = 0;
        this.lockerBreathTimer = 0;
        this.lockerGraceTimer = 0;

        this.patrolGuards = [];
        this.stairDoors = [];
        this.stairDoorMeshes = [];
        this.flickeringLights = [];
        this.southShaftWallObs = null;
        this.exitPortalPos = null;
        this.time = 0;

        this.slidingDoorClosed = false;
        this.slidingDoorObstacle = null;
        this.stairChaser = null;
        this.stairChaserActive = false;
        this.stairChaserSpawned = false;
        this.stairChaserWpIndex = 1;

        this.stairWaypoints = [
            new THREE.Vector3(13.9, 0.0, -59.2),
            new THREE.Vector3(13.9, 0.0, -61.0),
            new THREE.Vector3(13.9, 3.0, -69.8),
            new THREE.Vector3(18.1, 3.0, -69.8),
            new THREE.Vector3(18.1, 6.0, -59.8),
            new THREE.Vector3(13.9, 6.0, -59.8),
            new THREE.Vector3(13.9, 9.0, -69.8),
            new THREE.Vector3(18.1, 9.0, -69.8),
            new THREE.Vector3(18.1, 12.0, -59.8),
            new THREE.Vector3(13.9, 12.0, -59.8),
            new THREE.Vector3(13.9, 15.0, -69.8)
        ];

        this.setupLockerPeekMouse();
        this.initSchoolAndStairwell();
    }

    setupLockerPeekMouse() {
        window.addEventListener('mousemove', (e) => {
            if (this.lockerAnimState === 'inside' && this.activeLocker) {
                this.lockerPeekYawOffset -= e.movementX * 0.0018;
                this.lockerPeekPitchOffset -= e.movementY * 0.0014;
                this.lockerPeekYawOffset = Math.max(-0.48, Math.min(0.48, this.lockerPeekYawOffset));
                this.lockerPeekPitchOffset = Math.max(-0.22, Math.min(0.22, this.lockerPeekPitchOffset));
            }
        });
    }

    localToWorld(lx, ly, lz) {
        return new THREE.Vector3(lx, ly, lz);
    }

    worldToLocal(wx, wy, wz) {
        return new THREE.Vector3(wx, wy, wz);
    }

    addLocalRamp(minX, maxX, minZ, maxZ, startY, endY, axis = 'z') {
        return this.physics.addRamp(minX, maxX, minZ, maxZ, startY, endY, axis, null);
    }

    addSchoolWall(lx, ly, lz, w, h, d, mat) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(lx, ly, lz);
        this.group.add(mesh);

        const obs = this.physics.addObstacle(
            lx - w / 2,
            lx + w / 2,
            lz - d / 2,
            lz + d / 2,
            ly - h / 2,
            ly + h / 2
        );
        return { mesh, obs };
    }

    // 1. HORROR-SCHULFLIESEN: Gesprungene, schmutzige und blutbefleckte Schachbrett-Fliesen mit Bump-Map!
    createSchoolTileMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#0c0f12';
        ctx.fillRect(0, 0, 1024, 1024);

        const tileSize = 128;
        for (let y = 0; y < 1024; y += tileSize) {
            for (let x = 0; x < 1024; x += tileSize) {
                const isLight = ((x + y) / tileSize) % 2 === 0;
                ctx.fillStyle = isLight ? '#24292e' : '#14181c';
                ctx.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);

                // Schmutz-Schattierung an den Fliesenkanten
                ctx.strokeStyle = 'rgba(0,0,0,0.45)';
                ctx.lineWidth = 4;
                ctx.strokeRect(x + 5, y + 5, tileSize - 10, tileSize - 10);

                // Risse in einzelnen Fliesen
                if (Math.random() < 0.35) {
                    ctx.strokeStyle = '#080a0c';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x + 20, y + 10);
                    ctx.lineTo(x + 65, y + 70);
                    ctx.lineTo(x + 110, y + 95);
                    ctx.stroke();
                }
            }
        }

        // Dunkle Schleif-, Schmutz- und Blutspuren auf dem Schulboden
        for (let i = 0; i < 45; i++) {
            const gx = Math.random() * 1024;
            const gy = Math.random() * 1024;
            const gr = 30 + Math.random() * 90;
            const grad = ctx.createRadialGradient(gx, gy, 4, gx, gy, gr);
            grad.addColorStop(0, i % 3 === 0 ? 'rgba(55, 6, 4, 0.55)' : 'rgba(6, 8, 6, 0.65)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, gy, gr, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(14, 18);
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.025,
            roughness: 0.38,
            metalness: 0.22
        });
    }

    // 2. HORROR-SCHULWAND: Abblätternder Putz, Feuchtigkeitsflecken, Rostläufer & dunkle Kranken-/Schul-Vertäfelung
    createSchoolWallMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Oberer verputzter Wandteil (schmutziges Ocker/Grau)
        ctx.fillStyle = '#2e2d27';
        ctx.fillRect(0, 0, 1024, 560);

        // Unterer gefliester/lackierter Schulwandteil (düsteres Tannengrün)
        ctx.fillStyle = '#14201a';
        ctx.fillRect(0, 560, 1024, 464);

        // Wandfliesen-Raster im unteren Teil
        ctx.strokeStyle = 'rgba(8, 14, 11, 0.55)';
        ctx.lineWidth = 2;
        for (let x = 0; x < 1024; x += 64) {
            ctx.beginPath();
            ctx.moveTo(x, 560);
            ctx.lineTo(x, 1024);
            ctx.stroke();
        }
        for (let y = 560; y < 1024; y += 64) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(1024, y);
            ctx.stroke();
        }

        // Rost-, Schimmel- und Wasserschäden über die gesamte Wand
        for (let i = 0; i < 85; i++) {
            const rx = Math.random() * 1024;
            const ry = Math.random() * 900;
            const rw = 8 + Math.random() * 28;
            const rh = 80 + Math.random() * 320;
            const rGrad = ctx.createLinearGradient(0, ry, 0, ry + rh);
            rGrad.addColorStop(0, i % 4 === 0 ? 'rgba(60, 10, 6, 0.50)' : 'rgba(12, 14, 10, 0.55)');
            rGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = rGrad;
            ctx.fillRect(rx, ry, rw, rh);
        }

        // Trennleiste & verdreckte Sockelleiste
        ctx.fillStyle = '#0a0f0c';
        ctx.fillRect(0, 548, 1024, 24);
        ctx.fillStyle = '#291a12';
        ctx.fillRect(0, 554, 1024, 8);
        ctx.fillStyle = '#070908';
        ctx.fillRect(0, 976, 1024, 48);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(10, 1);
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.03,
            roughness: 0.82,
            metalness: 0.08
        });
    }

    // 3. HORROR-TREPPENHAUS-BETON: Schwerer rissiger Sichtbeton mit Schalungsfugen, Rostläufern & Kratzspuren
    createStairwellConcreteMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#18171a';
        ctx.fillRect(0, 0, 1024, 1024);

        // Horizontale Beton-Schalungsplatten
        for (let y = 0; y < 1024; y += 128) {
            ctx.fillStyle = (y / 128) % 2 === 0 ? '#1c1b1f' : '#151417';
            ctx.fillRect(0, y, 1024, 126);
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, y + 124, 1024, 4);

            // Schalungslöcher (Tie-Rod Holes) mit herunterlaufendem Rost
            for (let x = 96; x < 1024; x += 256) {
                ctx.fillStyle = '#050506';
                ctx.beginPath();
                ctx.arc(x, y + 64, 6, 0, Math.PI * 2);
                ctx.fill();

                const rust = ctx.createLinearGradient(0, y + 64, 0, y + 190);
                rust.addColorStop(0, 'rgba(75, 22, 8, 0.65)');
                rust.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rust;
                ctx.fillRect(x - 5, y + 64, 10, 126);
            }
        }

        // Dunkle Flecken & feine Betonrisse
        for (let i = 0; i < 60; i++) {
            const cx = Math.random() * 1024;
            const cy = Math.random() * 1024;
            const cr = 25 + Math.random() * 90;
            const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, cr);
            g.addColorStop(0, i % 3 === 0 ? 'rgba(50, 8, 5, 0.45)' : 'rgba(5, 5, 6, 0.55)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 5);
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.038,
            roughness: 0.88,
            metalness: 0.12
        });
    }

    createCobwebMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'rgba(215, 220, 225, 0.36)';
        ctx.lineWidth = 1.8;
        for (let i = 0; i <= 16; i++) {
            const ang = (i / 16) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(256, 256);
            ctx.lineTo(256 + Math.cos(ang) * 250, 256 + Math.sin(ang) * 250);
            ctx.stroke();
        }
        for (let r = 30; r < 250; r += 30) {
            ctx.beginPath();
            ctx.arc(256, 256, r, 0, Math.PI * 2);
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

    createArrowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = '#cc3311';
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 14;

        ctx.beginPath();
        ctx.moveTo(128, 22);
        ctx.lineTo(220, 125);
        ctx.lineTo(165, 125);
        ctx.lineTo(165, 230);
        ctx.lineTo(91, 230);
        ctx.lineTo(91, 125);
        ctx.lineTo(36, 125);
        ctx.closePath();
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }

    buildEntranceDoorWithFrame(wallMat) {
        this.addSchoolWall(-1.65, 2.0, 0.0, 2.1, 4.0, 0.4, wallMat);
        this.addSchoolWall(1.65, 2.0, 0.0, 2.1, 4.0, 0.4, wallMat);

        const topWall = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.4), wallMat);
        topWall.position.set(0, 3.25, 0.0);
        this.group.add(topWall);

        this.physics.addObstacle(-2.8, 2.8, -0.22, 0.25, -1, 5);

        const darkBackdrop = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 2.6, 0.8),
            new THREE.MeshBasicMaterial({ color: 0x050202, side: THREE.BackSide })
        );
        darkBackdrop.position.set(0, 1.3, 0.45);
        this.group.add(darkBackdrop);

        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a0805, roughness: 0.5 });
        const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.55, 0.44), frameMat);
        frameL.position.set(-0.66, 1.27, 0.0);
        const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.55, 0.44), frameMat);
        frameR.position.set(0.66, 1.27, 0.0);
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.16, 0.44), frameMat);
        frameTop.position.set(0, 2.50, 0.0);
        this.group.add(frameL, frameR, frameTop);

        this.entranceDoorHinge = new THREE.Group();
        this.entranceDoorHinge.position.set(-0.6, 0, -0.05);
        this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;

        const doorWoodMat = new THREE.MeshStandardMaterial({
            color: 0x5c140c,
            emissive: 0x1a0300,
            roughness: 0.48
        });
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            emissive: 0x442800,
            metalness: 0.9,
            roughness: 0.2
        });

        const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.45, 0.09), doorWoodMat);
        doorPanel.position.set(0.6, 1.225, 0);
        this.entranceDoorHinge.add(doorPanel);

        const handleIn = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), handleMat);
        handleIn.position.set(1.02, 1.15, -0.08);
        const handleOut = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), handleMat);
        handleOut.position.set(1.02, 1.15, 0.08);
        this.entranceDoorHinge.add(handleIn, handleOut);

        this.group.add(this.entranceDoorHinge);
    }

    initSchoolAndStairwell() {
        this.physics.setMode('school', null);

        this.player.groundY = 0;
        this.player.position.set(0, 1.6, 0.2);
        this.camera.position.set(0, 1.6, 0.2);

        const ambLight = new THREE.AmbientLight(0x181c22, 0.45);
        this.group.add(ambLight);

        const floorMat = this.createSchoolTileMaterial();
        const wallMat = this.createSchoolWallMaterial();
        this.cobwebMat = this.createCobwebMaterial();

        // Detaillierte Akustik-Plattendecke im Schulflur
        const ceilCanvas = document.createElement('canvas');
        ceilCanvas.width = 512;
        ceilCanvas.height = 512;
        const cctx = ceilCanvas.getContext('2d');
        cctx.fillStyle = '#101214';
        cctx.fillRect(0, 0, 512, 512);
        cctx.strokeStyle = '#060708';
        cctx.lineWidth = 6;
        for (let i = 0; i <= 512; i += 64) {
            cctx.beginPath();
            cctx.moveTo(i, 0); cctx.lineTo(i, 512);
            cctx.moveTo(0, i); cctx.lineTo(512, i);
            cctx.stroke();
        }
        const ceilTex = new THREE.CanvasTexture(ceilCanvas);
        ceilTex.wrapS = THREE.RepeatWrapping;
        ceilTex.wrapT = THREE.RepeatWrapping;
        ceilTex.repeat.set(14, 18);
        const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9 });

        const schoolFloor = new THREE.Mesh(new THREE.PlaneGeometry(50, 72), floorMat);
        schoolFloor.rotation.x = -Math.PI / 2;
        schoolFloor.position.set(5, 0.01, -32);
        this.group.add(schoolFloor);

        const schoolCeil = new THREE.Mesh(new THREE.PlaneGeometry(50, 56), ceilMat);
        schoolCeil.rotation.x = Math.PI / 2;
        schoolCeil.position.set(5, 4.0, -28);
        this.group.add(schoolCeil);

        this.buildEntranceDoorWithFrame(wallMat);

        this.addSchoolWall(-2.7, 2.0, -13.5, 0.4, 4.0, 27.4, wallMat);
        this.addSchoolWall(2.7, 2.0, -10.7, 0.4, 4.0, 21.8, wallMat);

        this.addSchoolWall(5.3, 2.0, -26.7, 16.4, 4.0, 0.4, wallMat);
        this.addSchoolWall(10.6, 2.0, -21.3, 16.2, 4.0, 0.4, wallMat);

        this.addSchoolWall(13.3, 2.0, -41.15, 0.4, 4.0, 29.1, wallMat);
        this.addSchoolWall(18.7, 2.0, -38.35, 0.4, 4.0, 34.5, wallMat);

        // 3D-Deckenrohre, Spinnenweben & flackernde Horror-Neonröhren in den Schulfluren
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x2c221e, metalness: 0.75, roughness: 0.45 });
        const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 26, 12), pipeMat);
        pipe1.rotation.x = Math.PI / 2;
        pipe1.position.set(-1.9, 3.72, -13.0);
        const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 18, 12), pipeMat);
        pipe2.rotation.z = Math.PI / 2;
        pipe2.position.set(8.0, 3.72, -22.1);
        const pipe3 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 32, 12), pipeMat);
        pipe3.rotation.x = Math.PI / 2;
        pipe3.position.set(17.9, 3.72, -39.0);
        this.group.add(pipe1, pipe2, pipe3);

        const lightPoints = [
            [0, -4, false], [0, -14, true], [0, -24, false],
            [8, -24, true], [16, -24, false],
            [16, -34, true], [16, -44, false], [16, -53, true]
        ];
        for (const [lx, lz, isRed] of lightPoints) {
            const fixture = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.08, 1.4),
                new THREE.MeshStandardMaterial({ color: 0x222226, metalness: 0.7 })
            );
            fixture.position.set(lx, 3.94, lz);
            const tubeMat = new THREE.MeshBasicMaterial({ color: isRed ? 0xff3322 : 0x88bbdd });
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8), tubeMat);
            tube.rotation.x = Math.PI / 2;
            tube.position.set(0, -0.04, 0);
            fixture.add(tube);
            this.group.add(fixture);

            const pLight = new THREE.PointLight(isRed ? 0xff3322 : 0x88bbee, 1.45, 13);
            pLight.position.set(lx, 3.65, lz);
            this.group.add(pLight);

            this.flickeringLights.push({
                light: pLight,
                bulbMat: tubeMat,
                baseInt: 1.45,
                isRed,
                seed: Math.random() * 100
            });

            // Spinnenweben oben an den Gang-Deckenlampen
            const web = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.8), this.cobwebMat);
            web.position.set(lx, 3.45, lz + 0.6);
            web.rotation.y = 0.4;
            // cobweb removed
        }

        this.buildFloorArrows();
        this.buildSchoolLockers();
        this.buildFlashlightFleischis();
        this.buildSlidingDoorAndStairwell(wallMat);
    }

    buildFloorArrows() {
        const arrowTex = this.createArrowTexture();
        const arrowMat = new THREE.MeshBasicMaterial({
            map: arrowTex,
            transparent: true,
            depthWrite: false
        });

        const arrows = [
            { x: 0, z: -2.5, rot: 0 },
            { x: 0, z: -6.5, rot: 0 },
            { x: 0, z: -11.5, rot: 0 },
            { x: 0, z: -16.5, rot: 0 },
            { x: 0, z: -23.5, rot: -Math.PI / 2 },
            { x: 4.0, z: -24.0, rot: -Math.PI / 2 },
            { x: 9.0, z: -24.0, rot: -Math.PI / 2 },
            { x: 15.8, z: -24.0, rot: 0 },
            { x: 16.0, z: -29.0, rot: 0 },
            { x: 16.0, z: -35.0, rot: 0 },
            { x: 16.0, z: -41.5, rot: 0 },
            { x: 16.0, z: -48.0, rot: 0 },
            { x: 16.0, z: -53.5, rot: 0 },
            { x: 14.5, z: -59.0, rot: 0 }
        ];

        for (const a of arrows) {
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), arrowMat);
            plane.rotation.x = -Math.PI / 2;
            plane.rotation.z = a.rot;
            plane.position.set(a.x, 0.03, a.z);
            this.group.add(plane);
        }
    }

    buildSchoolLockers() {
        // Verwitterte, rostige Horror-Spind-Textur
        const lockerCanvas = document.createElement('canvas');
        lockerCanvas.width = 256;
        lockerCanvas.height = 512;
        const lctx = lockerCanvas.getContext('2d');
        lctx.fillStyle = '#1c2d38';
        lctx.fillRect(0, 0, 256, 512);
        lctx.strokeStyle = '#0d161c';
        lctx.lineWidth = 8;
        lctx.strokeRect(6, 6, 244, 500);
        for (let i = 0; i < 35; i++) {
            lctx.fillStyle = i % 2 === 0 ? 'rgba(65, 18, 8, 0.35)' : 'rgba(0,0,0,0.3)';
            lctx.fillRect(Math.random() * 240, Math.random() * 490, 18, 45);
        }
        const lockerTex = new THREE.CanvasTexture(lockerCanvas);

        const lockerBodyMat = new THREE.MeshStandardMaterial({ map: lockerTex, color: 0x1a2c38, metalness: 0.7, roughness: 0.45 });
        const lockerInsideMat = new THREE.MeshStandardMaterial({ color: 0x0a1014, metalness: 0.5, roughness: 0.65 });
        const lockerDoorMat = new THREE.MeshStandardMaterial({ map: lockerTex, color: 0x264254, metalness: 0.65, roughness: 0.4 });
        const handleMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.25 });

        const lockerPlacements = [
            { x: -2.1, z: -4.5, rotY: Math.PI / 2 },
            { x: 2.1, z: -8.5, rotY: -Math.PI / 2 },
            { x: -2.1, z: -13.0, rotY: Math.PI / 2 },
            { x: 2.1, z: -17.5, rotY: -Math.PI / 2 },
            { x: -2.1, z: -21.5, rotY: Math.PI / 2 },
            { x: 3.5, z: -26.1, rotY: 0 },
            { x: 7.5, z: -21.9, rotY: Math.PI },
            { x: 11.5, z: -26.1, rotY: 0 },
            { x: 13.9, z: -30.0, rotY: Math.PI / 2 },
            { x: 18.1, z: -35.0, rotY: -Math.PI / 2 },
            { x: 13.9, z: -41.0, rotY: Math.PI / 2 },
            { x: 18.1, z: -47.0, rotY: -Math.PI / 2 },
            { x: 13.9, z: -51.5, rotY: Math.PI / 2 }
        ];

        lockerPlacements.forEach((lp, idx) => {
            const lockerGroup = new THREE.Group();
            lockerGroup.position.set(lp.x, 0, lp.z);
            lockerGroup.rotation.y = lp.rotY;

            const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.90, 2.25, 0.05), lockerInsideMat);
            backWall.position.set(0, 1.125, -0.38);
            const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.25, 0.80), lockerBodyMat);
            leftSide.position.set(-0.43, 1.125, 0);
            const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.25, 0.80), lockerBodyMat);
            rightSide.position.set(0.43, 1.125, 0);
            const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.06, 0.80), lockerBodyMat);
            topPlate.position.set(0, 2.22, 0);
            const botPlate = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.08, 0.80), lockerBodyMat);
            botPlate.position.set(0, 0.04, 0);
            lockerGroup.add(backWall, leftSide, rightSide, topPlate, botPlate);

            const doorHinge = new THREE.Group();
            doorHinge.position.set(-0.42, 0, 0.39);

            const doorBottom = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.36, 0.04), lockerDoorMat);
            doorBottom.position.set(0.42, 0.72, 0);
            doorHinge.add(doorBottom);

            const doorTop = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.42, 0.04), lockerDoorMat);
            doorTop.position.set(0.42, 2.00, 0);
            doorHinge.add(doorTop);

            const doorFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 0.04), lockerDoorMat);
            doorFrameL.position.set(0.07, 1.59, 0);
            const doorFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 0.04), lockerDoorMat);
            doorFrameR.position.set(0.77, 1.59, 0);
            doorHinge.add(doorFrameL, doorFrameR);

            for (let s = 0; s < 3; s++) {
                const louver = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.032, 0.045), lockerDoorMat);
                louver.position.set(0.42, 1.46 + s * 0.12, 0);
                louver.rotation.x = 0.22;
                doorHinge.add(louver);
            }

            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06), handleMat);
            handle.position.set(0.76, 1.15, 0.03);
            doorHinge.add(handle);

            const hitPanel = new THREE.Mesh(
                new THREE.BoxGeometry(0.88, 2.2, 0.1),
                new THREE.MeshBasicMaterial({ visible: false })
            );
            hitPanel.position.set(0.42, 1.1, 0);
            doorHinge.add(hitPanel);

            lockerGroup.add(doorHinge);

            const badge = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.10, 0.04),
                new THREE.MeshBasicMaterial({ color: 0x00dd66 })
            );
            badge.position.set(0, 2.32, 0.38);
            lockerGroup.add(badge);

            const localForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), lp.rotY);
            const hideLocal = new THREE.Vector3(lp.x, 1.58, lp.z).addScaledVector(localForward, 0.05);
            const exitLocal = new THREE.Vector3(lp.x, 1.6, lp.z).addScaledVector(localForward, 1.15);

            const lockerData = {
                id: idx,
                group: lockerGroup,
                doorHinge: doorHinge,
                localPos: new THREE.Vector3(lp.x, 1.2, lp.z),
                worldPos: this.localToWorld(lp.x, 1.2, lp.z),
                hideWorldPos: this.localToWorld(hideLocal.x, hideLocal.y, hideLocal.z),
                exitWorldPos: this.localToWorld(exitLocal.x, exitLocal.y, exitLocal.z),
                lookRotY: lp.rotY + Math.PI
            };

            leftSide.userData.lockerData = lockerData;
            rightSide.userData.lockerData = lockerData;
            doorBottom.userData.lockerData = lockerData;
            doorTop.userData.lockerData = lockerData;
            hitPanel.userData.lockerData = lockerData;

            this.group.add(lockerGroup);
            this.lockers.push(lockerData);
            this.lockerMeshes.push(leftSide, rightSide, doorBottom, doorTop, hitPanel);
        });
    }

    buildFlashlightFleischis() {
        const patrolRoutes = [
            {
                corridorId: 1,
                waypoints: [new THREE.Vector3(0, 0, -23.5), new THREE.Vector3(0, 0, -6.5)],
                speed: 2.15
            },
            {
                corridorId: 2,
                waypoints: [new THREE.Vector3(15.5, 0, -24.0), new THREE.Vector3(2.0, 0, -24.0)],
                speed: 2.25
            },
            {
                corridorId: 3,
                waypoints: [new THREE.Vector3(16.0, 0, -52.5), new THREE.Vector3(16.0, 0, -28.5)],
                speed: 2.35
            }
        ];

        const coneGeo = new THREE.ConeGeometry(1.75, 7.5, 20, 1, true);
        coneGeo.translate(0, -3.75, 0);
        coneGeo.rotateX(-Math.PI / 2);
        const coneMat = new THREE.MeshBasicMaterial({
            color: 0xffeeaa,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        patrolRoutes.forEach((route) => {
            const entity = new FleischiMonster();
            const mGroup = entity.group;
            mGroup.position.copy(route.waypoints[0]);

            const torchBody = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.035, 0.28, 12),
                new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
            );
            torchBody.rotation.x = Math.PI / 2;
            torchBody.position.set(0.28, 1.55, 0.35);
            mGroup.add(torchBody);

            const beamCone = new THREE.Mesh(coneGeo, coneMat);
            beamCone.position.set(0.28, 1.55, 0.45);
            mGroup.add(beamCone);

            const spotLight = new THREE.SpotLight(0xfff0aa, 4.5, 11.0, Math.PI / 6, 0.4, 1.0);
            spotLight.position.set(0.28, 1.55, 0.45);
            const targetObj = new THREE.Object3D();
            targetObj.position.set(0.28, 1.2, 7.5);
            mGroup.add(targetObj);
            spotLight.target = targetObj;
            mGroup.add(spotLight);

            this.group.add(mGroup);
            this.patrolGuards.push({
                corridorId: route.corridorId,
                entity,
                group: mGroup,
                waypoints: route.waypoints,
                currentWp: 1,
                baseSpeed: route.speed,
                chaseSpeed: 4.8,
                pauseTimer: 0,
                isAlerted: false
            });
        });
    }

    isPlayerInSameCorridor(guardCorridorId, localPos) {
        if (guardCorridorId === 1) {
            return localPos.x >= -2.8 && localPos.x <= 2.8 && localPos.z <= 1.0 && localPos.z >= -26.5;
        } else if (guardCorridorId === 2) {
            return localPos.z >= -26.8 && localPos.z <= -21.2 && localPos.x >= -2.5 && localPos.x <= 18.6;
        } else if (guardCorridorId === 3) {
            return localPos.x >= 13.2 && localPos.x <= 18.8 && localPos.z <= -21.5 && localPos.z >= -56.5;
        }
        return false;
    }

    createTextBannerTexture(title, subtitle, color = '#ff3333') {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 192;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#0c0303';
        ctx.fillRect(0, 0, 640, 192);
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, 628, 180);

        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(title, 320, 62);

        ctx.fillStyle = color;
        ctx.font = 'bold 38px monospace';
        ctx.fillText(subtitle, 320, 134);

        return new THREE.CanvasTexture(canvas);
    }

    buildSlidingDoorAndStairwell(wallMat) {
        // Hochdetaillierte rissige Bunker-Betontextur für das Treppenhaus der 2er-Potenzen!
        const shaftMat = this.createStairwellConcreteMaterial();
        this.stairStepMat = shaftMat;

        this.addSchoolWall(13.15, 2.0, -56.0, 3.1, 4.0, 0.45, shaftMat);
        this.addSchoolWall(18.85, 2.0, -56.0, 3.1, 4.0, 0.45, shaftMat);

        const steelMat = new THREE.MeshStandardMaterial({ color: 0x383230, metalness: 0.85, roughness: 0.38 });
        this.slidingDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.8, 0.18), steelMat);
        this.slidingDoorMesh.position.set(13.6, 1.9, -56.0);
        this.group.add(this.slidingDoorMesh);

        this.addSchoolWall(11.8, 9.3, -65.0, 0.4, 18.6, 18.6, shaftMat);
        this.addSchoolWall(20.2, 9.3, -65.0, 0.4, 18.6, 18.6, shaftMat);
        this.addSchoolWall(16.0, 9.3, -74.2, 8.8, 18.6, 0.4, shaftMat);

        const southShaftWall = this.addSchoolWall(16.0, 11.3, -56.0, 8.8, 14.6, 0.4, shaftMat);
        this.southShaftWallObs = southShaftWall.obs;

        this.addSchoolWall(16.0, 9.3, -64.9, 0.38, 18.6, 8.2, shaftMat);

        const shaftRoof = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.4, 19.0), shaftMat);
        shaftRoof.position.set(16.0, 18.6, -65.0);
        this.group.add(shaftRoof);

        this.addSchoolWall(18.1, 16.8, -69.0, 4.0, 3.6, 0.36, shaftMat);
        this.addSchoolWall(16.0, 16.8, -70.2, 0.36, 3.6, 2.4, shaftMat);

        this.addSchoolWall(18.0, 1.8, -60.95, 4.3, 3.6, 0.38, shaftMat);

        const bannerTex = this.createTextBannerTexture(
            'FOLGE: 2¹=2, 2²=4, 2³=8, 2⁴=16 ... (BIS 512)',
            'GESUCHTER AUSGANG: TÜR 2⁸'
        );

        const signFrame = new THREE.Mesh(
            new THREE.BoxGeometry(3.46, 1.18, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.8, roughness: 0.3 })
        );
        signFrame.position.set(18.0, 2.05, -60.75);
        this.group.add(signFrame);

        const entryBanner = new THREE.Mesh(
            new THREE.PlaneGeometry(3.36, 1.08),
            new THREE.MeshBasicMaterial({ map: bannerTex })
        );
        entryBanner.position.set(18.0, 2.05, -60.71);
        this.group.add(entryBanner);

        const topEndBanner = new THREE.Mesh(
            new THREE.PlaneGeometry(3.2, 0.95),
            new THREE.MeshBasicMaterial({
                map: this.createTextBannerTexture('OBERSTES STOCKWERK (ENDE):', '2⁹ = 512 (ZU HOCH! GESUCHT: 2⁸)')
            })
        );
        topEndBanner.position.set(12.05, 16.8, -71.5);
        topEndBanner.rotation.y = Math.PI / 2;
        this.group.add(topEndBanner);

        this.addLocalRamp(11.8, 20.2, -61.2, -55.8, 0.0, 0.0, 'z');

        this.buildStairFlight(13.9, -61.0, -69.0, 0.0, 3.0, 15);
        this.addLocalRamp(11.8, 16.0, -69.2, -60.8, 3.0, 0.0, 'z');
        this.buildLandingPlatform(16.0, 3.0, -71.5, 8.0, 5.0);
        this.addLocalRamp(11.8, 20.2, -74.2, -68.8, 3.0, 3.0, 'z');

        this.buildStairFlight(18.1, -69.0, -61.0, 3.0, 6.0, 15);
        this.addLocalRamp(16.0, 20.2, -69.2, -60.8, 3.0, 6.0, 'z');
        this.buildLandingPlatform(16.0, 6.0, -58.6, 8.0, 4.8);
        this.addLocalRamp(11.8, 20.2, -61.2, -56.0, 6.0, 6.0, 'z');

        this.buildStairFlight(13.9, -61.0, -69.0, 6.0, 9.0, 15);
        this.addLocalRamp(11.8, 16.0, -69.2, -60.8, 9.0, 6.0, 'z');
        this.buildLandingPlatform(16.0, 9.0, -71.5, 8.0, 5.0);
        this.addLocalRamp(11.8, 20.2, -74.2, -68.8, 9.0, 9.0, 'z');

        this.buildStairFlight(18.1, -69.0, -61.0, 9.0, 12.0, 15);
        this.addLocalRamp(16.0, 20.2, -69.2, -60.8, 9.0, 12.0, 'z');
        this.buildLandingPlatform(16.0, 12.0, -58.6, 8.0, 4.8);
        this.addLocalRamp(11.8, 20.2, -61.2, -56.0, 12.0, 12.0, 'z');

        this.buildStairFlight(13.9, -61.0, -69.0, 12.0, 15.0, 15);
        this.addLocalRamp(11.8, 16.0, -69.2, -60.8, 15.0, 12.0, 'z');
        this.buildLandingPlatform(13.9, 15.0, -71.5, 4.2, 5.0);
        this.addLocalRamp(11.8, 16.0, -74.2, -68.8, 15.0, 15.0, 'z');

        // 3D-Notstrom-Käfiglampen, vertikale Steigleitungen & Spinnenweben auf jeder Etage des Treppenhauses!
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x331810, metalness: 0.78, roughness: 0.45 });
        const riserPipeL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 18.4, 12), pipeMat);
        riserPipeL.position.set(12.2, 9.2, -73.6);
        const riserPipeR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 18.4, 12), pipeMat);
        riserPipeR.position.set(19.8, 9.2, -56.5);
        this.group.add(riserPipeL, riserPipeR);

        for (let y = 2.5; y <= 17.5; y += 3.0) {
            const cageMat = new THREE.MeshBasicMaterial({ color: 0xff3311 });
            const cageBulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), cageMat);
            cageBulb.position.set(16.0, y, -65.0);
            this.group.add(cageBulb);

            const sLight = new THREE.PointLight(0xff3311, 2.3, 17);
            sLight.position.set(15.6, y, -65.0);
            this.group.add(sLight);

            this.flickeringLights.push({
                light: sLight,
                bulbMat: cageMat,
                baseInt: 2.3,
                isRed: true,
                seed: y * 13.7
            });

            // Große Spinnenweben in den Ecken jedes Treppenabsatzes
            const cornerWeb = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.4), this.cobwebMat);
            cornerWeb.position.set(12.3, y + 0.4, -73.2);
            cornerWeb.rotation.y = Math.PI / 4;
            // cobweb removed
        }

        this.createNumberedStairDoor(14.0, 3.0, -73.85, 0, '4', false);
        this.createNumberedStairDoor(18.0, 3.0, -73.85, 0, '8', false);

        this.createNumberedStairDoor(18.0, 6.0, -56.35, Math.PI, '16', false);
        this.createNumberedStairDoor(14.0, 6.0, -56.35, Math.PI, '32', false);

        this.createNumberedStairDoor(14.0, 9.0, -73.85, 0, '64', false);
        this.createNumberedStairDoor(18.0, 9.0, -73.85, 0, '128', false);

        this.createNumberedStairDoor(18.0, 12.0, -56.35, Math.PI, '196', false);
        this.createNumberedStairDoor(14.0, 12.0, -56.35, Math.PI, '256', true);

        this.createNumberedStairDoor(13.9, 15.0, -73.85, 0, '512', false);

        this.stairChaser = new FleischiMonster();
        this.stairChaser.group.position.copy(this.stairWaypoints[0]);
        this.stairChaser.group.visible = false;
        this.group.add(this.stairChaser.group);
    }

    // Detaillierte Treppenstufen mit rostiger Metall-Trittkante & 3D-Treppengeländer (Handlauf + Pfosten)!
    buildStairFlight(centerX, startZ, endZ, startY, endY, steps = 15) {
        const dz = (endZ - startZ) / steps;
        const dy = (endY - startY) / steps;
        const railMat = new THREE.MeshStandardMaterial({ color: 0x2b1812, metalness: 0.85, roughness: 0.38 });
        const nosingMat = new THREE.MeshStandardMaterial({ color: 0x553318, metalness: 0.7, roughness: 0.4 });

        for (let i = 0; i < steps; i++) {
            const sx = centerX;
            const sy = startY + (i + 0.5) * dy;
            const sz = startZ + (i + 0.5) * dz;

            const step = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, Math.abs(dz) + 0.08), this.stairStepMat);
            step.position.set(sx, sy, sz);
            this.group.add(step);

            // Rostige Stahl-Trittkante vorne an jeder Stufe
            const nosing = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.04, 0.05), nosingMat);
            nosing.position.set(sx, sy + 0.11, sz - Math.sign(dz) * (Math.abs(dz) * 0.48));
            this.group.add(nosing);

            // Vertikale Geländer-Stäbe an jeder 3. Stufe
            if (i % 3 === 0 || i === steps - 1) {
                for (const side of [-1.72, 1.72]) {
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8), railMat);
                    post.position.set(sx + side, sy + 0.55, sz);
                    this.group.add(post);
                }
            }
        }

        // Durchgehender schräger Handlauf links & rechts an jedem Treppenlauf
        const railCurveL = new THREE.CatmullRomCurve3([
            new THREE.Vector3(centerX - 1.72, startY + 1.0, startZ),
            new THREE.Vector3(centerX - 1.72, endY + 1.0, endZ)
        ]);
        const railCurveR = new THREE.CatmullRomCurve3([
            new THREE.Vector3(centerX + 1.72, startY + 1.0, startZ),
            new THREE.Vector3(centerX + 1.72, endY + 1.0, endZ)
        ]);
        const handrailL = new THREE.Mesh(new THREE.TubeGeometry(railCurveL, 8, 0.032, 8, false), railMat);
        const handrailR = new THREE.Mesh(new THREE.TubeGeometry(railCurveR, 8, 0.032, 8, false), railMat);
        this.group.add(handrailL, handrailR);
    }

    buildLandingPlatform(x, y, z, w, d) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), this.stairStepMat);
        mesh.position.set(x, y - 0.15, z);
        this.group.add(mesh);
    }

    createNumberedStairDoor(x, y, z, rotY, labelText, isCorrect) {
        const doorGroup = new THREE.Group();
        doorGroup.position.set(x, y, z);
        doorGroup.rotation.y = rotY;

        const alcove = new THREE.Mesh(
            new THREE.PlaneGeometry(1.3, 2.35),
            new THREE.MeshBasicMaterial({ color: 0x050000 })
        );
        alcove.position.set(0, 1.18, -0.02);
        doorGroup.add(alcove);

        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a0805, roughness: 0.5 });
        const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.45, 0.22), frameMat);
        frameL.position.set(-0.70, 1.22, 0);
        const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.45, 0.22), frameMat);
        frameR.position.set(0.70, 1.22, 0);
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.16, 0.22), frameMat);
        frameTop.position.set(0, 2.40, 0);
        doorGroup.add(frameL, frameR, frameTop);

        const hingeGroup = new THREE.Group();
        hingeGroup.position.set(-0.65, 0, 0.06);

        // Schweres rostiges Bunker-Türblatt mit Nieten & Sichtschlitz
        const doorCanvas = document.createElement('canvas');
        doorCanvas.width = 256;
        doorCanvas.height = 512;
        const dctx = doorCanvas.getContext('2d');
        dctx.fillStyle = '#3d120c';
        dctx.fillRect(0, 0, 256, 512);
        dctx.strokeStyle = '#180503';
        dctx.lineWidth = 14;
        dctx.strokeRect(7, 7, 242, 498);
        dctx.strokeStyle = '#5c2016';
        dctx.lineWidth = 4;
        dctx.strokeRect(24, 24, 208, 464);
        for (let i = 0; i < 40; i++) {
            dctx.fillStyle = 'rgba(0,0,0,0.3)';
            dctx.fillRect(Math.random() * 230, Math.random() * 480, 14, 55);
        }
        const doorTex = new THREE.CanvasTexture(doorCanvas);

        const doorMat = new THREE.MeshStandardMaterial({
            map: doorTex,
            bumpMap: doorTex,
            bumpScale: 0.025,
            roughness: 0.52,
            metalness: 0.45
        });
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.10), doorMat);
        panel.position.set(0.65, 1.15, 0);
        hingeGroup.add(panel);

        const handleMat = new THREE.MeshStandardMaterial({ color: 0xffdd44, metalness: 0.9, roughness: 0.2 });
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), handleMat);
        handle.position.set(1.12, 1.10, 0.08);
        hingeGroup.add(handle);

        const labelTex = this.createTextBannerTexture('ETAGEN-TÜR', `NR. ${labelText}`, '#ffdd44');
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(0.95, 0.42),
            new THREE.MeshBasicMaterial({ map: labelTex })
        );
        sign.position.set(0.65, 1.65, 0.06);
        hingeGroup.add(sign);

        doorGroup.add(hingeGroup);

        const doorData = {
            group: doorGroup,
            hingeGroup: hingeGroup,
            alcove: alcove,
            opened: false,
            doorPos: new THREE.Vector3(x, y, z),
            localPos: new THREE.Vector3(x, y + 1.15, z),
            label: labelText,
            isCorrect
        };
        panel.userData.stairDoor = doorData;
        sign.userData.stairDoor = doorData;
        handle.userData.stairDoor = doorData;

        this.group.add(doorGroup);
        this.stairDoors.push(doorData);
        this.stairDoorMeshes.push(panel, sign, handle);
    }

    triggerSlidingDoorSlam() {
        if (this.slidingDoorClosed) return;
        this.slidingDoorClosed = true;
        this.audio.playDoorSlam();
        this.audio.playMetalBang();

        this.slidingDoorObstacle = this.physics.addObstacle(
            11.8, 20.2,
            -56.3, -55.7,
            -1, 6
        );

        let slideX = 13.6;
        const animateDoor = () => {
            if (slideX < 16.0) {
                slideX += 0.18;
                this.slidingDoorMesh.position.x = Math.min(16.0, slideX);
                requestAnimationFrame(animateDoor);
            }
        };
        animateDoor();

        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = "SCHIEBETÜR VERRIEGELT! FINDE DIE TÜR FÜR 2⁸!";
            hud.style.color = '#ffaa00';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 3500);
        }
    }

    spawnStairChaserAtBottom() {
        if (this.stairChaserSpawned) return;
        this.stairChaserSpawned = true;
        this.stairChaserActive = true;
        this.stairChaserWpIndex = 1;
        this.stairChaser.group.position.copy(this.stairWaypoints[0]);
        this.stairChaser.group.visible = true;
        this.audio.playJumpscareSound();

        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = "FLEISCHI KOMMT DIE TREPPE HOCH! FINDE TÜR 2⁸!";
            hud.style.color = '#ff2222';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 3000);
        }
    }

    getHoveredInteraction(raycaster) {
        if (this.isEnteringWalk || this.lockerAnimState === 'entering' || this.lockerAnimState === 'exiting') {
            return null;
        }
        if (this.activeLocker) {
            return { type: 'locker_exit', prompt: '[E] Verlassen' };
        }

        const lockerHits = raycaster.intersectObjects(this.lockerMeshes, false);
        if (lockerHits.length > 0 && lockerHits[0].distance < 3.4) {
            const lData = lockerHits[0].object.userData.lockerData;
            if (lData) {
                return { type: 'locker_enter', data: lData, prompt: '[E] Im Spind verstecken' };
            }
        }

        const stairDoorHits = raycaster.intersectObjects(this.stairDoorMeshes, false);
        if (stairDoorHits.length > 0 && stairDoorHits[0].distance < 3.4) {
            const sDoor = stairDoorHits[0].object.userData.stairDoor;
            if (sDoor && !sDoor.opened) {
                return { type: 'stair_door', data: sDoor, prompt: `[E] Tür Nr. ${sDoor.label} öffnen` };
            }
        }

        return null;
    }

    tryInteract(raycaster) {
        const hit = this.getHoveredInteraction(raycaster);
        if (!hit) return false;

        if (hit.type === 'locker_enter') {
            this.enterLocker(hit.data);
            return true;
        } else if (hit.type === 'locker_exit') {
            this.exitLocker();
            return true;
        } else if (hit.type === 'stair_door') {
            this.interactStairDoor(hit.data);
            return true;
        }
        return false;
    }

    enterLocker(lockerData) {
        if (this.lockerAnimState !== 'none') return;
        this.audio.playDrawerSlide();
        this.activeLocker = lockerData;
        this.player.isHiddenInLocker = true;
        this.player.resetKeys();

        this.lockerStartCamPos.copy(this.camera.position);
        this.lockerStartQuat.copy(this.camera.quaternion);
        this.lockerPeekYawOffset = 0;
        this.lockerPeekPitchOffset = 0;
        this.lockerAnimProgress = 0;
        this.lockerAnimState = 'entering';

        for (const g of this.patrolGuards) {
            g.isAlerted = false;
            g.pauseTimer = 0;
        }
    }

    exitLocker() {
        if (!this.activeLocker || this.lockerAnimState !== 'inside') return;
        this.audio.playDrawerSlide();
        const lockerOverlay = document.getElementById('locker-overlay');
        if (lockerOverlay) lockerOverlay.style.display = 'none';

        this.lockerAnimProgress = 0;
        this.lockerAnimState = 'exiting';
        const _lCfg = (window.DifficultyManager && window.DifficultyManager.getConfig) ? window.DifficultyManager.getConfig() : { lockerGraceMult: 1 };
        this.lockerGraceTimer = 2.5 * _lCfg.lockerGraceMult;
    }

    interactStairDoor(doorData) {
        if (doorData.opened) return;

        if (doorData.isCorrect) {
            doorData.opened = true;
            this.stairChaserActive = false;
            if (this.stairChaser) this.stairChaser.group.visible = false;

            this.audio.playDrawerSlide();
            this.audio.playMidnightGong();

            if (this.southShaftWallObs) {
                this.physics.removeObstacle(this.southShaftWallObs);
                this.southShaftWallObs = null;
            }

            if (doorData.alcove) doorData.alcove.visible = false;

            const portalMat = new THREE.MeshBasicMaterial({
                color: 0x00ff66,
                side: THREE.DoubleSide
            });
            const portalMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 2.38), portalMat);
            portalMesh.position.set(0, 1.18, 0.0);
            doorData.group.add(portalMesh);

            const portalLight = new THREE.PointLight(0x00ff66, 6.0, 12.0);
            portalLight.position.set(0, 1.6, 0.6);
            doorData.group.add(portalLight);

            let angle = 0;
            const target = Math.PI * 0.62;
            const swingDoor = () => {
                if (angle < target) {
                    angle += 0.07;
                    doorData.hingeGroup.rotation.y = -angle;
                    requestAnimationFrame(swingDoor);
                }
            };
            swingDoor();

            this.exitPortalPos = doorData.doorPos.clone();
        } else {
            this.audio.playJumpscareSound();
            if (this.onCaughtCallback) {
                this.onCaughtCallback(this.stairChaser, this.stairChaser.group);
            }
        }
    }

    resetOnCatch() {
        const lockerOverlay = document.getElementById('locker-overlay');
        if (lockerOverlay) lockerOverlay.style.display = 'none';

        if (this.activeLocker) {
            this.activeLocker.doorHinge.rotation.y = 0;
            this.player.isHiddenInLocker = false;
            this.activeLocker = null;
        }
        this.lockerAnimState = 'none';
        this.lockerGraceTimer = 2.0;

        for (const g of this.patrolGuards) {
            g.isAlerted = false;
            g.pauseTimer = 0;
            g.group.position.copy(g.waypoints[0]);
            g.currentWp = 1;
        }

        if (this.slidingDoorClosed) {
            this.player.groundY = 0;
            this.player.position.set(14.0, 1.6, -58.5);
            this.camera.position.set(14.0, 1.6, -58.5);

            this.stairChaserActive = false;
            this.stairChaserSpawned = false;
            this.stairChaserWpIndex = 1;
            this.stairChaser.group.position.copy(this.stairWaypoints[0]);
            this.stairChaser.group.visible = false;
        } else {
            this.player.groundY = 0;
            this.player.position.set(0, 1.6, -2.0);
            this.camera.position.set(0, 1.6, -2.0);
        }
    }

    updateLockerAnimation(delta) {
        if (!this.activeLocker) return;
        const lData = this.activeLocker;
        const lockerOverlay = document.getElementById('locker-overlay');

        if (this.lockerAnimState === 'entering') {
            this.lockerAnimProgress += delta * 2.4;
            const p = Math.min(1.0, this.lockerAnimProgress);

            if (p < 0.55) {
                const openT = p / 0.55;
                lData.doorHinge.rotation.y = -Math.sin(openT * Math.PI * 0.5) * 1.85;
            } else {
                const closeT = (p - 0.55) / 0.45;
                lData.doorHinge.rotation.y = -(1.0 - closeT) * 1.85;
            }

            const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, lData.lookRotY, 0, 'YXZ'));
            this.camera.position.lerpVectors(this.lockerStartCamPos, lData.hideWorldPos, p);
            this.camera.quaternion.slerpQuaternions(this.lockerStartQuat, targetQuat, p);

            if (p >= 1.0) {
                lData.doorHinge.rotation.y = 0;
                this.audio.playDoorSlam();
                this.lockerAnimState = 'inside';
                if (lockerOverlay) lockerOverlay.style.display = 'block';
            }
        } else if (this.lockerAnimState === 'inside') {
            this.lockerBreathTimer += delta * 2.6;
            const breathY = Math.sin(this.lockerBreathTimer) * 0.008;
            this.camera.position.set(
                lData.hideWorldPos.x,
                lData.hideWorldPos.y + breathY,
                lData.hideWorldPos.z
            );

            const peekEuler = new THREE.Euler(
                this.lockerPeekPitchOffset,
                lData.lookRotY + this.lockerPeekYawOffset,
                0,
                'YXZ'
            );
            this.camera.quaternion.setFromEuler(peekEuler);
        } else if (this.lockerAnimState === 'exiting') {
            this.lockerAnimProgress += delta * 2.6;
            const p = Math.min(1.0, this.lockerAnimProgress);

            if (p < 0.6) {
                lData.doorHinge.rotation.y = -(p / 0.6) * 1.75;
            } else {
                lData.doorHinge.rotation.y = -(1.0 - (p - 0.6) / 0.4) * 1.75;
            }

            this.camera.position.lerpVectors(lData.hideWorldPos, lData.exitWorldPos, p);
            const uprightEuler = new THREE.Euler(0, lData.lookRotY, 0, 'YXZ');
            this.camera.quaternion.setFromEuler(uprightEuler);

            if (p >= 1.0) {
                lData.doorHinge.rotation.y = 0;
                this.player.position.copy(lData.exitWorldPos);
                this.camera.position.copy(lData.exitWorldPos);
                this.camera.rotation.order = 'YXZ';
                this.camera.rotation.set(0, lData.lookRotY, 0);
                this.camera.quaternion.setFromEuler(this.camera.rotation);
                this.player.isHiddenInLocker = false;
                this.activeLocker = null;
                this.lockerAnimState = 'none';
            }
        }
    }

    update(delta) {
        this.time += delta;
        if (this.lockerGraceTimer > 0) {
            this.lockerGraceTimer -= delta;
        }

        // Flackernde Horror-Neonröhren & rote Treppenhaus-Käfiglampen
        for (const fl of this.flickeringLights) {
            const f = Math.sin(this.time * 15.0 + fl.seed) * Math.cos(this.time * 27.0 + fl.seed);
            if (f < -0.68) {
                fl.light.intensity = fl.baseInt * 0.2;
                fl.bulbMat.color.setHex(0x220808);
            } else {
                fl.light.intensity = fl.baseInt * (0.92 + f * 0.15);
                fl.bulbMat.color.setHex(fl.isRed ? 0xff3311 : 0x88bbdd);
            }
        }

        if (this.isEnteringWalk) {
            this.enterWalkProgress += delta * 1.45;
            const p = Math.min(1.0, this.enterWalkProgress);

            const walkZ = 0.2 - p * 2.3;
            const bobY = Math.sin(p * Math.PI * 4.0) * 0.045;
            this.player.position.set(0, 1.6, walkZ);
            this.camera.position.set(0, 1.6 + bobY, walkZ);

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
            } else {
                this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;
            }
        }

        if (this.activeLocker) {
            this.updateLockerAnimation(delta);
        }

        const localPlayerPos = this.player.position;

        if (this.exitPortalPos) {
            const distToPortal = Math.hypot(
                localPlayerPos.x - this.exitPortalPos.x,
                localPlayerPos.z - this.exitPortalPos.z
            );
            const vertDiff = Math.abs(this.player.groundY - this.exitPortalPos.y);
            if (distToPortal < 1.15 && vertDiff < 1.8) {
                this.exitPortalPos = null;
                this.onExitSchoolStairwell();
                return;
            }
        }

        if (!this.slidingDoorClosed && localPlayerPos.x > 13.0 && localPlayerPos.z < -57.2) {
            this.triggerSlidingDoorSlam();
        }

        if (this.slidingDoorClosed && !this.stairChaserSpawned && this.player.groundY >= 2.6 && localPlayerPos.z <= -68.5) {
            this.spawnStairChaserAtBottom();
        }

        if (this.hasWalkedInside && (!this.slidingDoorClosed || this.player.position.z > -56.2)) {
            for (const g of this.patrolGuards) {
                const mPos = g.group.position;
                const horizDist = Math.hypot(localPlayerPos.x - mPos.x, localPlayerPos.z - mPos.z);
                const sameCorridor = this.isPlayerInSameCorridor(g.corridorId, localPlayerPos);

                if (!this.player.isHiddenInLocker && this.lockerGraceTimer <= 0 && sameCorridor) {
                    const toPlayer = new THREE.Vector3(localPlayerPos.x - mPos.x, 0, localPlayerPos.z - mPos.z);
                    const dist = toPlayer.length();
                    const wpTarget = g.waypoints[g.currentWp];
                    const guardDir = new THREE.Vector3().subVectors(wpTarget, mPos).normalize();

                    const _dCfg = (window.DifficultyManager && window.DifficultyManager.getConfig) ? window.DifficultyManager.getConfig() : { detectDistMult: 1, coneAngleMult: 1, proximityMult: 1, pauseTimeMult: 1, killDistMult: 1 };
                    if (dist < 8.5 * _dCfg.detectDistMult && guardDir.angleTo(toPlayer.clone().normalize()) < (Math.PI / 5.5) * _dCfg.coneAngleMult) {
                        if (!g.isAlerted) {
                            g.isAlerted = true;
                            this.audio.playJumpscareSound();
                        }
                    } else if (dist < 1.8 * _dCfg.proximityMult) {
                        g.isAlerted = true;
                    }
                } else if (!sameCorridor) {
                    g.isAlerted = false;
                }

                if (g.isAlerted && !this.player.isHiddenInLocker) {
                    g.entity.animate(delta, true, true);
                    const chaseDir = new THREE.Vector3(localPlayerPos.x - mPos.x, 0, localPlayerPos.z - mPos.z).normalize();
                    mPos.addScaledVector(chaseDir, g.chaseSpeed * delta);
                    g.group.lookAt(this.player.position.x, 0, this.player.position.z);

                    if (horizDist <= 1.35) {
                        g.isAlerted = false;
                        this.audio.playJumpscareSound();
                        if (this.onCaughtCallback) {
                            this.onCaughtCallback(g.entity, g.group);
                        }
                        return;
                    }
                } else {
                    if (g.pauseTimer > 0) {
                        g.pauseTimer -= delta;
                        g.entity.animate(delta, false, false);
                    } else {
                        g.entity.animate(delta, false, true);
                        const targetWp = g.waypoints[g.currentWp];
                        const dir = new THREE.Vector3().subVectors(targetWp, mPos);
                        dir.y = 0;
                        if (dir.length() < 0.35) {
                            g.currentWp = (g.currentWp + 1) % g.waypoints.length;
                            const _pCfg = (window.DifficultyManager && window.DifficultyManager.getConfig) ? window.DifficultyManager.getConfig() : { pauseTimeMult: 1 };
                            g.pauseTimer = 1.8 * _pCfg.pauseTimeMult;
                        } else {
                            dir.normalize();
                            mPos.addScaledVector(dir, g.baseSpeed * delta);
                            g.group.lookAt(targetWp.x, 0, targetWp.z);
                        }
                    }
                }
            }
        }

        if (this.stairChaserActive && this.stairChaser && this.stairChaser.group.visible) {
            const cPos = this.stairChaser.group.position;
            this.stairChaser.animate(delta, true, true);

            const horizDist = Math.hypot(localPlayerPos.x - cPos.x, localPlayerPos.z - cPos.z);
            const vertDiff = Math.abs(this.player.groundY - cPos.y);

            let targetLocalPos;
            if (vertDiff < 0.45 && horizDist < 3.6) {
                targetLocalPos = new THREE.Vector3(localPlayerPos.x, this.player.groundY, localPlayerPos.z);
            } else if (this.stairChaserWpIndex < this.stairWaypoints.length) {
                targetLocalPos = this.stairWaypoints[this.stairChaserWpIndex];
                if (cPos.distanceTo(targetLocalPos) < 0.35) {
                    this.stairChaserWpIndex++;
                    if (this.stairChaserWpIndex < this.stairWaypoints.length) {
                        targetLocalPos = this.stairWaypoints[this.stairChaserWpIndex];
                    }
                }
            } else {
                targetLocalPos = new THREE.Vector3(localPlayerPos.x, this.player.groundY, localPlayerPos.z);
            }

            const moveVec = new THREE.Vector3().subVectors(targetLocalPos, cPos);
            if (moveVec.lengthSq() > 0.0001) {
                moveVec.normalize();
                cPos.addScaledVector(moveVec, 4.6 * delta);
                this.stairChaser.group.lookAt(targetLocalPos.x, cPos.y, targetLocalPos.z);
            }

            const newHorizDist = Math.hypot(localPlayerPos.x - cPos.x, localPlayerPos.z - cPos.z);
            const newVertDiff = Math.abs(this.player.groundY - cPos.y);

            if (newHorizDist <= 1.25 && newVertDiff <= 0.95) {
                this.stairChaserActive = false;
                this.audio.playJumpscareSound();
                if (this.onCaughtCallback) {
                    this.onCaughtCallback(this.stairChaser, this.stairChaser.group);
                }
            }
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof SchoolLevelManager !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'school_hallway', cls: SchoolLevelManager });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('school_hallway', SchoolLevelManager);
  }
}


// [MILAN_MODE_HOOK]

(() => {
    const cls = (typeof SchoolLevelManager !== 'undefined') ? SchoolLevelManager : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('SchoolLevel', this);
            if (milanMode.isMilan && (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick'))) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.4;
                }
            }
            return orig.apply(this, args);
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
