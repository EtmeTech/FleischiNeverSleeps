import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { FleischiMonster } from './FleischiMonster.js';

export class MultiFloorLabyrinthManager {
    constructor(scene, camera, player, audio, physics, onVictoryCallback, onCaughtCallback) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('mega_labyrinth', this), 200); }
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.audio = audio;
        this.physics = physics;
        this.onVictoryCallback = onVictoryCallback;
        this.onCaughtCallback = onCaughtCallback;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        // 16x16 Gitter à 8m = 128m x 128m pro Stockwerk (3 Ebenen)!
        this.gridCount = 16;
        this.cellSize = 8.0;
        this.halfSize = 64.0;

        this.floorHeights = {
            '-1': -4.5,
            '0': 0.0,
            '1': 4.5
        };

        this.isEnteringWalk = true;
        this.enterWalkProgress = 0;
        this.entranceDoorClosing = false;
        this.entranceDoorAngle = Math.PI * 0.58;
        this.hasWalkedInside = false;

        // Spawn-Schutz-Timer verhindert Dauer-Kills nach dem Respawn!
        this.spawnGraceTimer = 3.5;

        this.staticWallsByFloor = { '-1': [], '0': [], '1': [] };
        this.stairs = [];
        this.fleischis = [];
        this.exitPos = this.cellCenter(15, 0);
        this.time = 0;

        this.minimapContainer = document.getElementById('minimap-container');
        this.minimapHeader = document.getElementById('minimap-header');
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

        this.initMaterials();
        this.buildMassiveHardLabyrinth();
    }

    cellCenter(cx, cz) {
        return new THREE.Vector3(
            -60.0 + cx * 8.0,
            0.0,
            -60.0 + cz * 8.0
        );
    }

    // Prüft, ob eine Position in der geschützten Start-Ecke (Zellen 0..2, 13..15 auf Ebene 0) liegt
    isInSpawnSafeZone(floorKey, x, z) {
        return floorKey === '0' && x < -38.0 && z > 38.0;
    }

    // 1. AUFWENDIGE 1024x1024 LABYRINTH-WANDTEXTUR (Viktorianische Damast-Tapete, Holz-Kassetten, Risse & Goldrahmen-Fleischi-Porträts!)
    createElaborateLabyrinthWallMaterial(theme = '0', portraitSrc = 'assets/textures/fleischi_face.png') {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        const palettes = {
            '-1': { bg: '#260d0b', stripe: '#38120e', wainscot: '#1a0806', panel: '#120504', trim: '#6e2816', gold: '#b86b28' },
            '0':  { bg: '#2e2110', stripe: '#3d2c15', wainscot: '#1f1308', panel: '#140c05', trim: '#755120', gold: '#c99b3b' },
            '1':  { bg: '#112622', stripe: '#173630', wainscot: '#0b1a17', panel: '#071210', trim: '#296658', gold: '#78b89a' }
        };
        const pal = palettes[theme] || palettes['0'];

        // Oberer Tapetenbereich (y = 0 bis 680)
        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, 1024, 1024);

        // Edle Damast-Tapetenstreifen & Rauten-Ornamente
        for (let x = 0; x < 1024; x += 64) {
            ctx.fillStyle = (x / 64) % 2 === 0 ? pal.stripe : pal.bg;
            ctx.fillRect(x, 0, 32, 680);

            ctx.strokeStyle = 'rgba(255, 215, 140, 0.10)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 16, 0);
            ctx.lineTo(x + 16, 680);
            ctx.stroke();

            for (let y = 56; y < 650; y += 80) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
                ctx.beginPath();
                ctx.moveTo(x + 16, y - 18);
                ctx.lineTo(x + 30, y);
                ctx.lineTo(x + 16, y + 18);
                ctx.lineTo(x + 2, y);
                ctx.closePath();
                ctx.fill();
            }
        }

        // Obere Decken-Stuckleiste (Crown Molding)
        ctx.fillStyle = '#0e0704';
        ctx.fillRect(0, 0, 1024, 34);
        ctx.fillStyle = pal.trim;
        ctx.fillRect(0, 34, 1024, 12);

        // Untere schwere Holz-Wandvertäfelung (Wainscoting, y = 680 bis 1024)
        ctx.fillStyle = pal.wainscot;
        ctx.fillRect(0, 680, 1024, 344);

        // Profilierte Mittel-Zierleiste (Chair Rail)
        ctx.fillStyle = pal.trim;
        ctx.fillRect(0, 668, 1024, 20);
        ctx.fillStyle = '#090402';
        ctx.fillRect(0, 688, 1024, 8);

        // 8 tief profilierte Holz-Kassetten im unteren Drittel
        for (let x = 16; x < 1024; x += 128) {
            ctx.fillStyle = pal.panel;
            ctx.fillRect(x, 714, 96, 250);
            ctx.strokeStyle = pal.trim;
            ctx.lineWidth = 6;
            ctx.strokeRect(x + 4, 718, 88, 242);
            ctx.strokeStyle = '#050201';
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 12, 726, 72, 226);
        }

        // Sockelleiste ganz unten
        ctx.fillStyle = '#080402';
        ctx.fillRect(0, 980, 1024, 44);

        // Alterungsspuren, Risse & Feuchtigkeitsflecken
        for (let i = 0; i < 60; i++) {
            const gx = Math.random() * 1024;
            const gy = Math.random() * 960;
            const gr = 25 + Math.random() * 85;
            const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, gr);
            g.addColorStop(0, i % 3 === 0 ? 'rgba(45, 6, 4, 0.45)' : 'rgba(5, 3, 2, 0.55)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(gx, gy, gr, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;

        const img = new Image();
        img.src = portraitSrc;
        img.onload = () => {
            // Statt lose schwebender Köpfe: 4 prunkvolle gerahmte Gemälde / Medaillons mit Glas-Schattierung in der Tapete!
            const frames = [
                { x: 512, y: 360, w: 380, h: 500, oval: false }
            ];

            for (const fr of frames) {
                ctx.save();
                ctx.translate(fr.x, fr.y);

                // Schlagschatten des Bilderrahmens auf der Tapete
                ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                if (fr.oval) {
                    ctx.beginPath();
                    ctx.ellipse(6, 8, fr.w / 2 + 14, fr.h / 2 + 14, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-fr.w / 2 - 10, -fr.h / 2 - 8, fr.w + 26, fr.h + 26);
                }

                // Äußerer Barock-/Goldrahmen
                ctx.fillStyle = pal.gold;
                ctx.strokeStyle = '#1a0d04';
                ctx.lineWidth = 6;
                if (fr.oval) {
                    ctx.beginPath();
                    ctx.ellipse(0, 0, fr.w / 2 + 12, fr.h / 2 + 12, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                } else {
                    ctx.fillRect(-fr.w / 2 - 12, -fr.h / 2 - 12, fr.w + 24, fr.h + 24);
                    ctx.strokeRect(-fr.w / 2 - 12, -fr.h / 2 - 12, fr.w + 24, fr.h + 24);
                }

                // Dunkler Gemälde-Hintergrund + Fleischi-Porträt
                ctx.fillStyle = '#120804';
                ctx.beginPath();
                if (fr.oval) {
                    ctx.ellipse(0, 0, fr.w / 2, fr.h / 2, 0, 0, Math.PI * 2);
                } else {
                    ctx.rect(-fr.w / 2, -fr.h / 2, fr.w, fr.h);
                }
                ctx.fill();
                ctx.clip();

                ctx.globalAlpha = 0.88;
                const sc = Math.max(fr.w / img.width, fr.h / img.height);
                ctx.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc);

                // Gealterte Gemälde-Vignette & Firnis-Risse über dem Porträt
                const vig = ctx.createRadialGradient(0, 0, fr.w * 0.15, 0, 0, fr.w * 0.65);
                vig.addColorStop(0, 'rgba(40, 20, 5, 0.05)');
                vig.addColorStop(1, 'rgba(5, 2, 0, 0.78)');
                ctx.fillStyle = vig;
                ctx.fillRect(-fr.w / 2, -fr.h / 2, fr.w, fr.h);

                ctx.restore();
            }

            tex.needsUpdate = true;
        };

        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.032,
            roughness: 0.72,
            metalness: 0.10
        });
    }

    // 2. AUFWENDIGER LABYRINTH-PARKETTBODEN (Dunkles Fischgrät-/Kassetten-Holzparkett mit Bump-Map & Patina)
    createElaborateLabyrinthFloorMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#1a1008';
        ctx.fillRect(0, 0, 1024, 1024);

        const tileSize = 256;
        for (let ty = 0; ty < 1024; ty += tileSize) {
            for (let tx = 0; tx < 1024; tx += tileSize) {
                const isVertical = ((tx + ty) / tileSize) % 2 === 0;
                const strips = 4;
                const stripSize = tileSize / strips;

                for (let s = 0; s < strips; s++) {
                    const shade = (s % 2 === 0) ? '#26170b' : '#1e1108';
                    ctx.fillStyle = shade;
                    if (isVertical) {
                        ctx.fillRect(tx + s * stripSize + 2, ty + 2, stripSize - 4, tileSize - 4);
                    } else {
                        ctx.fillRect(tx + 2, ty + s * stripSize + 2, tileSize - 4, stripSize - 4);
                    }
                }

                // Edler dunkler Parkett-Fugenrahmen
                ctx.strokeStyle = '#0a0502';
                ctx.lineWidth = 5;
                ctx.strokeRect(tx + 2, ty + 2, tileSize - 4, tileSize - 4);
                ctx.strokeStyle = 'rgba(180, 130, 70, 0.12)';
                ctx.lineWidth = 2;
                ctx.strokeRect(tx + 8, ty + 8, tileSize - 16, tileSize - 16);
            }
        }

        // Feine Holzmaserung & dunkle Abnutzungsspuren
        for (let i = 0; i < 90; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const r = 20 + Math.random() * 75;
            const g = ctx.createRadialGradient(x, y, 2, x, y, r);
            g.addColorStop(0, 'rgba(6, 3, 1, 0.45)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;

        // Dezente, geisterhaft im polierten Parkett eingelassene Fleischi-Spiegelungen
        const img = new Image();
        img.src = 'assets/textures/fleischi_face.png';
        img.onload = () => {
            for (const [fx, fy] of [[256, 256], [768, 768]]) {
                ctx.save();
                ctx.globalAlpha = 0.16;
                ctx.beginPath();
                ctx.arc(fx, fy, 110, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(img, fx - 110, fy - 110, 220, 220);
                ctx.restore();
            }
            tex.needsUpdate = true;
        };

        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.028,
            roughness: 0.55,
            metalness: 0.12
        });
    }

    // 3. AUFWENDIGE TREPPEN-TEXTUR MIT TRITTPROFIL & LEUCHTKANTE
    createElaborateStairMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#162830';
        ctx.fillRect(0, 0, 512, 256);

        // Geriffeltes Metall-Trittprofil
        for (let y = 24; y < 220; y += 12) {
            ctx.fillStyle = y % 24 === 0 ? '#223d4a' : '#0e1a20';
            ctx.fillRect(16, y, 480, 6);
        }

        // Cyanfarbene Sicherheits-Leuchtkante vorne und hinten
        ctx.fillStyle = '#00d8ff';
        ctx.fillRect(0, 0, 512, 16);
        ctx.fillRect(0, 240, 512, 16);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.025,
            emissive: 0x002633,
            roughness: 0.42,
            metalness: 0.55
        });
    }

    initMaterials() {
        this.wallMaterials = {
            '-1': this.createElaborateLabyrinthWallMaterial('-1'),
            '0': this.createElaborateLabyrinthWallMaterial('0'),
            '1': this.createElaborateLabyrinthWallMaterial('1')
        };
        this.wallMaterialsNoel = {
            '-1': this.createElaborateLabyrinthWallMaterial('-1', 'assets/textures/noel.png'),
            '0': this.createElaborateLabyrinthWallMaterial('0', 'assets/textures/noel.png'),
            '1': this.createElaborateLabyrinthWallMaterial('1', 'assets/textures/noel.png')
        };
        this.floorMat = this.createElaborateLabyrinthFloorMaterial();
        this.stairMat = this.createElaborateStairMaterial();
    }

    seededRandom(seed) {
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return () => {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    getSectorId(floorKey, cx, cz) {
        if (floorKey === '0') {
            const east = cx >= 8 ? 1 : 0;
            const north = cz < 8 ? 2 : 0;
            return east + north;
        } else if (floorKey === '-1') {
            if (cx < 7) return 10;
            if (cz >= 9) return 11;
            return 12;
        } else {
            if (cz < 7 && cx < 11) return 20;
            if (cz >= 7 && cx < 9) return 21;
            return 22;
        }
    }

    buildLabyrinthEntranceDoor() {
        const doorContainer = new THREE.Group();
        doorContainer.position.set(-60.0, 0.0, 63.72);

        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a0805, roughness: 0.5 });
        const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.55, 0.35), frameMat);
        frameL.position.set(-0.68, 1.27, 0);
        const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.55, 0.35), frameMat);
        frameR.position.set(0.68, 1.27, 0);
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.16, 0.35), frameMat);
        frameTop.position.set(0, 2.50, 0);
        doorContainer.add(frameL, frameR, frameTop);

        this.entranceDoorHinge = new THREE.Group();
        this.entranceDoorHinge.position.set(-0.6, 0, -0.05);
        this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;

        const doorWoodMat = new THREE.MeshStandardMaterial({
            color: 0x551a12,
            roughness: 0.5
        });
        const handleMat = new THREE.MeshStandardMaterial({
            color: 0xffdd44,
            emissive: 0x553300,
            metalness: 0.9,
            roughness: 0.2
        });

        const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.45, 0.09), doorWoodMat);
        doorPanel.position.set(0.6, 1.225, 0);
        this.entranceDoorHinge.add(doorPanel);

        const handleIn = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), handleMat);
        handleIn.position.set(1.02, 1.15, -0.08);
        this.entranceDoorHinge.add(handleIn);

        doorContainer.add(this.entranceDoorHinge);
        this.group.add(doorContainer);
    }

    buildMassiveHardLabyrinth() {
        this.physics.setMode('labyrinth', { minX: -63.3, maxX: 63.3, minZ: -63.3, maxZ: 63.3 });

        const startPos = this.cellCenter(0, 15);
        this.player.groundY = 0.0;
        this.player.position.set(startPos.x, 1.6, 63.1);
        this.camera.position.set(startPos.x, 1.6, 63.1);

        if (this.minimapContainer) {
            this.minimapContainer.style.display = 'block';
        }

        const ambLight = new THREE.AmbientLight(0xffe0aa, 0.85);
        this.group.add(ambLight);

        this.playerLight = new THREE.PointLight(0xffcc88, 3.0, 24);
        this.group.add(this.playerLight);

        this.buildLabyrinthEntranceDoor();

        const stairDefs = [
            { cx: 2, cz: 12, fromFloor: '0', toFloor: '-1', enterSide: 'S', exitSide: 'N' },
            { cx: 5, cz: 10, fromFloor: '0', toFloor: '-1', enterSide: 'S', exitSide: 'N' },
            { cx: 4, cz: 13, fromFloor: '0', toFloor: '1', enterSide: 'W', exitSide: 'E' },
            { cx: 6, cz: 14, fromFloor: '0', toFloor: '-1', enterSide: 'W', exitSide: 'E' },

            { cx: 2, cz: 5, fromFloor: '-1', toFloor: '0', enterSide: 'S', exitSide: 'N' },
            { cx: 5, cz: 3, fromFloor: '-1', toFloor: '0', enterSide: 'S', exitSide: 'N' },

            { cx: 3, cz: 2, fromFloor: '0', toFloor: '1', enterSide: 'W', exitSide: 'E' },
            { cx: 6, cz: 5, fromFloor: '0', toFloor: '1', enterSide: 'W', exitSide: 'E' },

            { cx: 8, cz: 6, fromFloor: '1', toFloor: '0', enterSide: 'N', exitSide: 'S' },
            { cx: 8, cz: 11, fromFloor: '1', toFloor: '0', enterSide: 'W', exitSide: 'E' },
            { cx: 10, cz: 13, fromFloor: '-1', toFloor: '0', enterSide: 'W', exitSide: 'E' },

            { cx: 12, cz: 9, fromFloor: '0', toFloor: '-1', enterSide: 'S', exitSide: 'N' },
            { cx: 14, cz: 11, fromFloor: '0', toFloor: '1', enterSide: 'S', exitSide: 'N' },

            { cx: 10, cz: 4, fromFloor: '-1', toFloor: '0', enterSide: 'S', exitSide: 'N' },
            { cx: 12, cz: 5, fromFloor: '1', toFloor: '0', enterSide: 'S', exitSide: 'N' },
            { cx: 14, cz: 3, fromFloor: '1', toFloor: '0', enterSide: 'S', exitSide: 'N' }
        ];

        const stairCellLookup = new Map();
        for (const sd of stairDefs) {
            stairCellLookup.set(`${sd.cx},${sd.cz}`, sd);
            this.buildWalkableStaircase(sd);
        }

        for (let cx = 0; cx < this.gridCount; cx++) {
            for (let cz = 0; cz < this.gridCount; cz++) {
                const key = `${cx},${cz}`;
                const sd = stairCellLookup.get(key);
                const center = this.cellCenter(cx, cz);

                for (const fk of ['-1', '0', '1']) {
                    const fy = this.floorHeights[fk];
                    if (sd && (sd.fromFloor === fk || sd.toFloor === fk)) {
                        continue;
                    }

                    const slab = new THREE.Mesh(this.createWorldScaledBoxGeometry(8.0, 0.3, 8.0, 4.0), this.floorMat);
                    slab.position.set(center.x, fy - 0.15, center.z);
                    this.group.add(slab);
                    this.physics.addRamp(center.x - 4.0, center.x + 4.0, center.z - 4.0, center.z + 4.0, fy, fy, 'z');
                }
            }
        }

        const roof = new THREE.Mesh(this.createWorldScaledBoxGeometry(128.0, 0.3, 128.0, 4.0), this.floorMat);
        roof.position.set(0, 9.0, 0);
        this.group.add(roof);

        this.buildMazeWallsForFloor('0', this.generateSectorMazeEdges('0', stairCellLookup, 101));
        this.buildMazeWallsForFloor('-1', this.generateSectorMazeEdges('-1', stairCellLookup, 202));
        this.buildMazeWallsForFloor('1', this.generateSectorMazeEdges('1', stairCellLookup, 303));

        this.buildFinalExitOnMiddleFloor();
        this.spawnHardFleischis();

        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = "FINDE DEN WEG ÜBER DIE 3 EBENEN ZUM AUSGANG IM NORDOSTEN!";
            hud.style.color = '#ffaa00';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 4500);
        }
    }

    edgeKey(c1, r1, c2, r2) {
        if (c1 < c2 || (c1 === c2 && r1 < r2)) {
            return `${c1},${r1}-${c2},${r2}`;
        }
        return `${c2},${r2}-${c1},${r1}`;
    }

    generateSectorMazeEdges(floorKey, stairCellLookup, seed) {
        const rand = this.seededRandom(seed);
        const edges = new Set();
        const N = this.gridCount;

        const isStairCell = (cx, cz) => stairCellLookup.has(`${cx},${cz}`);

        for (const sd of stairCellLookup.values()) {
            let openSide = null;
            if (sd.fromFloor === floorKey) openSide = sd.enterSide;
            else if (sd.toFloor === floorKey) openSide = sd.exitSide;

            if (openSide) {
                let nx = sd.cx;
                let nz = sd.cz;
                if (openSide === 'N') nz--;
                else if (openSide === 'S') nz++;
                else if (openSide === 'W') nx--;
                else if (openSide === 'E') nx++;

                if (nx >= 0 && nx < N && nz >= 0 && nz < N) {
                    edges.add(this.edgeKey(sd.cx, sd.cz, nx, nz));
                }
            }
        }

        const visited = Array.from({ length: N }, () => Array(N).fill(false));

        for (let startX = 0; startX < N; startX++) {
            for (let startZ = 0; startZ < N; startZ++) {
                if (visited[startX][startZ] || isStairCell(startX, startZ)) continue;

                const sector = this.getSectorId(floorKey, startX, startZ);
                const stack = [[startX, startZ]];
                visited[startX][startZ] = true;

                while (stack.length > 0) {
                    const [cx, cz] = stack[stack.length - 1];
                    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

                    for (let i = dirs.length - 1; i > 0; i--) {
                        const j = Math.floor(rand() * (i + 1));
                        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
                    }

                    let moved = false;
                    for (const [dx, dz] of dirs) {
                        const nx = cx + dx;
                        const nz = cz + dz;
                        if (
                            nx >= 0 && nx < N && nz >= 0 && nz < N &&
                            !visited[nx][nz] &&
                            !isStairCell(nx, nz) &&
                            this.getSectorId(floorKey, nx, nz) === sector
                        ) {
                            visited[nx][nz] = true;
                            edges.add(this.edgeKey(cx, cz, nx, nz));
                            stack.push([nx, nz]);
                            moved = true;
                            break;
                        }
                    }
                    if (!moved) {
                        stack.pop();
                    }
                }
            }
        }

        for (let cx = 0; cx < N; cx++) {
            for (let cz = 0; cz < N; cz++) {
                if (isStairCell(cx, cz)) continue;
                const sector = this.getSectorId(floorKey, cx, cz);
                const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

                let openCount = 0;
                const closedValidNeighbors = [];

                for (const [dx, dz] of dirs) {
                    const nx = cx + dx;
                    const nz = cz + dz;
                    if (nx >= 0 && nx < N && nz >= 0 && nz < N) {
                        if (edges.has(this.edgeKey(cx, cz, nx, nz))) {
                            openCount++;
                        } else if (!isStairCell(nx, nz) && this.getSectorId(floorKey, nx, nz) === sector) {
                            closedValidNeighbors.push([nx, nz]);
                        }
                    }
                }

                if (openCount <= 1 && closedValidNeighbors.length > 0) {
                    const pick = closedValidNeighbors[Math.floor(rand() * closedValidNeighbors.length)];
                    edges.add(this.edgeKey(cx, cz, pick[0], pick[1]));
                }
            }
        }

        return edges;
    }

    buildWalkableStaircase(sd) {
        const center = this.cellCenter(sd.cx, sd.cz);
        const yFrom = this.floorHeights[sd.fromFloor];
        const yTo = this.floorHeights[sd.toFloor];

        let axis = 'z';
        let startY = yFrom;
        let endY = yTo;

        if (sd.enterSide === 'N' && sd.exitSide === 'S') {
            axis = 'z';
            startY = yFrom;
            endY = yTo;
        } else if (sd.enterSide === 'S' && sd.exitSide === 'N') {
            axis = 'z';
            startY = yTo;
            endY = yFrom;
        } else if (sd.enterSide === 'W' && sd.exitSide === 'E') {
            axis = 'x';
            startY = yFrom;
            endY = yTo;
        } else if (sd.enterSide === 'E' && sd.exitSide === 'W') {
            axis = 'x';
            startY = yTo;
            endY = yFrom;
        }

        const margin = 0.65;
        const rampSpan = 8.0 - 2 * margin;
        const numSteps = 20;

        if (axis === 'z') {
            const padN = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, margin + 0.2), this.stairMat);
            padN.position.set(center.x, startY - 0.15, center.z - 4.0 + margin / 2);
            const padS = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, margin + 0.2), this.stairMat);
            padS.position.set(center.x, endY - 0.15, center.z + 4.0 - margin / 2);
            this.group.add(padN, padS);

            for (let i = 0; i < numSteps; i++) {
                const t = (i + 0.5) / numSteps;
                const sy = startY + t * (endY - startY);
                const sz = (center.z - 4.0 + margin) + t * rampSpan;
                const step = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.28, (rampSpan / numSteps) + 0.08), this.stairMat);
                step.position.set(center.x, sy - 0.12, sz);
                this.group.add(step);
            }
        } else {
            const padW = new THREE.Mesh(new THREE.BoxGeometry(margin + 0.2, 0.3, 7.6), this.stairMat);
            padW.position.set(center.x - 4.0 + margin / 2, startY - 0.15, center.z);
            const padE = new THREE.Mesh(new THREE.BoxGeometry(margin + 0.2, 0.3, 7.6), this.stairMat);
            padE.position.set(center.x + 4.0 - margin / 2, endY - 0.15, center.z);
            this.group.add(padW, padE);

            for (let i = 0; i < numSteps; i++) {
                const t = (i + 0.5) / numSteps;
                const sy = startY + t * (endY - startY);
                const sx = (center.x - 4.0 + margin) + t * rampSpan;
                const step = new THREE.Mesh(new THREE.BoxGeometry((rampSpan / numSteps) + 0.08, 0.28, 7.4), this.stairMat);
                step.position.set(sx, sy - 0.12, center.z);
                this.group.add(step);
            }
        }

        const stairLight = new THREE.PointLight(0x00ddff, 2.5, 14);
        stairLight.position.set(center.x, Math.max(yFrom, yTo) + 2.8, center.z);
        this.group.add(stairLight);

        this.physics.addRamp(
            center.x - 4.0, center.x + 4.0,
            center.z - 4.0, center.z + 4.0,
            startY, endY, axis, null, margin
        );

        this.stairs.push({
            cx: sd.cx,
            cz: sd.cz,
            x: center.x,
            z: center.z,
            fromFloor: sd.fromFloor,
            toFloor: sd.toFloor
        });
    }

    buildMazeWallsForFloor(floorKey, openEdges) {
        const fy = this.floorHeights[floorKey];
        const wallH = 4.35;
        const wallY = fy + wallH / 2 - 0.1;
        const mat = this.wallMaterials[floorKey];
        const noelMat = this.wallMaterialsNoel[floorKey];
        const N = this.gridCount;

        this.addWallSegment(0, wallY, -64.0, 128.5, wallH, 0.5, mat, floorKey, fy);
        this.addWallSegment(0, wallY, 64.0, 128.5, wallH, 0.5, mat, floorKey, fy);
        this.addWallSegment(-64.0, wallY, 0, 0.5, wallH, 128.5, mat, floorKey, fy);
        this.addWallSegment(64.0, wallY, 0, 0.5, wallH, 128.5, mat, floorKey, fy);

        for (let cx = 0; cx < N - 1; cx++) {
            for (let cz = 0; cz < N; cz++) {
                if (!openEdges.has(this.edgeKey(cx, cz, cx + 1, cz))) {
                    const wx = -56.0 + cx * 8.0;
                    const wz = -60.0 + cz * 8.0;
                    this.addWallSegment(wx, wallY, wz, 0.5, wallH, 8.2, ((cx * 7 + cz * 3) % 3 === 0) ? noelMat : mat, floorKey, fy);
                }
            }
        }

        for (let cx = 0; cx < N; cx++) {
            for (let cz = 0; cz < N - 1; cz++) {
                if (!openEdges.has(this.edgeKey(cx, cz, cx, cz + 1))) {
                    const wx = -60.0 + cx * 8.0;
                    const wz = -56.0 + cz * 8.0;
                    this.addWallSegment(wx, wallY, wz, 8.2, wallH, 0.5, ((cx * 5 + cz * 2) % 3 === 0) ? noelMat : mat, floorKey, fy);
                }
            }
        }
    }

    addWallSegment(x, y, z, w, h, d, mat, floorKey, fy) {
        const mesh = new THREE.Mesh(this.createWorldScaledBoxGeometry(w, h, d, 4.0), mat);
        mesh.position.set(x, y, z);
        this.group.add(mesh);

        const obs = this.physics.addObstacle(x - w / 2, x + w / 2, z - d / 2, z + d / 2, fy + 0.15, fy + 3.85);
        this.staticWallsByFloor[floorKey].push({
            x, z, w, d,
            minX: x - w / 2, maxX: x + w / 2,
            minZ: z - d / 2, maxZ: z + d / 2
        });
        return obs;
    }

    buildFinalExitOnMiddleFloor() {
        // RIESIGE OFFENE 3D-DOPPELTÜR AM ENDE DES LABYRINTHS (Zelle 15,0 an der Nordwand!)
        const giantDoorGroup = new THREE.Group();
        this.exitPos.set(60.0, 0.0, -62.8);
        giantDoorGroup.position.set(60.0, 0.0, -63.65);

        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e0d06, roughness: 0.5, metalness: 0.3 });
        const doorWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a1c0e, roughness: 0.55, metalness: 0.15 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x553b00, metalness: 0.9, roughness: 0.2 });

        // Massiver 4.6m breiter und 4.2m hoher Türrahmen
        const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.45), frameMat);
        pillarL.position.set(-2.15, 2.1, 0);
        const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.45), frameMat);
        pillarR.position.set(2.15, 2.1, 0);
        const lintelTop = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.38, 0.5), frameMat);
        lintelTop.position.set(0, 4.05, 0);
        giantDoorGroup.add(pillarL, pillarR, lintelTop);

        // Leuchtendes Ausgangs-Portal tief im offenen Riesen-Türrahmen
        const exitPortal = new THREE.Mesh(
            new THREE.PlaneGeometry(3.95, 3.85),
            new THREE.MeshBasicMaterial({ color: 0x00ff66, side: THREE.DoubleSide })
        );
        exitPortal.position.set(0, 1.95, -0.05);
        giantDoorGroup.add(exitPortal);

        // Linker riesiger Türflügel (weit nach innen in den Raum aufgeschwungen!)
        const leftHinge = new THREE.Group();
        leftHinge.position.set(-1.98, 0, 0.12);
        leftHinge.rotation.y = -Math.PI * 0.62;
        const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.98, 3.85, 0.16), doorWoodMat);
        leftWing.position.set(0.99, 1.925, 0);
        const leftHandle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), goldMat);
        leftHandle.position.set(1.72, 1.75, 0.14);
        leftWing.add(leftHandle);
        leftHinge.add(leftWing);
        giantDoorGroup.add(leftHinge);

        // Rechter riesiger Türflügel (weit nach innen in den Raum aufgeschwungen!)
        const rightHinge = new THREE.Group();
        rightHinge.position.set(1.98, 0, 0.12);
        rightHinge.rotation.y = Math.PI * 0.62;
        const rightWing = new THREE.Mesh(new THREE.BoxGeometry(1.98, 3.85, 0.16), doorWoodMat);
        rightWing.position.set(-0.99, 1.925, 0);
        const rightHandle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), goldMat);
        rightHandle.position.set(-1.72, 1.75, 0.14);
        rightWing.add(rightHandle);
        rightHinge.add(rightWing);
        giantDoorGroup.add(rightHinge);

        const exitLight = new THREE.PointLight(0x00ff66, 6.0, 24);
        exitLight.position.set(0, 2.8, 1.5);
        giantDoorGroup.add(exitLight);

        this.group.add(giantDoorGroup);
    }

    spawnHardFleischis() {
        const patrolConfigs = [
            // Weit weg vom Spieler-Spawn (0, 15) platziert!
            { floorKey: '0', startCell: [6, 12], dir: [1, 0] },
            { floorKey: '0', startCell: [7, 9], dir: [0, -1] },
            { floorKey: '0', startCell: [1, 4], dir: [1, 0] },
            { floorKey: '0', startCell: [5, 1], dir: [0, 1] },
            { floorKey: '0', startCell: [11, 12], dir: [1, 0] },
            { floorKey: '0', startCell: [13, 2], dir: [0, 1] },

            { floorKey: '-1', startCell: [1, 10], dir: [0, -1] },
            { floorKey: '-1', startCell: [4, 7], dir: [0, 1] },
            { floorKey: '-1', startCell: [3, 1], dir: [1, 0] },
            { floorKey: '-1', startCell: [9, 14], dir: [1, 0] },
            { floorKey: '-1', startCell: [13, 12], dir: [0, -1] },
            { floorKey: '-1', startCell: [11, 5], dir: [1, 0] },

            { floorKey: '1', startCell: [2, 12], dir: [1, 0] },
            { floorKey: '1', startCell: [6, 11], dir: [0, 1] },
            { floorKey: '1', startCell: [4, 4], dir: [1, 0] },
            { floorKey: '1', startCell: [8, 2], dir: [0, 1] },
            { floorKey: '1', startCell: [12, 8], dir: [0, -1] },
            { floorKey: '1', startCell: [14, 4], dir: [-1, 0] }
        ];

        for (const cfg of patrolConfigs) {
            const fy = this.floorHeights[cfg.floorKey];
            const c = this.cellCenter(cfg.startCell[0], cfg.startCell[1]);

            const entity = new FleischiMonster();
            const mGroup = entity.group;
            mGroup.position.set(c.x, fy, c.z);

            const warnLight = new THREE.PointLight(0xff2200, 3.2, 11.0);
            warnLight.position.set(0, 2.2, 0.4);
            mGroup.add(warnLight);

            const initDir = new THREE.Vector3(cfg.dir[0], 0, cfg.dir[1]).normalize();

            this.group.add(mGroup);
            this.fleischis.push({
                floorKey: cfg.floorKey,
                groundY: fy,
                entity,
                group: mGroup,
                spawnPos: new THREE.Vector3(c.x, fy, c.z),
                initialDir: initDir.clone(),
                moveDir: initDir.clone(),
                patrolSpeed: 4.3,
                chaseSpeed: 5.8
            });
        }
    }

    hasLineOfSight(floorKey, x1, z1, x2, z2) {
        const walls = this.staticWallsByFloor[floorKey] || [];
        const steps = 20;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const px = x1 + (x2 - x1) * t;
            const pz = z1 + (z2 - z1) * t;

            for (const w of walls) {
                if (px >= w.minX - 0.2 && px <= w.maxX + 0.2 && pz >= w.minZ - 0.2 && pz <= w.maxZ + 0.2) {
                    return false;
                }
            }
        }
        return true;
    }

    getCurrentFloorKey() {
        const y = this.player.groundY;
        if (y < -2.25) return '-1';
        if (y > 2.25) return '1';
        return '0';
    }

    // WICHTIG: Setzt bei Tod ALLE Fleischis auf ihre ursprünglichen Startpunkte zurück + aktiviert 3.5s Spawn-Schutz!
    resetOnCatch() {
        const startPos = this.cellCenter(0, 15);
        this.player.groundY = 0.0;
        this.player.position.set(startPos.x, 1.6, startPos.z);
        this.camera.position.set(startPos.x, 1.6, startPos.z);
        this.spawnGraceTimer = 3.5;

        for (const f of this.fleischis) {
            f.group.position.copy(f.spawnPos);
            f.moveDir.copy(f.initialDir);
            f.entity.resetPose();
        }
    }

    drawMinimap(currentFloorKey) {
        if (!this.minimapCtx) return;
        const ctx = this.minimapCtx;
        const W = 244;
        const H = 244;

        if (this.minimapHeader) {
            this.minimapHeader.innerText = `Ebene ${currentFloorKey}`;
        }

        ctx.fillStyle = '#080402';
        ctx.fillRect(0, 0, W, H);

        const toMap = (val) => ((val + 64.0) / 128.0) * W;
        const toScale = (len) => (len / 128.0) * W;

        ctx.fillStyle = '#7a6040';
        const walls = this.staticWallsByFloor[currentFloorKey] || [];
        for (const w of walls) {
            ctx.fillRect(
                toMap(w.x - w.w / 2),
                toMap(w.z - w.d / 2),
                Math.max(1.5, toScale(w.w)),
                Math.max(1.5, toScale(w.d))
            );
        }

        for (const st of this.stairs) {
            if (st.fromFloor === currentFloorKey || st.toFloor === currentFloorKey) {
                const targetFloor = st.fromFloor === currentFloorKey ? st.toFloor : st.fromFloor;
                const sx = toMap(st.x - 3.6);
                const sz = toMap(st.z - 3.6);
                const sw = toScale(7.2);

                ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
                ctx.strokeStyle = '#00eeff';
                ctx.lineWidth = 1.2;
                ctx.fillRect(sx, sz, sw, sw);
                ctx.strokeRect(sx, sz, sw, sw);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(targetFloor, toMap(st.x), toMap(st.z) + 3);
            }
        }

        const ex = toMap(this.exitPos.x);
        const ez = toMap(this.exitPos.z);
        if (currentFloorKey === '0') {
            ctx.fillStyle = '#00ff66';
            ctx.beginPath();
            ctx.arc(ex, ez, 5.5 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(ex, ez, 4.5, 0, Math.PI * 2);
            ctx.stroke();
        }

        for (const f of this.fleischis) {
            if (f.floorKey === currentFloorKey) {
                const fx = toMap(f.group.position.x);
                const fz = toMap(f.group.position.z);
                ctx.fillStyle = '#ff2222';
                ctx.beginPath();
                ctx.arc(fx, fz, 4.0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const px = toMap(this.player.position.x);
        const pz = toMap(this.player.position.z);
        const lookDir = new THREE.Vector3();
        this.camera.getWorldDirection(lookDir);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(px + lookDir.x * 10, pz + lookDir.z * 10);
        ctx.stroke();

        ctx.fillStyle = '#00ffcc';
        ctx.beginPath();
        ctx.arc(px, pz, 3.8, 0, Math.PI * 2);
        ctx.fill();
    }

    update(delta) {
        this.time += delta;
        if (this.spawnGraceTimer > 0) {
            this.spawnGraceTimer -= delta;
        }

        if (this.isEnteringWalk) {
            this.enterWalkProgress += delta * 1.45;
            const p = Math.min(1.0, this.enterWalkProgress);

            const walkZ = 63.1 - p * 3.1;
            const bobY = Math.sin(p * Math.PI * 4.0) * 0.045;
            this.player.position.set(-60.0, 1.6, walkZ);
            this.camera.position.set(-60.0, 1.6 + bobY, walkZ);

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

        const pPos = this.player.position;
        this.playerLight.position.set(pPos.x, pPos.y + 1.2, pPos.z);

        const currentFloorKey = this.getCurrentFloorKey();

        if (currentFloorKey === '0') {
            const distToExit = Math.hypot(pPos.x - this.exitPos.x, pPos.z - this.exitPos.z);
            if (distToExit < 2.6) {
                if (this.minimapContainer) this.minimapContainer.style.display = 'none';
                this.audio.playKeyPickup();
                this.onVictoryCallback();
                return;
            }
        }

        const playerInSafeSpawn = this.isInSpawnSafeZone(currentFloorKey, pPos.x, pPos.z) || this.spawnGraceTimer > 0;

        if (this.hasWalkedInside) {
            for (const f of this.fleischis) {
                const mPos = f.group.position;
                const sameFloor = (f.floorKey === currentFloorKey);
                const horizDist = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);

                const canSeePlayer = !playerInSafeSpawn && sameFloor && horizDist < 14.5 && this.hasLineOfSight(f.floorKey, mPos.x, mPos.z, pPos.x, pPos.z);

                f.entity.animate(delta, canSeePlayer, true);

                let speed = canSeePlayer ? f.chaseSpeed : f.patrolSpeed;
                if (canSeePlayer) {
                    f.moveDir.set(pPos.x - mPos.x, 0, pPos.z - mPos.z).normalize();
                }

                const desiredPos = mPos.clone().addScaledVector(f.moveDir, speed * delta);

                // Fleischis dürfen niemals in die geschützte Start-Ecke (Spawn Safe-Zone) laufen!
                if (this.isInSpawnSafeZone(f.floorKey, desiredPos.x, desiredPos.z)) {
                    f.moveDir.negate();
                    continue;
                }

                const resolvedPos = this.physics.resolveMovement(mPos, desiredPos, 0.45, f.groundY);
                const movedDist = Math.hypot(resolvedPos.x - mPos.x, resolvedPos.z - mPos.z);

                mPos.x = resolvedPos.x;
                mPos.z = resolvedPos.z;

                if (movedDist < speed * delta * 0.35) {
                    const cardinalDirs = [
                        new THREE.Vector3(1, 0, 0),
                        new THREE.Vector3(-1, 0, 0),
                        new THREE.Vector3(0, 0, 1),
                        new THREE.Vector3(0, 0, -1)
                    ];
                    const validDirs = cardinalDirs.filter(d => {
                        const testTarget = mPos.clone().addScaledVector(d, 0.9);
                        if (this.isInSpawnSafeZone(f.floorKey, testTarget.x, testTarget.z)) return false;
                        const testRes = this.physics.resolveMovement(mPos, testTarget, 0.45, f.groundY);
                        return Math.hypot(testRes.x - mPos.x, testRes.z - mPos.z) > 0.6;
                    });

                    if (validDirs.length > 0) {
                        f.moveDir.copy(validDirs[Math.floor(Math.random() * validDirs.length)]);
                    } else {
                        f.moveDir.negate();
                    }
                }

                f.group.lookAt(mPos.x + f.moveDir.x, mPos.y, mPos.z + f.moveDir.z);

                if (!playerInSafeSpawn && sameFloor && horizDist < 1.05) {
                    this.audio.playJumpscareSound();
                    if (this.onCaughtCallback) {
                        this.onCaughtCallback(f.entity, f.group);
                    }
                    return;
                }
            }
        }

        this.drawMinimap(currentFloorKey);
    }
}

MultiFloorLabyrinthManager.prototype.createWorldScaledBoxGeometry = function(w, h, d, tileSize = 4.0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const norm = geo.attributes.normal;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(norm.getX(i));
        const ny = Math.abs(norm.getY(i));
        const nz = Math.abs(norm.getZ(i));
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        if (ny > 0.5) {
            uv.setXY(i, (px + w / 2) / tileSize, (pz + d / 2) / tileSize);
        } else if (nx > 0.5) {
            uv.setXY(i, (pz + d / 2) / tileSize, (py + h / 2) / h);
        } else if (nz > 0.5) {
            uv.setXY(i, (px + w / 2) / tileSize, (py + h / 2) / h);
        }
    }
    uv.needsUpdate = true;
    return geo;
};


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof MultiFloorLabyrinthManager !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'mega_labyrinth', cls: MultiFloorLabyrinthManager });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('mega_labyrinth', MultiFloorLabyrinthManager);
  }
}


// [MILAN_MODE_HOOK]

(() => {
    const cls = (typeof MultiFloorLabyrinthManager !== 'undefined') ? MultiFloorLabyrinthManager : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('MultiFloorLabyrinth', this);
            if (milanMode.isMilan && (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick'))) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.45;
                }
            }
            return orig.apply(this, args);
        };
    }
})();

