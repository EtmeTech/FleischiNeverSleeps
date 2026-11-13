import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { ProceduralTextures } from './ProceduralTextures.js';
import { FleischiMonster } from './FleischiMonster.js';

export class HallwayManager {
    constructor(scene, camera, playerController, audio, physics, onElevatorLanded, onCaughtInHallway) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('gang', this), 200); }
        this.scene = scene;
        this.camera = camera;
        this.player = playerController;
        this.audio = audio;
        this.physics = physics;
        this.onElevatorLanded = onElevatorLanded;
        this.onCaughtInHallway = onCaughtInHallway;

        this.hallwayGroup = new THREE.Group();
        this.scene.add(this.hallwayGroup);

        // Korridor separat von der Fahrstuhlkabine, damit die Kabine beim Absturz in die Fleischrooms bleibt!
        this.corridorGroup = new THREE.Group();
        this.hallwayGroup.add(this.corridorGroup);

        this.halfwayZ = -22.0;
        this.hasTriggeredSpook = false;
        this.isMonsterActive = false;
        this.monsterSpeed = 6.2;

        this.elevatorEntered = false;
        this.doorsFullyClosed = false;
        this.elevatorSolved = false;
        this.isFalling = false;
        this.fallTimer = 0;
        this.bangTimer = 0;
        this.isDisabled = false;
        this.doorObstacle = null;

        this.fluorescentLights = [];
        this.elevatorButtons = [];

        this.buildCorridor();
        this.applyDetailedHallwayHorrorLook();
        this.buildElevatorCabin();
        this.buildMonster();
    }

    applyDetailedHallwayHorrorLook() {
        const floorMat = ProceduralTextures.createHallwayFloor(1, 16);
        const wallMat = ProceduralTextures.createHallwayWall(16, 1);
        const ceilMat = ProceduralTextures.createCeiling(2, 22);
        const beamMat = ProceduralTextures.createFurnitureWood('#1a0c05', '#0a0401');

        this.hallwayGroup.traverse((child) => {
            if (child.isMesh && child.geometry && child.geometry.type === 'PlaneGeometry') {
                if (Math.abs(child.rotation.x + Math.PI / 2) < 0.1 && child.position.y < 0.2) {
                    child.material = floorMat;
                } else if (Math.abs(child.rotation.x - Math.PI / 2) < 0.1 && child.position.y > 2.4) {
                    child.material = ceilMat;
                }
            }
        });

        // 3D-Holzbalken & Wandpfeiler alle 4 Meter im Gang für echten Horror-Look
        // Beams & posts reach the real ceiling (4.5m) and live in corridorGroup,
        // so they disappear together with the corridor when the elevator drops.
        for (let z = -3; z >= -49; z -= 4) {
            const topBeam = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.14, 0.18), beamMat);
            topBeam.position.set(0, 4.38, z);
            const postL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 4.5, 0.16), beamMat);
            postL.position.set(-1.14, 2.25, z);
            const postR = new THREE.Mesh(new THREE.BoxGeometry(0.10, 4.5, 0.16), beamMat);
            postR.position.set(1.14, 2.25, z);
            this.corridorGroup.add(topBeam, postL, postR);
        }
    }

    buildCorridor() {
        const wallMat = ProceduralTextures.createConcreteHallway();
        const floorMat = ProceduralTextures.createConcreteHallway();
        const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 54), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, -25);
        floor.receiveShadow = true;
        this.corridorGroup.add(floor);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 54), ceilMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 4.5, -25);
        this.corridorGroup.add(ceiling);

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 50), wallMat);
        leftWall.position.set(-1.2, 2.25, -25);
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 50), wallMat);
        rightWall.position.set(1.2, 2.25, -25);
        this.corridorGroup.add(leftWall, rightWall);

        for (let z = -4; z >= -46; z -= 7) {
            const lampMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.1, 0.6),
                new THREE.MeshBasicMaterial({ color: 0xffffee })
            );
            lampMesh.position.set(0, 4.42, z);
            this.corridorGroup.add(lampMesh);

            const light = new THREE.PointLight(0xfff5e6, 3.0, 12);
            light.position.set(0, 4.1, z);
            light.castShadow = true;
            this.corridorGroup.add(light);
            this.fluorescentLights.push({ light, baseIntensity: 3.0 });
        }
    }

    // 1. AUFWENDIGE FAHRSTUHL-WANDTEXTUR (Vernietete Stahl-Paneele, Holz-/Messing-Vertäfelung, Rost & Kratzer)
    createElevatorWallMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Grundfläche: Dunkler gebürsteter Industriestahl
        ctx.fillStyle = '#181a1f';
        ctx.fillRect(0, 0, 1024, 1024);

        // Feine vertikale Bürstenspuren im Metall
        for (let x = 0; x < 1024; x += 3) {
            ctx.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)';
            ctx.fillRect(x, 0, 2, 1024);
        }

        // 3 große vertikale Stahl-Wandpaneele oben (y = 30 bis 650)
        const panelW = 304;
        for (let p = 0; p < 3; p++) {
            const px = 36 + p * 326;
            const py = 36;
            const ph = 600;

            const pGrad = ctx.createLinearGradient(px, py, px + panelW, py + ph);
            pGrad.addColorStop(0, '#252830');
            pGrad.addColorStop(0.5, '#1b1d24');
            pGrad.addColorStop(1, '#121418');
            ctx.fillStyle = pGrad;
            ctx.fillRect(px, py, panelW, ph);

            // Eingelassener Stahlrahmen + Schattenfuge
            ctx.strokeStyle = '#090a0d';
            ctx.lineWidth = 10;
            ctx.strokeRect(px, py, panelW, ph);
            ctx.strokeStyle = '#3a3f4b';
            ctx.lineWidth = 3;
            ctx.strokeRect(px + 8, py + 8, panelW - 16, ph - 16);

            // Metall-Nieten rund um jedes Paneel
            ctx.fillStyle = '#4a505e';
            for (let ry = py + 24; ry <= py + ph - 24; ry += 52) {
                ctx.beginPath();
                ctx.arc(px + 20, ry, 4.5, 0, Math.PI * 2);
                ctx.arc(px + panelW - 20, ry, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
            for (let rx = px + 20; rx <= px + panelW - 20; rx += 52) {
                ctx.beginPath();
                ctx.arc(rx, py + 24, 4.5, 0, Math.PI * 2);
                ctx.arc(rx, py + ph - 24, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Horizontale Messing-/Rost-Stoßleiste in der Mitte (y = 655 bis 695)
        const railGrad = ctx.createLinearGradient(0, 655, 0, 695);
        railGrad.addColorStop(0, '#6e5223');
        railGrad.addColorStop(0.5, '#9c7634');
        railGrad.addColorStop(1, '#3d2c10');
        ctx.fillStyle = railGrad;
        ctx.fillRect(0, 655, 1024, 40);

        // Untere schwere Kabinen-Vertäfelung (dunkles geriffeltes Schutzblech + Holz-Kassetten, y = 695 bis 970)
        ctx.fillStyle = '#140d09';
        ctx.fillRect(0, 695, 1024, 275);
        for (let x = 24; x < 1000; x += 160) {
            ctx.fillStyle = '#1f130c';
            ctx.fillRect(x, 718, 136, 228);
            ctx.strokeStyle = '#382214';
            ctx.lineWidth = 6;
            ctx.strokeRect(x + 4, 722, 128, 220);
        }

        // Schwarz-gelbe Sicherheits-Scheuerleiste ganz unten (y = 970 bis 1024)
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 970, 1024, 54);
        ctx.fillStyle = '#997300';
        for (let sx = -64; sx < 1024; sx += 64) {
            ctx.beginPath();
            ctx.moveTo(sx, 1024);
            ctx.lineTo(sx + 32, 970);
            ctx.lineTo(sx + 56, 970);
            ctx.lineTo(sx + 24, 1024);
            ctx.closePath();
            ctx.fill();
        }

        // Rostläufer, Ölspuren und tiefe Krallen-Kratzer an den Kabinenwänden
        for (let i = 0; i < 45; i++) {
            const gx = Math.random() * 1024;
            const gy = Math.random() * 800;
            const gr = 20 + Math.random() * 75;
            const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
            g.addColorStop(0, i % 3 === 0 ? 'rgba(70, 15, 8, 0.52)' : 'rgba(5, 5, 5, 0.55)');
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
            bumpScale: 0.032,
            roughness: 0.42,
            metalness: 0.72
        });
    }

    // 2. AUFWENDIGER FAHRSTUHL-BODEN (Riffelblech / Diamond-Plate mit eingelassener Gummimatte & Verschmutzung)
    createElevatorFloorMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Äußerer Riffelblech-Stahlrahmen
        ctx.fillStyle = '#22252b';
        ctx.fillRect(0, 0, 1024, 1024);

        // Riffelblech-Rautenmuster (Diamond Plate)
        ctx.fillStyle = '#383d47';
        for (let y = 0; y < 1024; y += 32) {
            for (let x = 0; x < 1024; x += 32) {
                ctx.save();
                ctx.translate(x + 16, y + 16);
                ctx.rotate((x + y) % 64 === 0 ? Math.PI / 4 : -Math.PI / 4);
                ctx.fillRect(-9, -3, 18, 6);
                ctx.restore();
            }
        }

        // Eingelassene geriffelte Anti-Rutsch-Gummimatte in der Kabinenmitte
        ctx.fillStyle = '#121316';
        ctx.fillRect(110, 110, 804, 804);
        ctx.strokeStyle = '#4a4f5a';
        ctx.lineWidth = 14;
        ctx.strokeRect(110, 110, 804, 804);

        for (let y = 126; y < 898; y += 14) {
            ctx.fillStyle = y % 28 === 0 ? '#1b1d22' : '#0b0c0e';
            ctx.fillRect(126, y, 772, 8);
        }

        // Schmutz-, Rost- und Blutspuren auf dem Fahrstuhlboden
        for (let i = 0; i < 30; i++) {
            const rx = 140 + Math.random() * 740;
            const ry = 140 + Math.random() * 740;
            const rad = 30 + Math.random() * 90;
            const g = ctx.createRadialGradient(rx, ry, 4, rx, ry, rad);
            g.addColorStop(0, i % 2 === 0 ? 'rgba(55, 8, 5, 0.58)' : 'rgba(15, 10, 6, 0.65)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(rx, ry, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.035,
            roughness: 0.52,
            metalness: 0.62
        });
    }

    // 3. AUFWENDIGE FAHRSTUHL-SCHIEBETÜREN (Schwerer vernieteter Stahl, Gummikante, Sichtfenster-Gitter & Kratzer)
    createElevatorDoorMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        const dGrad = ctx.createLinearGradient(0, 0, 512, 0);
        dGrad.addColorStop(0, '#2a2e36');
        dGrad.addColorStop(0.5, '#383d47');
        dGrad.addColorStop(1, '#1d2026');
        ctx.fillStyle = dGrad;
        ctx.fillRect(0, 0, 512, 1024);

        // Vertikale Bürstenspuren
        for (let x = 0; x < 512; x += 4) {
            ctx.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.16)';
            ctx.fillRect(x, 0, 2, 1024);
        }

        // Schwere Tür-Kassetten & Nietenreihen
        ctx.strokeStyle = '#0e1014';
        ctx.lineWidth = 16;
        ctx.strokeRect(8, 8, 496, 1008);

        for (const py of [56, 536]) {
            ctx.fillStyle = '#22262e';
            ctx.fillRect(48, py, 416, 420);
            ctx.strokeStyle = '#111318';
            ctx.lineWidth = 8;
            ctx.strokeRect(48, py, 416, 420);
            ctx.strokeStyle = '#4c5260';
            ctx.lineWidth = 3;
            ctx.strokeRect(58, py + 10, 396, 400);
        }

        // Nieten entlang der Türkanten
        ctx.fillStyle = '#5a6070';
        for (let y = 36; y < 1000; y += 64) {
            ctx.beginPath();
            ctx.arc(26, y, 5, 0, Math.PI * 2);
            ctx.arc(486, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Rost- & Kratzspuren an der Aufzugtür
        for (let i = 0; i < 35; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(65, 16, 8, 0.38)' : 'rgba(0,0,0,0.35)';
            ctx.fillRect(Math.random() * 480, Math.random() * 960, 12 + Math.random() * 25, 40 + Math.random() * 90);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.03,
            roughness: 0.36,
            metalness: 0.82
        });
    }

    // 4. FAHRSTUHL-DECKENTEXTUR MIT LÜFTUNGSGITTER & NOTLUKEN-RAHMEN
    createElevatorCeilingMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#16181d';
        ctx.fillRect(0, 0, 512, 512);

        ctx.strokeStyle = '#2c303a';
        ctx.lineWidth = 12;
        ctx.strokeRect(10, 10, 492, 492);

        // Notausstiegs-Luke & Lüftungsschlitze
        ctx.fillStyle = '#0d0e12';
        ctx.fillRect(70, 70, 372, 372);
        ctx.strokeStyle = '#3a3f4d';
        ctx.lineWidth = 8;
        ctx.strokeRect(70, 70, 372, 372);

        for (let y = 100; y < 416; y += 22) {
            ctx.fillStyle = '#050608';
            ctx.fillRect(100, y, 312, 12);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.025,
            roughness: 0.5,
            metalness: 0.75
        });
    }

    createSignTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 192;
        const ctx = canvas.getContext('2d');

        // Dunkles geätztes Messing-/CRT-Anzeigefeld
        ctx.fillStyle = '#0b0403';
        ctx.fillRect(0, 0, 768, 192);

        for (let y = 0; y < 192; y += 4) {
            ctx.fillStyle = 'rgba(255, 80, 0, 0.04)';
            ctx.fillRect(0, y, 768, 2);
        }

        ctx.strokeStyle = '#b8732a';
        ctx.lineWidth = 10;
        ctx.strokeRect(6, 6, 756, 180);
        ctx.strokeStyle = '#ff5500';
        ctx.lineWidth = 3;
        ctx.strokeRect(16, 16, 736, 160);

        ctx.fillStyle = '#ffaa22';
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('STOCKWERK-CODE (ABSOLUTGLIED):', 384, 58);

        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ff3322';
        ctx.font = 'bold 42px monospace';
        ctx.fillText('(x - 3)² = x² - 6x + ?', 384, 134);

        return new THREE.CanvasTexture(canvas);
    }

    createButtonTexture(digit, bgColor = '#1e2026', borderColor = '#b88a38', textColor = '#ffea99') {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Gebürstete Metall-Taste mit Leuchtring
        const rad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
        rad.addColorStop(0, '#323640');
        rad.addColorStop(1, bgColor);
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, 128, 128);

        ctx.strokeStyle = '#0a0b0e';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 118, 118);

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 6;
        ctx.strokeRect(14, 14, 100, 100);

        ctx.shadowColor = borderColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = textColor;
        ctx.font = 'bold 66px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(digit, 64, 67);

        return new THREE.CanvasTexture(canvas);
    }

    buildElevatorCabin() {
        this.elevatorGroup = new THREE.Group();
        this.elevatorGroup.position.set(0, 0, -50.0);

        const wallMat = this.createElevatorWallMaterial();
        const floorMat = this.createElevatorFloorMaterial();
        const doorMat = this.createElevatorDoorMaterial();
        const ceilMat = this.createElevatorCeilingMaterial();
        const brassTrimMat = new THREE.MeshStandardMaterial({ color: 0x9c742c, metalness: 0.88, roughness: 0.28 });
        const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x181a20, metalness: 0.85, roughness: 0.35 });

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0.02, -1.5);
        this.elevatorGroup.add(floor);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), ceilMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 3.2, -1.5);
        this.elevatorGroup.add(ceiling);

        const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.1), wallMat);
        backWall.position.set(0, 1.6, -3.0);
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 3.0), wallMat);
        leftWall.position.set(-1.2, 1.6, -1.5);
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 3.0), wallMat);
        rightWall.position.set(1.2, 1.6, -1.5);
        this.elevatorGroup.add(backWall, leftWall, rightWall);

        // 3D-Edelstahl-/Messing-Handläufe an den beiden Seitenwänden des Fahrstuhls
        for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.5, 12), brassTrimMat);
            rail.rotation.x = Math.PI / 2;
            rail.position.set(side * 1.08, 1.02, -1.5);
            this.elevatorGroup.add(rail);

            for (const rz of [-0.45, -2.55]) {
                const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), darkSteelMat);
                mount.rotation.z = Math.PI / 2;
                mount.position.set(side * 1.12, 1.02, rz);
                this.elevatorGroup.add(mount);
            }
        }

        // 3D-Eckpfeiler & Deckenrahmen in der Fahrstuhlkabine
        for (const cx of [-1.13, 1.13]) {
            for (const cz of [-0.08, -2.92]) {
                const cornerPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 0.08), darkSteelMat);
                cornerPost.position.set(cx, 1.6, cz);
                this.elevatorGroup.add(cornerPost);
            }
        }

        // Decken-Käfiglampe im Fahrstuhl
        const lightCage = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), brassTrimMat);
        lightCage.position.set(0, 3.16, -1.5);
        const lightGlass = new THREE.Mesh(
            new THREE.PlaneGeometry(0.55, 0.55),
            new THREE.MeshBasicMaterial({ color: 0xff7744 })
        );
        lightGlass.rotation.x = Math.PI / 2;
        lightGlass.position.set(0, 3.11, -1.5);
        this.elevatorGroup.add(lightCage, lightGlass);

        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 0.08), doorMat);
        this.leftDoor.position.set(-1.3, 1.6, 0.0);
        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 0.08), doorMat);
        this.rightDoor.position.set(1.3, 1.6, 0.0);
        this.elevatorGroup.add(this.leftDoor, this.rightDoor);

        this.cabinLight = new THREE.PointLight(0xff5533, 3.5, 8.0);
        this.cabinLight.position.set(0, 2.8, -1.5);
        this.elevatorGroup.add(this.cabinLight);

        const signFrame = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.54, 0.03), brassTrimMat);
        signFrame.position.set(0, 2.15, -2.94);
        this.elevatorGroup.add(signFrame);

        const signMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.85, 0.48),
            new THREE.MeshBasicMaterial({ map: this.createSignTexture() })
        );
        signMesh.position.set(0, 2.15, -2.92);
        this.elevatorGroup.add(signMesh);

        const panelBacking = new THREE.Mesh(
            new THREE.BoxGeometry(0.78, 0.96, 0.04),
            darkSteelMat
        );
        panelBacking.position.set(0, 1.32, -2.94);
        this.elevatorGroup.add(panelBacking);

        const panelRim = new THREE.Mesh(
            new THREE.BoxGeometry(0.82, 1.00, 0.025),
            brassTrimMat
        );
        panelRim.position.set(0, 1.32, -2.95);
        this.elevatorGroup.add(panelRim);

        const layout = [
            { digit: '1', col: -1, row: 1 },
            { digit: '2', col: 0, row: 1 },
            { digit: '3', col: 1, row: 1 },
            { digit: '4', col: -1, row: 0 },
            { digit: '5', col: 0, row: 0 },
            { digit: '6', col: 1, row: 0 },
            { digit: '7', col: -1, row: -1 },
            { digit: '8', col: 0, row: -1 },
            { digit: '9', col: 1, row: -1 },
            { digit: '0', col: 0, row: -2 }
        ];

        layout.forEach((item) => {
            const btnTex = this.createButtonTexture(item.digit);
            const btnMat = new THREE.MeshBasicMaterial({ map: btnTex });
            const btnMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), btnMat);

            const bx = item.col * 0.21;
            const by = 1.48 + item.row * 0.20;
            const bz = -2.90;

            btnMesh.position.set(bx, by, bz);
            btnMesh.userData = {
                digit: item.digit,
                baseZ: bz,
                worldPos: new THREE.Vector3(bx, by, -50.0 + bz)
            };

            this.elevatorGroup.add(btnMesh);
            this.elevatorButtons.push(btnMesh);
        });

        this.hallwayGroup.add(this.elevatorGroup);
    }

    getHoveredButton(raycaster) {
        if ((!this.doorsFullyClosed && this.player.position.z > -49.8) || this.elevatorSolved) return null;
        const hits = raycaster.intersectObjects(this.elevatorButtons, false);
        if (hits.length > 0 && hits[0].distance < 3.2) {
            return hits[0].object;
        }
        return null;
    }

    pressHoveredButton(raycaster) {
        const btn = this.getHoveredButton(raycaster);
        if (!btn) return false;

        const digit = btn.userData.digit;
        btn.position.z = btn.userData.baseZ - 0.025;
        setTimeout(() => {
            btn.position.z = btn.userData.baseZ;
        }, 180);

        if (digit === '9') {
            this.elevatorSolved = true;
            btn.material.map = this.createButtonTexture(digit, '#004411', '#00ff66', '#00ff66');
            btn.material.needsUpdate = true;
            this.audio.playKeyPickup();

            // Echter Absturz im geschlossenen Fahrstuhl startet!
            setTimeout(() => {
                this.audio.playCableSnap();
                this.corridorGroup.visible = false;
                if (this.monsterGroup) this.monsterGroup.visible = false;
                this.isFalling = true;
                this.fallTimer = 0;
            }, 350);
        } else {
            btn.material.map = this.createButtonTexture(digit, '#550000', '#ff2222', '#ff4444');
            btn.material.needsUpdate = true;
            if (this.audio && this.audio.triggerScoldJumpscare) {
                this.audio.triggerScoldJumpscare();
            } else {
                this.audio.playMetalBang();
            }
            setTimeout(() => {
                btn.material.map = this.createButtonTexture(digit);
                btn.material.needsUpdate = true;
            }, 600);
        }
        return true;
    }

    openDoorsIntoFleischrooms() {
        this.audio.playDrawerSlide();
        let progress = 1.0;
        const animateOpen = () => {
            if (progress > 0.0) {
                progress -= 0.04;
                const p = Math.max(0, progress);
                this.leftDoor.position.x = -1.3 + (0.7 * p);
                this.rightDoor.position.x = 1.3 - (0.7 * p);
                requestAnimationFrame(animateOpen);
            } else {
                this.leftDoor.position.x = -1.3;
                this.rightDoor.position.x = 1.3;
            }
        };
        animateOpen();
    }

    buildMonster() {
        this.monsterEntity = new FleischiMonster();
        this.monsterGroup = this.monsterEntity.group;
        this.monsterGroup.position.set(0, 0, -0.6);
        this.monsterGroup.visible = false;
        this.scene.add(this.monsterGroup);
    }

    resetHallway() {
        this.hasTriggeredSpook = false;
        this.isMonsterActive = false;
        this.elevatorEntered = false;
        this.doorsFullyClosed = false;
        this.isFalling = false;
        this.corridorGroup.visible = true;
        this.monsterGroup.visible = false;
        this.monsterGroup.position.set(0, 0, -0.6);
        this.leftDoor.position.x = -1.3;
        this.rightDoor.position.x = 1.3;
        if (this.doorObstacle) {
            this.physics.removeObstacle(this.doorObstacle);
            this.doorObstacle = null;
        }
        for (const f of this.fluorescentLights) {
            f.light.intensity = f.baseIntensity;
        }
    }

    closeElevatorDoors() {
        if (this.doorsFullyClosed) return;
        this.doorsFullyClosed = true;
        this.isMonsterActive = false;
        this.doorObstacle = this.physics.addObstacle(-1.2, 1.2, -49.5, -49.0);
        this.audio.playDoorSlam();

        let progress = 0;
        const animateClosure = () => {
            if (progress < 1.0) {
                progress += 0.08;
                this.leftDoor.position.x = -1.3 + (0.7 * progress);
                this.rightDoor.position.x = 1.3 - (0.7 * progress);
                requestAnimationFrame(animateClosure);
            } else {
                this.leftDoor.position.x = -0.6;
                this.rightDoor.position.x = 0.6;
            }
        };
        animateClosure();
    }

    hideAll() {
        this.isDisabled = true;
        this.hallwayGroup.visible = false;
        if (this.monsterGroup) this.monsterGroup.visible = false;
    }

    update(delta) {
        if (this.isDisabled) return;

        // ECHTER FREIER FALL IM FAHRSTUHL (Rütteln, Flackern, Aufprall & Türöffnung in die Fleischrooms!)
        if (this.isFalling) {
            this.fallTimer += delta;
            this.player.jumpOffset = (Math.random() - 0.5) * 0.16;
            this.cabinLight.intensity = Math.random() < 0.4 ? 0.2 : 5.5;

            if (Math.random() < 0.25) {
                this.audio.playTick(0.6 + Math.random() * 0.5);
            }

            if (this.fallTimer >= 1.85) {
                this.isFalling = false;
                this.player.jumpOffset = 0;
                this.cabinLight.intensity = 3.2;
                this.audio.playMetalBang();
                this.audio.playDoorSlam();

                // Fleischrooms werden direkt draußen vor der Aufzugtür geladen (ohne Spieler-Teleport!)
                if (this.onElevatorLanded) {
                    this.onElevatorLanded();
                }

                // Aufzugtüren gleiten vor dir auf und du läufst direkt raus in die Fleischrooms!
                setTimeout(() => {
                    this.openDoorsIntoFleischrooms();
                }, 400);
            }
            return;
        }

        for (const f of this.fluorescentLights) {
            if (Math.random() < 0.02) {
                f.light.intensity = Math.random() < 0.3 ? 0.2 : f.baseIntensity * 1.4;
            } else if (!this.hasTriggeredSpook) {
                f.light.intensity = f.baseIntensity;
            }
        }

        if (!this.hasTriggeredSpook && this.player.position.z <= this.halfwayZ) {
            this.hasTriggeredSpook = true;
            this.isMonsterActive = true;
            this.monsterGroup.visible = true;
            for (const f of this.fluorescentLights) f.light.intensity = 0.35;
            // no sound at the halfway point
        }

        if (this.player.position.z <= -50.0) {
            // Sobald ein Spieler im Aufzug ist -> Fleischi verschwindet, damit der 2. Spieler frei reinlaufen kann!
            if (this.isMonsterActive || this.monsterGroup.visible) {
                this.isMonsterActive = false;
                this.monsterGroup.visible = false;
                this.monsterGroup.position.set(0, -10, 0);
            }
            const allInside = !window.__fnsMultiplayerActive || typeof window.__fnsCanCloseElevator !== 'function' || window.__fnsCanCloseElevator();
            if (!this.elevatorEntered && allInside) {
                this.elevatorEntered = true;
                this.closeElevatorDoors();
            }
        }

        if (this.doorsFullyClosed) {
            this.bangTimer += delta;
            if (this.bangTimer > 1.8 && !this.elevatorSolved) {
                this.bangTimer = 0;
                this.audio.playMetalBang();
            }
            return;
        }

        if (!this.isMonsterActive) return;

        const pPos = this.player.position;
        const mPos = this.monsterGroup.position;
        this.monsterGroup.lookAt(pPos.x, 0, pPos.z);

        const horizDist = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);

        if (horizDist <= 1.35 && !this.elevatorEntered && pPos.z > -49.5) {
            this.isMonsterActive = false;
            this.audio.playJumpscareSound();
            if (this.onCaughtInHallway) {
                this.onCaughtInHallway();
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
            const chaseDir = new THREE.Vector3(pPos.x - mPos.x, 0, pPos.z - mPos.z).normalize();
            this.monsterGroup.position.addScaledVector(chaseDir, this.monsterSpeed * delta);
            if (this.monsterGroup.position.z < -47.2) {
                this.isMonsterActive = false;
                this.monsterGroup.visible = false;
                this.monsterGroup.position.set(0, -10, 0);
            }
        } else {
            this.monsterEntity.animate(delta, false);
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof HallwayManager !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'gang', cls: HallwayManager });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('gang', HallwayManager);
  }
}


// [MILAN_MODE_HOOK_B2]

(() => {
    const cls = (typeof HallwayManager !== 'undefined') ? HallwayManager : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('Hallway', this);
            if (milanMode.isMilan && (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick'))) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.5;
                }
            }
            return orig.apply(this, args);
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
