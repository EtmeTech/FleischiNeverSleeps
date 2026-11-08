import * as THREE from 'three';
import { FleischiMonster } from './FleischiMonster.js';

export class WhisperLibraryManager {
    constructor(scene, camera, player, audio, physics, onVictoryCallback, onCaughtCallback) {
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.audio = audio;
        this.physics = physics;
        this.onVictoryCallback = onVictoryCallback;
        this.onCaughtCallback = onCaughtCallback;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        // DEUTLICH GRÖSSERE BIBLIOTHEK: 12 Spalten x 16 Reihen (40.8m x 54.4m) mit 5 Sektoren & 5 Geheimgängen!
        this.cols = 12;
        this.rows = 16;
        this.cellSize = 3.4;
        this.shelfHeight = 5.4;
        this.originX = -(this.cols * this.cellSize) / 2; // -20.4m bis +20.4m
        this.originZ = 0.0;                              // 0.0m bis -54.4m

        this.isEnteringWalk = true;
        this.enterWalkProgress = 0;
        this.entranceDoorClosing = false;
        this.entranceDoorAngle = Math.PI * 0.58;
        this.hasWalkedInside = false;

        this.staticWalls = [];
        this.secretBookcases = [];
        this.sconceLevers = [];
        this.sconceHitMeshes = [];
        this.glassPatches = [];
        this.candleFlames = [];
        this.floatingCursedBooks = [];
        this.libraryFleischis = [];

        this.glassSoundCooldown = 0;
        this.spawnGraceTimer = 2.0;
        this.time = 0;

        this.lastCheckpointPos = new THREE.Vector3(this.cellCenterX(5), 0.0, this.cellCenterZ(0));
        this.exitPortalPos = null;

        this.minimapContainer = document.getElementById('minimap-container');
        this.minimapHeader = document.getElementById('minimap-header');
        this.minimapLegend = document.getElementById('minimap-legend');
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

        this.initMaterials();
        this.buildWhisperLibrary();
    }

    gridVertexX(gx) {
        return this.originX + gx * this.cellSize;
    }

    gridVertexZ(gz) {
        return this.originZ - gz * this.cellSize;
    }

    cellCenterX(cx) {
        return this.originX + (cx + 0.5) * this.cellSize;
    }

    cellCenterZ(cz) {
        return this.originZ - (cz + 0.5) * this.cellSize;
    }

    initMaterials() {
        const bookCanvas = document.createElement('canvas');
        bookCanvas.width = 1024;
        bookCanvas.height = 1024;
        const bctx = bookCanvas.getContext('2d');

        bctx.fillStyle = '#0a0403';
        bctx.fillRect(0, 0, 1024, 1024);

        const numShelves = 6;
        const shelfH = Math.floor(1024 / numShelves);
        const bookColors = [
            '#3d110e', '#1b2e1e', '#182338', '#422a14',
            '#2e152b', '#4d1914', '#261c14', '#162929', '#382c1e'
        ];

        for (let s = 0; s < numShelves; s++) {
            const topY = s * shelfH;
            const shelfBoardY = topY + shelfH - 22;

            const backGrad = bctx.createLinearGradient(0, topY, 0, shelfBoardY);
            backGrad.addColorStop(0, '#040101');
            backGrad.addColorStop(0.25, '#140905');
            backGrad.addColorStop(1, '#070201');
            bctx.fillStyle = backGrad;
            bctx.fillRect(16, topY + 6, 992, shelfH - 28);

            let x = 20;
            while (x < 995) {
                const bw = Math.floor(Math.random() * 22) + 18;
                if (x + bw > 1002) break;
                const bh = Math.floor(Math.random() * 26) + (shelfH - 58);
                const by = shelfBoardY - bh;

                const baseColor = bookColors[Math.floor(Math.random() * bookColors.length)];
                bctx.fillStyle = baseColor;
                bctx.fillRect(x, by, bw - 2, bh);

                const spineGrad = bctx.createLinearGradient(x, 0, x + bw - 2, 0);
                spineGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
                spineGrad.addColorStop(0.35, 'rgba(255,220,180,0.12)');
                spineGrad.addColorStop(0.7, 'rgba(0,0,0,0.15)');
                spineGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
                bctx.fillStyle = spineGrad;
                bctx.fillRect(x, by, bw - 2, bh);

                bctx.fillStyle = 'rgba(212, 175, 55, 0.75)';
                bctx.fillRect(x + 3, by + 14, bw - 8, 3);
                bctx.fillRect(x + 3, by + bh - 18, bw - 8, 3);

                x += bw;
            }

            const topShadow = bctx.createLinearGradient(0, topY, 0, topY + 28);
            topShadow.addColorStop(0, 'rgba(0,0,0,0.92)');
            topShadow.addColorStop(1, 'rgba(0,0,0,0.0)');
            bctx.fillStyle = topShadow;
            bctx.fillRect(16, topY, 992, 28);

            bctx.fillStyle = '#281309';
            bctx.fillRect(0, shelfBoardY, 1024, 22);
            bctx.fillStyle = '#422010';
            bctx.fillRect(0, shelfBoardY + 2, 1024, 5);
            bctx.fillStyle = '#100603';
            bctx.fillRect(0, shelfBoardY + 18, 1024, 4);
        }

        bctx.fillStyle = '#210e06';
        bctx.fillRect(0, 0, 18, 1024);
        bctx.fillRect(1006, 0, 18, 1024);

        const bookTex = new THREE.CanvasTexture(bookCanvas);
        bookTex.colorSpace = THREE.SRGBColorSpace;
        bookTex.wrapS = THREE.RepeatWrapping;
        bookTex.wrapT = THREE.RepeatWrapping;

        const faceImg = new Image();
        faceImg.src = "assets/textures/fleischi_face.png";
        faceImg.onload = () => {
            for (let s = 0; s < numShelves; s++) {
                const shelfBoardY = (s + 1) * shelfH - 22;
                let bxPos = 22;
                while (bxPos < 985) {
                    const iconW = 20;
                    const iconH = 26;
                    const iconX = bxPos + 2;
                    const iconY = shelfBoardY - 78;

                    bctx.fillStyle = "rgba(212, 175, 55, 0.85)";
                    bctx.fillRect(iconX - 1, iconY - 1, iconW + 2, iconH + 2);
                    bctx.drawImage(faceImg, iconX, iconY, iconW, iconH);

                    bctx.fillStyle = "rgba(0, 0, 0, 0.25)";
                    bctx.fillRect(iconX, iconY, 3, iconH);
                    bctx.fillRect(iconX + iconW - 3, iconY, 3, iconH);

                    bxPos += 28;
                }
            }
            bookTex.needsUpdate = true;
        };

        this.bookshelfMat = new THREE.MeshStandardMaterial({
            map: bookTex,
            bumpMap: bookTex,
            bumpScale: 0.035,
            roughness: 0.68,
            metalness: 0.08
        });

        this.secretShelfMat = new THREE.MeshStandardMaterial({
            map: bookTex,
            bumpMap: bookTex,
            bumpScale: 0.035,
            color: 0xffd2bb,
            roughness: 0.58,
            metalness: 0.12
        });

        const woodCanvas = document.createElement('canvas');
        woodCanvas.width = 256;
        woodCanvas.height = 512;
        const wctx = woodCanvas.getContext('2d');
        wctx.fillStyle = '#1c0c05';
        wctx.fillRect(0, 0, 256, 512);
        wctx.strokeStyle = '#30170b';
        wctx.lineWidth = 6;
        wctx.strokeRect(14, 14, 228, 484);
        const woodTex = new THREE.CanvasTexture(woodCanvas);
        this.pillarWoodMat = new THREE.MeshStandardMaterial({
            map: woodTex,
            roughness: 0.55,
            metalness: 0.1
        });

        const floorCanvas = document.createElement('canvas');
        floorCanvas.width = 512;
        floorCanvas.height = 512;
        const fctx = floorCanvas.getContext('2d');
        fctx.fillStyle = '#140b07';
        fctx.fillRect(0, 0, 512, 512);
        for (let y = 0; y < 512; y += 32) {
            for (let x = 0; x < 512; x += 64) {
                fctx.fillStyle = ((x / 64 + y / 32) % 2 === 0) ? '#1b100a' : '#120a06';
                fctx.fillRect(x + 1, y + 1, 62, 30);
            }
        }
        const floorTex = new THREE.CanvasTexture(floorCanvas);
        floorTex.wrapS = THREE.RepeatWrapping;
        floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(20, 28);
        this.floorMat = new THREE.MeshStandardMaterial({
            map: floorTex,
            roughness: 0.65,
            metalness: 0.08
        });

        const ceilCanvas = document.createElement('canvas');
        ceilCanvas.width = 256;
        ceilCanvas.height = 256;
        const cctx = ceilCanvas.getContext('2d');
        cctx.fillStyle = '#090402';
        cctx.fillRect(0, 0, 256, 256);
        cctx.strokeStyle = '#1c0e07';
        cctx.lineWidth = 14;
        cctx.strokeRect(10, 10, 236, 236);
        const ceilTex = new THREE.CanvasTexture(ceilCanvas);
        ceilTex.wrapS = THREE.RepeatWrapping;
        ceilTex.wrapT = THREE.RepeatWrapping;
        ceilTex.repeat.set(20, 28);
        this.ceilingMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.85 });

        this.glassMat = new THREE.MeshStandardMaterial({
            color: 0xdff8ff,
            emissive: 0x1a3a4a,
            roughness: 0.06,
            metalness: 0.94,
            transparent: true,
            opacity: 0.86
        });

        this.bottleGlassMat = new THREE.MeshStandardMaterial({
            color: 0x338855,
            emissive: 0x092214,
            roughness: 0.1,
            metalness: 0.85,
            transparent: true,
            opacity: 0.88
        });

        const puddleCanvas = document.createElement('canvas');
        puddleCanvas.width = 256;
        puddleCanvas.height = 256;
        const pctx = puddleCanvas.getContext('2d');
        const radGrad = pctx.createRadialGradient(128, 128, 8, 128, 128, 122);
        radGrad.addColorStop(0.0, 'rgba(60, 5, 5, 0.82)');
        radGrad.addColorStop(0.45, 'rgba(35, 4, 4, 0.55)');
        radGrad.addColorStop(0.8, 'rgba(120, 190, 220, 0.18)');
        radGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
        pctx.fillStyle = radGrad;
        pctx.beginPath();
        pctx.arc(128, 128, 124, 0, Math.PI * 2);
        pctx.fill();

        pctx.strokeStyle = 'rgba(200, 240, 255, 0.35)';
        pctx.lineWidth = 1.5;
        for (let i = 0; i < 36; i++) {
            const ang = (i / 36) * Math.PI * 2 + Math.random() * 0.1;
            const r1 = 15 + Math.random() * 25;
            const r2 = r1 + 25 + Math.random() * 55;
            pctx.beginPath();
            pctx.moveTo(128 + Math.cos(ang) * r1, 128 + Math.sin(ang) * r1);
            pctx.lineTo(128 + Math.cos(ang) * r2, 128 + Math.sin(ang) * r2);
            pctx.stroke();
        }
        const puddleTex = new THREE.CanvasTexture(puddleCanvas);
        this.circularSpillMat = new THREE.MeshBasicMaterial({
            map: puddleTex,
            transparent: true,
            depthWrite: false
        });

        const webCanvas = document.createElement('canvas');
        webCanvas.width = 512;
        webCanvas.height = 512;
        const wbCtx = webCanvas.getContext('2d');
        wbCtx.strokeStyle = 'rgba(220, 220, 230, 0.38)';
        wbCtx.lineWidth = 1.8;
        for (let i = 0; i <= 16; i++) {
            const ang = (i / 16) * Math.PI * 2;
            wbCtx.beginPath();
            wbCtx.moveTo(256, 256);
            wbCtx.lineTo(256 + Math.cos(ang) * 250, 256 + Math.sin(ang) * 250);
            wbCtx.stroke();
        }
        for (let r = 28; r < 250; r += 28) {
            wbCtx.beginPath();
            wbCtx.arc(256, 256, r, 0, Math.PI * 2);
            wbCtx.stroke();
        }
        const webTex = new THREE.CanvasTexture(webCanvas);
        this.cobwebMat = new THREE.MeshBasicMaterial({
            map: webTex,
            transparent: true,
            alphaTest: 0.04,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.brassMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            emissive: 0x332200,
            roughness: 0.25,
            metalness: 0.88
        });

        this.darkIronMat = new THREE.MeshStandardMaterial({
            color: 0x1c1c20,
            roughness: 0.45,
            metalness: 0.8
        });
    }

    edgeKey(c1, r1, c2, r2) {
        if (c1 < c2 || (c1 === c2 && r1 < r2)) {
            return `${c1},${r1}-${c2},${r2}`;
        }
        return `${c2},${r2}-${c1},${r1}`;
    }

    addPathChain(edgeSet, cells) {
        for (let i = 0; i < cells.length - 1; i++) {
            const [c1, r1] = cells[i];
            const [c2, r2] = cells[i + 1];
            edgeSet.add(this.edgeKey(c1, r1, c2, r2));
        }
    }

    buildWhisperLibrary() {
        const minX = this.originX - 0.3;
        const maxX = -this.originX + 0.3;
        const minZ = this.originZ - this.rows * this.cellSize - 0.3;
        const maxZ = this.originZ + 2.5;

        this.physics.setMode('library', { minX, maxX, minZ, maxZ });
        this.scene.fog = new THREE.FogExp2(0x060202, 0.068);

        if (this.minimapContainer) {
            this.minimapContainer.style.display = 'block';
        }
        if (this.minimapHeader) {
            this.minimapHeader.innerText = 'Bibliothek';
        }
        if (this.minimapLegend) {
            this.minimapLegend.innerHTML = `
        <span style="color:#ffaa00; display:inline-flex; align-items:center; gap:4px;"><svg width="10" height="10"><rect width="10" height="10" fill="#ffaa00"/></svg>Geheimwand</span>
        <span style="color:#66ccff; display:inline-flex; align-items:center; gap:4px;"><svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="#66ccff"/></svg>Scherben</span>
        <span style="color:#ff3333; display:inline-flex; align-items:center; gap:4px;"><svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="#ff3333"/></svg>Fleischi</span>
    `;
        }

        const startX = this.cellCenterX(5);
        this.player.groundY = 0.0;
        this.player.footY = 0.0;
        this.player.waterPenalty = 1.0;
        this.player.position.set(startX, 1.6, 1.8);
        this.camera.position.set(startX, 1.6, 1.8);

        const ambLight = new THREE.AmbientLight(0x20100c, 0.38);
        this.group.add(ambLight);

        this.playerLight = new THREE.PointLight(0xff9944, 1.8, 12.0);
        this.group.add(this.playerLight);

        const totalW = this.cols * this.cellSize;
        const totalD = this.rows * this.cellSize;
        const centerZ = -totalD / 2;

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 4, totalD + 6), this.floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0.0, centerZ);
        this.group.add(floor);
        this.physics.addRamp(minX - 2, maxX + 2, minZ - 2, maxZ + 2, 0.0, 0.0, 'z');

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 4, totalD + 6), this.ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, this.shelfHeight, centerZ);
        this.group.add(ceiling);

        const openEdges = new Set();

        // Sektor 1 (Reihen 0..3):
        this.addPathChain(openEdges, [[5,0], [4,0], [3,0], [2,0], [1,0], [0,0], [0,1], [0,2], [1,2], [2,2], [3,2], [4,2], [5,2], [5,1], [5,0]]);
        this.addPathChain(openEdges, [[2,0], [2,1], [3,1], [4,1]]);
        this.addPathChain(openEdges, [[5,1], [6,1], [7,1], [7,0], [8,0], [9,0], [10,0], [11,0], [11,1], [11,2], [10,2], [9,2], [8,2], [7,2], [6,2], [5,2]]);
        this.addPathChain(openEdges, [[9,0], [9,1], [10,1]]);

        // Sektor 2 (Reihen 3..6):
        this.addPathChain(openEdges, [[9,3], [10,3], [11,3], [11,4], [11,5], [10,5], [9,5], [8,5], [8,4], [9,4], [9,3]]);
        this.addPathChain(openEdges, [[8,4], [7,4], [6,4], [6,3], [5,3], [4,3], [4,4], [5,4], [5,5], [6,5], [7,5], [8,5]]);
        this.addPathChain(openEdges, [[4,4], [3,4], [2,4], [2,3], [1,3], [0,3], [0,4], [0,5], [1,5], [2,5], [3,5], [4,5], [4,4]]);
        this.addPathChain(openEdges, [[1,3], [1,4], [2,4]]);

        // Sektor 3 (Reihen 6..9):
        this.addPathChain(openEdges, [[2,6], [1,6], [0,6], [0,7], [0,8], [1,8], [2,8], [3,8], [3,7], [2,7], [2,6]]);
        this.addPathChain(openEdges, [[3,7], [4,7], [4,6], [5,6], [6,6], [6,7], [5,7], [5,8], [4,8], [3,8]]);
        this.addPathChain(openEdges, [[6,7], [7,7], [7,6], [8,6], [9,6], [10,6], [11,6], [11,7], [11,8], [10,8], [9,8], [8,8], [7,8], [7,7]]);
        this.addPathChain(openEdges, [[9,6], [9,7], [10,7]]);

        // Sektor 4 (Reihen 9..12):
        this.addPathChain(openEdges, [[8,9], [9,9], [10,9], [11,9], [11,10], [11,11], [10,11], [9,11], [8,11], [8,10], [8,9]]);
        this.addPathChain(openEdges, [[8,10], [7,10], [6,10], [6,9], [5,9], [4,9], [4,10], [5,10], [5,11], [6,11], [7,11], [8,11]]);
        this.addPathChain(openEdges, [[4,10], [3,10], [2,10], [2,9], [1,9], [0,9], [0,10], [0,11], [1,11], [2,11], [3,11], [4,11], [4,10]]);
        this.addPathChain(openEdges, [[9,10], [10,10], [10,11]]);

        // Sektor 5 (Reihen 12..15):
        this.addPathChain(openEdges, [[3,12], [2,12], [1,12], [0,12], [0,13], [0,14], [0,15], [1,15], [2,15], [3,15], [3,14], [3,13], [3,12]]);
        this.addPathChain(openEdges, [[1,13], [2,13], [2,14], [1,14], [1,13]]);
        this.addPathChain(openEdges, [[3,14], [4,14], [4,13], [4,12], [5,12], [6,12], [6,13], [6,14], [6,15], [5,15], [4,15], [4,14]]);
        this.addPathChain(openEdges, [[6,13], [7,13], [7,12], [8,12], [9,12], [10,12], [11,12], [11,13], [11,14], [11,15], [10,15], [9,15], [8,15], [7,15], [7,14], [7,13]]);
        this.addPathChain(openEdges, [[8,13], [9,13], [10,13], [10,14], [9,14], [8,14], [8,13]]);
        this.addPathChain(openEdges, [[9,14], [9,15]]);

        const secretDoorMap = new Map();
        secretDoorMap.set(this.edgeKey(9, 2, 9, 3), { id: 1, slideAxis: 'x', slideDist: -2.75 });
        secretDoorMap.set(this.edgeKey(2, 5, 2, 6), { id: 2, slideAxis: 'x', slideDist: 2.75 });
        secretDoorMap.set(this.edgeKey(8, 8, 8, 9), { id: 3, slideAxis: 'x', slideDist: -2.75 });
        secretDoorMap.set(this.edgeKey(3, 11, 3, 12), { id: 4, slideAxis: 'x', slideDist: 2.75 });

        this.buildNonOverlappingBookshelfMaze(openEdges, secretDoorMap);
        this.buildEntranceDoorway(startX);
        this.buildSecretExitBookcase(this.cellCenterX(9), this.gridVertexZ(16));

        this.addSecretWallChandelierAndSconce(
            this.gridVertexX(10), this.gridVertexZ(3) + 0.29,
            this.cellCenterX(9), this.gridVertexZ(3) + 1.15,
            0, 1, "GEHEIMGANG 1/5 GEÖFFNET!"
        );
        this.addSecretWallChandelierAndSconce(
            this.gridVertexX(2), this.gridVertexZ(6) + 0.29,
            this.cellCenterX(2), this.gridVertexZ(6) + 1.15,
            0, 2, "GEHEIMGANG 2/5 GEÖFFNET!"
        );
        this.addSecretWallChandelierAndSconce(
            this.gridVertexX(9), this.gridVertexZ(9) + 0.29,
            this.cellCenterX(8), this.gridVertexZ(9) + 1.15,
            0, 3, "GEHEIMGANG 3/5 GEÖFFNET!"
        );
        this.addSecretWallChandelierAndSconce(
            this.gridVertexX(3), this.gridVertexZ(12) + 0.29,
            this.cellCenterX(3), this.gridVertexZ(12) + 1.15,
            0, 4, "GEHEIMGANG 4/5 GEÖFFNET!"
        );
        this.addSecretWallChandelierAndSconce(
            this.gridVertexX(10), this.gridVertexZ(16) + 0.29,
            this.cellCenterX(9), this.gridVertexZ(16) + 1.15,
            0, 5, "DAS FINALE AUSGANGS-REGAL 5/5 IST OFFEN!"
        );

        const shardCells = [
            [2, 0], [0, 2], [7, 1], [10, 2],
            [10, 4], [6, 4], [4, 4], [1, 5],
            [1, 7], [4, 7], [9, 6], [10, 8],
            [10, 10], [6, 10], [2, 10], [1, 11],
            [1, 14], [5, 13], [8, 13], [10, 14]
        ];
        for (const [scx, scz] of shardCells) {
            this.addCircularBottleShardField(this.cellCenterX(scx), this.cellCenterZ(scz));
        }

        this.buildLibraryCobwebsAndCursedBooks();
        this.spawnWhisperFleischis();
    }

    buildNonOverlappingBookshelfMaze(openEdges, secretDoorMap) {
        const H = this.shelfHeight;
        const pillarSize = 0.56;
        const wallLen = this.cellSize - pillarSize;
        const wallThick = 0.50;

        const pillarGeo = new THREE.BoxGeometry(pillarSize, H, pillarSize);
        for (let gx = 0; gx <= this.cols; gx++) {
            for (let gz = 0; gz <= this.rows; gz++) {
                const px = this.gridVertexX(gx);
                const pz = this.gridVertexZ(gz);
                const pillar = new THREE.Mesh(pillarGeo, this.pillarWoodMat);
                pillar.position.set(px, H / 2, pz);
                this.group.add(pillar);
                this.physics.addObstacle(px - pillarSize / 2, px + pillarSize / 2, pz - pillarSize / 2, pz + pillarSize / 2, -1, H + 1);
            }
        }

        const horizWallGeo = new THREE.BoxGeometry(wallLen, H, wallThick);
        const vertWallGeo = new THREE.BoxGeometry(wallThick, H, wallLen);

        for (let gz = 0; gz <= this.rows; gz++) {
            for (let cx = 0; cx < this.cols; cx++) {
                if (gz === 0 && cx === 5) continue;
                if (gz === this.rows && cx === 9) continue;

                const isOuter = (gz === 0 || gz === this.rows);
                const key = this.edgeKey(cx, gz - 1, cx, gz);
                const isOpen = !isOuter && openEdges.has(key);

                if (!isOpen) {
                    const wx = this.cellCenterX(cx);
                    const wz = this.gridVertexZ(gz);
                    const secretInfo = secretDoorMap.get(key);

                    if (secretInfo) {
                        this.createSlidingSecretBookcase(wx, wz, wallLen, H, wallThick, secretInfo);
                    } else {
                        const mesh = new THREE.Mesh(horizWallGeo, this.bookshelfMat);
                        mesh.position.set(wx, H / 2, wz);
                        this.group.add(mesh);
                        this.registerStaticWall(wx, wz, wallLen, wallThick, H);
                    }
                }
            }
        }

        for (let gx = 0; gx <= this.cols; gx++) {
            for (let cz = 0; cz < this.rows; cz++) {
                const isOuter = (gx === 0 || gx === this.cols);
                const key = this.edgeKey(gx - 1, cz, gx, cz);
                const isOpen = !isOuter && openEdges.has(key);

                if (!isOpen) {
                    const wx = this.gridVertexX(gx);
                    const wz = this.cellCenterZ(cz);
                    const secretInfo = secretDoorMap.get(key);

                    if (secretInfo) {
                        this.createSlidingSecretBookcase(wx, wz, wallThick, H, wallLen, secretInfo);
                    } else {
                        const mesh = new THREE.Mesh(vertWallGeo, this.bookshelfMat);
                        mesh.position.set(wx, H / 2, wz);
                        this.group.add(mesh);
                        this.registerStaticWall(wx, wz, wallThick, wallLen, H);
                    }
                }
            }
        }
    }

    registerStaticWall(x, z, w, d, h) {
        const minX = x - w / 2;
        const maxX = x + w / 2;
        const minZ = z - d / 2;
        const maxZ = z + d / 2;
        const obs = this.physics.addObstacle(minX, maxX, minZ, maxZ, -1, h + 1);
        this.staticWalls.push({ x, z, w, d, minX, maxX, minZ, maxZ, obs });
    }

    createSlidingSecretBookcase(x, z, w, h, d, secretInfo) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.04, d - 0.06), this.secretShelfMat);
        mesh.position.set(x, h / 2, z);
        this.group.add(mesh);

        const obs = this.physics.addObstacle(x - w / 2, x + w / 2, z - d / 2, z + d / 2, -1, h + 1);

        this.secretBookcases.push({
            id: secretInfo.id,
            mesh,
            obs,
            baseX: x,
            baseZ: z,
            currentX: x,
            currentZ: z,
            w,
            d,
            slideAxis: secretInfo.slideAxis,
            slideDist: secretInfo.slideDist,
            isOpen: false,
            progress: 0
        });
    }

    buildEntranceDoorway(startX) {
        const topShelf = new THREE.Mesh(new THREE.BoxGeometry(2.84, 2.9, 0.50), this.bookshelfMat);
        topShelf.position.set(startX, 3.95, 0.0);
        this.group.add(topShelf);

        const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.5, 0.52), this.pillarWoodMat);
        jambL.position.set(startX - 1.05, 1.25, 0.0);
        const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.5, 0.52), this.pillarWoodMat);
        jambR.position.set(startX + 1.05, 1.25, 0.0);
        this.group.add(jambL, jambR);

        this.physics.addObstacle(startX - 1.6, startX + 1.6, -0.25, 0.35, -1, 5);

        this.entranceDoorHinge = new THREE.Group();
        this.entranceDoorHinge.position.set(startX - 0.65, 0, -0.05);
        this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;

        const doorPanel = new THREE.Mesh(
            new THREE.BoxGeometry(1.3, 2.48, 0.10),
            new THREE.MeshStandardMaterial({ color: 0x361a0c, roughness: 0.55 })
        );
        doorPanel.position.set(0.65, 1.24, 0);
        this.entranceDoorHinge.add(doorPanel);
        this.group.add(this.entranceDoorHinge);
    }

    buildSecretExitBookcase(exitX, exitZ) {
        const portalAlcove = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 3.8, 1.2),
            new THREE.MeshBasicMaterial({ color: 0x031408, side: THREE.BackSide })
        );
        portalAlcove.position.set(exitX, 1.9, exitZ - 0.6);
        this.group.add(portalAlcove);

        const portalPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(2.6, 3.6),
            new THREE.MeshBasicMaterial({ color: 0x00ff66, side: THREE.DoubleSide })
        );
        portalPlane.position.set(exitX, 1.8, exitZ - 0.35);
        this.group.add(portalPlane);

        const portalLight = new THREE.PointLight(0x00ff66, 5.0, 14);
        portalLight.position.set(exitX, 2.4, exitZ + 0.6);
        this.group.add(portalLight);

        this.createSlidingSecretBookcase(exitX, exitZ, 2.84, this.shelfHeight, 0.50, {
            id: 5,
            slideAxis: 'x',
            slideDist: -2.75
        });

        this.exitPortalPos = new THREE.Vector3(exitX, 0.0, exitZ - 0.15);
    }

    addSecretWallChandelierAndSconce(sconceX, sconceZ, chandelierX, chandelierZ, rotY, targetSecretId, hudMessage) {
        const chandGroup = new THREE.Group();
        chandGroup.position.set(chandelierX, this.shelfHeight - 1.1, chandelierZ);

        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), this.darkIronMat);
        chain.position.y = 0.55;
        chandGroup.add(chain);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.04, 12, 24), this.brassMat);
        ring.rotation.x = Math.PI / 2;
        chandGroup.add(ring);

        const chandWeb = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), this.cobwebMat);
        chandWeb.position.y = 0.25;
        // cobweb removed

        const chandFlames = [];
        for (let c = 0; c < 6; c++) {
            const ang = (c / 6) * Math.PI * 2;
            const cx = Math.cos(ang) * 0.52;
            const cz = Math.sin(ang) * 0.52;

            const candle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03, 0.03, 0.18, 10),
                new THREE.MeshStandardMaterial({ color: 0xf5ebd6, roughness: 0.6 })
            );
            candle.position.set(cx, 0.10, cz);
            chandGroup.add(candle);

            const cFlameMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
            const cFlame = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 8), cFlameMat);
            cFlame.position.set(cx, 0.23, cz);
            chandGroup.add(cFlame);
            this.candleFlames.push(cFlame);
            chandFlames.push(cFlameMat);
        }

        const chandLight = new THREE.PointLight(0xff8822, 2.5, 13.0);
        chandLight.position.y = -0.15;
        chandGroup.add(chandLight);
        this.group.add(chandGroup);

        const sconceGroup = new THREE.Group();
        sconceGroup.position.set(sconceX, 1.50, sconceZ);
        sconceGroup.rotation.y = rotY;

        const backPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), this.brassMat);
        backPlate.rotation.x = Math.PI / 2;
        backPlate.position.z = 0.02;
        sconceGroup.add(backPlate);

        const leverPivot = new THREE.Group();
        leverPivot.position.set(0, -0.04, 0.04);
        sconceGroup.add(leverPivot);

        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.34, 12), this.brassMat);
        arm.rotation.x = Math.PI / 3;
        arm.position.set(0, 0.10, 0.14);
        leverPivot.add(arm);

        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.05, 14), this.brassMat);
        cup.position.set(0, 0.20, 0.26);
        leverPivot.add(cup);

        const candle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.038, 0.04, 0.22, 12),
            new THREE.MeshStandardMaterial({ color: 0xf5ebd6, roughness: 0.6 })
        );
        candle.position.set(0, 0.32, 0.26);
        leverPivot.add(candle);

        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 10), flameMat);
        flame.position.set(0, 0.47, 0.26);
        leverPivot.add(flame);
        this.candleFlames.push(flame);

        const sconceLight = new THREE.PointLight(0xff8822, 2.2, 8.5);
        sconceLight.position.set(0, 0.52, 0.32);
        leverPivot.add(sconceLight);

        const hitBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.85, 0.65),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        hitBox.position.set(0, 0.20, 0.18);
        sconceGroup.add(hitBox);

        const chandHitBox = new THREE.Mesh(
            new THREE.CylinderGeometry(0.75, 0.75, 1.4, 12),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        chandGroup.add(chandHitBox);

        const checkpointPos = new THREE.Vector3(chandelierX, 0.0, chandelierZ);

        const sconceData = {
            id: targetSecretId,
            x: sconceX,
            z: sconceZ,
            group: sconceGroup,
            leverPivot,
            flameMat,
            chandFlames,
            sconceLight,
            chandLight,
            checkpointPos,
            hudMessage,
            pulled: false,
            pullProgress: 0
        };

        hitBox.userData.sconceData = sconceData;
        chandHitBox.userData.sconceData = sconceData;
        backPlate.userData.sconceData = sconceData;
        arm.userData.sconceData = sconceData;
        candle.userData.sconceData = sconceData;
        ring.userData.sconceData = sconceData;

        this.group.add(sconceGroup);
        this.sconceLevers.push(sconceData);
        this.sconceHitMeshes.push(hitBox, chandHitBox, backPlate, arm, candle, ring);
    }

    addCircularBottleShardField(x, z) {
        const radius = 1.15;
        const patchGroup = new THREE.Group();
        patchGroup.position.set(x, 0.012, z);

        const spillCircle = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), this.circularSpillMat);
        spillCircle.rotation.x = -Math.PI / 2;
        spillCircle.position.y = 0.003;
        patchGroup.add(spillCircle);

        const bottleBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.075, 0.075, 0.14, 12, 1, true),
            this.bottleGlassMat
        );
        bottleBase.rotation.z = Math.PI / 2.2;
        bottleBase.rotation.y = Math.random() * Math.PI;
        bottleBase.position.set(0.05, 0.06, -0.04);
        patchGroup.add(bottleBase);

        const bottleNeck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028, 0.055, 0.12, 10),
            this.bottleGlassMat
        );
        bottleNeck.rotation.x = Math.PI / 2.1;
        bottleNeck.position.set(-0.12, 0.04, 0.08);
        patchGroup.add(bottleNeck);

        const shardGeo = new THREE.ConeGeometry(0.12, 0.032, 3);
        for (let i = 0; i < 38; i++) {
            const angle = (i / 38) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
            const dist = Math.pow(Math.random(), 0.65) * (radius - 0.12);
            const rx = Math.cos(angle) * dist;
            const rz = Math.sin(angle) * dist;

            const shard = new THREE.Mesh(shardGeo, i % 4 === 0 ? this.bottleGlassMat : this.glassMat);
            shard.position.set(rx, 0.012, rz);
            shard.rotation.y = angle + Math.random();
            shard.scale.set(0.6 + Math.random() * 1.1, 1.0, 0.4 + Math.random() * 0.9);
            patchGroup.add(shard);
        }

        const glintLight = new THREE.PointLight(0x88ddff, 0.85, 3.0);
        glintLight.position.set(0, 0.32, 0);
        patchGroup.add(glintLight);

        this.group.add(patchGroup);
        this.glassPatches.push({ x, z, radius: 1.05 });
    }

    buildLibraryCobwebsAndCursedBooks() {
        for (let cx = 0; cx < this.cols; cx += 2) {
            for (let cz = 0; cz < this.rows; cz += 2) {
                const wx = this.cellCenterX(cx);
                const wz = this.cellCenterZ(cz);
                const web = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.2), this.cobwebMat);
                web.position.set(wx, 4.15, wz);
                web.rotation.y = (cx + cz) % 4 === 0 ? Math.PI / 4 : -Math.PI / 4;
                web.rotation.x = 0.25;
                // cobweb removed
            }
        }

        const bookCoverMat = new THREE.MeshStandardMaterial({ color: 0x3a0606, emissive: 0x220000, roughness: 0.5 });
        const pageMat = new THREE.MeshBasicMaterial({ color: 0xe8dac0 });
        const cursedSpots = [
            [1, 1], [8, 1], [5, 4], [1, 8], [10, 7], [5, 10], [1, 13], [9, 13]
        ];

        for (const [bx, bz] of cursedSpots) {
            const bookGroup = new THREE.Group();
            const px = this.cellCenterX(bx);
            const pz = this.cellCenterZ(bz);
            bookGroup.position.set(px, 2.25, pz);

            const coverL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.38), bookCoverMat);
            coverL.position.x = -0.13;
            coverL.rotation.z = 0.35;
            const coverR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.38), bookCoverMat);
            coverR.position.x = 0.13;
            coverR.rotation.z = -0.35;
            const pages = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.34), pageMat);
            pages.position.y = 0.02;
            bookGroup.add(coverL, coverR, pages);

            const redGlow = new THREE.PointLight(0xff1100, 1.4, 6.5);
            redGlow.position.y = -0.15;
            bookGroup.add(redGlow);

            this.group.add(bookGroup);
            this.floatingCursedBooks.push({
                group: bookGroup,
                baseY: 2.25,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    spawnWhisperFleischis() {
        const patrolConfigs = [
            {
                minZ: this.gridVertexZ(3),
                maxZ: this.gridVertexZ(0),
                waypoints: [
                    new THREE.Vector3(this.cellCenterX(7), 0, this.cellCenterZ(0)),
                    new THREE.Vector3(this.cellCenterX(11), 0, this.cellCenterZ(0)),
                    new THREE.Vector3(this.cellCenterX(11), 0, this.cellCenterZ(2)),
                    new THREE.Vector3(this.cellCenterX(7), 0, this.cellCenterZ(2))
                ]
            },
            {
                minZ: this.gridVertexZ(6),
                maxZ: this.gridVertexZ(3),
                waypoints: [
                    new THREE.Vector3(this.cellCenterX(4), 0, this.cellCenterZ(3)),
                    new THREE.Vector3(this.cellCenterX(6), 0, this.cellCenterZ(3)),
                    new THREE.Vector3(this.cellCenterX(6), 0, this.cellCenterZ(5)),
                    new THREE.Vector3(this.cellCenterX(4), 0, this.cellCenterZ(5))
                ]
            },
            {
                minZ: this.gridVertexZ(9),
                maxZ: this.gridVertexZ(6),
                waypoints: [
                    new THREE.Vector3(this.cellCenterX(7), 0, this.cellCenterZ(6)),
                    new THREE.Vector3(this.cellCenterX(11), 0, this.cellCenterZ(6)),
                    new THREE.Vector3(this.cellCenterX(11), 0, this.cellCenterZ(8)),
                    new THREE.Vector3(this.cellCenterX(7), 0, this.cellCenterZ(8))
                ]
            },
            {
                minZ: this.gridVertexZ(12),
                maxZ: this.gridVertexZ(9),
                waypoints: [
                    new THREE.Vector3(this.cellCenterX(4), 0, this.cellCenterZ(9)),
                    new THREE.Vector3(this.cellCenterX(6), 0, this.cellCenterZ(9)),
                    new THREE.Vector3(this.cellCenterX(6), 0, this.cellCenterZ(11)),
                    new THREE.Vector3(this.cellCenterX(4), 0, this.cellCenterZ(11))
                ]
            },
            {
                minZ: this.gridVertexZ(16),
                maxZ: this.gridVertexZ(12),
                waypoints: [
                    new THREE.Vector3(this.cellCenterX(7), 0, this.cellCenterZ(12)),
                    new THREE.Vector3(this.cellCenterX(11), 0, this.cellCenterZ(12)),
                    new THREE.Vector3(this.cellCenterX(11), 0, this.cellCenterZ(15)),
                    new THREE.Vector3(this.cellCenterX(7), 0, this.cellCenterZ(15))
                ]
            }
        ];

        for (const cfg of patrolConfigs) {
            const entity = new FleischiMonster();
            const mGroup = entity.group;
            mGroup.position.copy(cfg.waypoints[0]);

            const warnLight = new THREE.PointLight(0xff2200, 2.8, 9.5);
            warnLight.position.set(0, 2.2, 0.4);
            mGroup.add(warnLight);

            this.group.add(mGroup);
            this.libraryFleischis.push({
                minZ: cfg.minZ,
                maxZ: cfg.maxZ,
                entity,
                group: mGroup,
                spawnPos: cfg.waypoints[0].clone(),
                waypoints: cfg.waypoints,
                wpIndex: 1,
                alertTarget: null,
                alertTimer: 0,
                patrolSpeed: 2.4,
                chaseSpeed: 4.6
            });
        }
    }

    hasLineOfSight(x1, z1, x2, z2) {
        const steps = 16;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const px = x1 + (x2 - x1) * t;
            const pz = z1 + (z2 - z1) * t;

            for (const w of this.staticWalls) {
                if (px >= w.minX - 0.15 && px <= w.maxX + 0.15 && pz >= w.minZ - 0.15 && pz <= w.maxZ + 0.15) {
                    return false;
                }
            }
            for (const sb of this.secretBookcases) {
                if (!sb.isOpen) {
                    if (
                        px >= sb.obs.minX - 0.15 && px <= sb.obs.maxX + 0.15 &&
                        pz >= sb.obs.minZ - 0.15 && pz <= sb.obs.maxZ + 0.15
                    ) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    getHoveredInteraction(raycaster) {
        const hits = raycaster.intersectObjects(this.sconceHitMeshes, false);
        if (hits.length > 0 && hits[0].distance < 3.8) {
            const sData = hits[0].object.userData.sconceData;
            if (sData && !sData.pulled) {
                return {
                    type: 'sconce',
                    data: sData,
                    prompt: '[E] Leuchter ziehen (Geheimregal hier öffnen)'
                };
            }
        }
        return null;
    }

    tryInteract(raycaster) {
        const hit = this.getHoveredInteraction(raycaster);
        if (hit && hit.type === 'sconce') {
            this.pullWallSconce(hit.data);
            return true;
        }
        return false;
    }

    pullWallSconce(sData) {
        if (sData.pulled) return;
        sData.pulled = true;
        this.lastCheckpointPos.copy(sData.checkpointPos);

        this.audio.playKeyPickup();
        this.audio.playSecretWallSlide();

        sData.flameMat.color.setHex(0x00ff66);
        sData.sconceLight.color.setHex(0x00ff66);
        sData.chandLight.color.setHex(0x00ff66);
        for (const cf of sData.chandFlames) {
            cf.color.setHex(0x00ff66);
        }

        for (const sb of this.secretBookcases) {
            if (sb.id === sData.id) {
                sb.isOpen = true;
            }
        }

        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = sData.hudMessage;
            hud.style.color = '#00ff88';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 2800);
        }
    }

    alertFleischisToGlassSound(soundX, soundZ) {
        this.audio.playGlassCrunch();

        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = "KLIRR! DU BIST AUF DIE FLASCHENSCHERBEN GETRETEN – FLEISCHI HAT DICH GEHÖRT!";
            hud.style.color = '#ff3333';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 2200);
        }

        for (const lf of this.libraryFleischis) {
            if (soundZ >= lf.minZ - 5.0 && soundZ <= lf.maxZ + 5.0) {
                lf.alertTarget = new THREE.Vector3(soundX, 0, soundZ);
                lf.alertTimer = 6.0;
            }
        }
    }

    resetOnCatch() {
        this.spawnGraceTimer = 2.2;
        const cp = this.lastCheckpointPos;
        this.player.groundY = 0.0;
        this.player.footY = 0.0;
        this.player.position.set(cp.x, 1.6, cp.z);
        this.camera.position.set(cp.x, 1.6, cp.z);

        for (const lf of this.libraryFleischis) {
            lf.group.position.copy(lf.spawnPos);
            lf.alertTarget = null;
            lf.alertTimer = 0;
            lf.entity.resetPose();
        }
    }

    drawMinimap() {
        if (!this.minimapCtx) return;
        const ctx = this.minimapCtx;
        const W = 244;
        const H = 244;

        ctx.fillStyle = '#080402';
        ctx.fillRect(0, 0, W, H);

        const toMapX = (x) => ((x + 28.0) / 56.0) * W;
        const toMapZ = (z) => ((z + 55.0) / 56.0) * H;
        const toScale = (len) => (len / 56.0) * W;

        ctx.fillStyle = '#7a5230';
        for (const w of this.staticWalls) {
            ctx.fillRect(
                toMapX(w.minX),
                toMapZ(w.minZ),
                Math.max(2.0, toScale(w.w)),
                Math.max(2.0, toScale(w.d))
            );
        }

        ctx.fillStyle = 'rgba(100, 210, 255, 0.5)';
        for (const gp of this.glassPatches) {
            ctx.beginPath();
            ctx.arc(toMapX(gp.x), toMapZ(gp.z), Math.max(2.8, toScale(gp.radius)), 0, Math.PI * 2);
            ctx.fill();
        }

        for (const sb of this.secretBookcases) {
            ctx.fillStyle = sb.isOpen ? '#00ff66' : '#ffaa00';
            ctx.fillRect(
                toMapX(sb.currentX - sb.w / 2),
                toMapZ(sb.currentZ - sb.d / 2),
                Math.max(4, toScale(sb.w)),
                Math.max(4, toScale(sb.d))
            );
        }

        if (this.exitPortalPos) {
            const ex = toMapX(this.exitPortalPos.x);
            const ez = toMapZ(this.exitPortalPos.z);
            ctx.fillStyle = '#00ff66';
            ctx.beginPath();
            ctx.arc(ex, ez, 5.0 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const lf of this.libraryFleischis) {
            const fx = toMapX(lf.group.position.x);
            const fz = toMapZ(lf.group.position.z);
            ctx.fillStyle = '#ff2222';
            ctx.beginPath();
            ctx.arc(fx, fz, 4.2, 0, Math.PI * 2);
            ctx.fill();
        }

        const px = toMapX(this.player.position.x);
        const pz = toMapZ(this.player.position.z);
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
        if (this.spawnGraceTimer > 0) this.spawnGraceTimer -= delta;
        if (this.glassSoundCooldown > 0) this.glassSoundCooldown -= delta;

        if (this.isEnteringWalk) {
            this.enterWalkProgress += delta * 1.45;
            const p = Math.min(1.0, this.enterWalkProgress);

            const startX = this.cellCenterX(5);
            const walkZ = 1.8 - p * 3.5;
            const bobY = Math.sin(p * Math.PI * 4.0) * 0.045;
            this.player.position.set(startX, 1.6, walkZ);
            this.camera.position.set(startX, 1.6 + bobY, walkZ);

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
                    hud.innerText = "FINDE DIE 5 KRONLEUCHTER-GEHEIMGÄNGE [E]! WEICHE DEN RUNDEN SCHERBEN-KREISEN AUS!";
                    hud.style.color = '#ffaa00';
                    hud.style.display = 'block';
                    setTimeout(() => { hud.style.display = 'none'; }, 5000);
                }
            } else {
                this.entranceDoorHinge.rotation.y = this.entranceDoorAngle;
            }
        }

        const pPos = this.player.position;
        this.playerLight.position.set(pPos.x, pPos.y + 0.6, pPos.z);

        for (let i = 0; i < this.candleFlames.length; i++) {
            const fl = this.candleFlames[i];
            const s = 0.9 + Math.sin(this.time * 16.0 + i * 3.1) * 0.18;
            fl.scale.set(s, 1.0 + Math.cos(this.time * 19.0 + i) * 0.2, s);
        }

        for (const cb of this.floatingCursedBooks) {
            cb.group.position.y = cb.baseY + Math.sin(this.time * 3.2 + cb.phase) * 0.16;
            cb.group.rotation.y += delta * 1.4;
            cb.group.rotation.z = Math.sin(this.time * 9.0 + cb.phase) * 0.12;
        }

        for (const sl of this.sconceLevers) {
            if (sl.pulled && sl.pullProgress < 1.0) {
                sl.pullProgress = Math.min(1.0, sl.pullProgress + delta * 3.2);
                sl.leverPivot.rotation.x = sl.pullProgress * 0.84;
            }
        }

        for (const sb of this.secretBookcases) {
            if (sb.isOpen && sb.progress < 1.0) {
                sb.progress = Math.min(1.0, sb.progress + delta * 1.15);
                const smooth = 1.0 - Math.pow(1.0 - sb.progress, 3);

                if (sb.slideAxis === 'x') {
                    sb.currentX = sb.baseX + sb.slideDist * smooth;
                } else {
                    sb.currentZ = sb.baseZ + sb.slideDist * smooth;
                }
                sb.mesh.position.set(sb.currentX, this.shelfHeight / 2, sb.currentZ);

                sb.obs.minX = sb.currentX - sb.w / 2;
                sb.obs.maxX = sb.currentX + sb.w / 2;
                sb.obs.minZ = sb.currentZ - sb.d / 2;
                sb.obs.maxZ = sb.currentZ + sb.d / 2;
            }
        }

        if (this.exitPortalPos) {
            const distToExit = Math.hypot(pPos.x - this.exitPortalPos.x, pPos.z - this.exitPortalPos.z);
            if (distToExit < 1.55) {
                if (this.minimapContainer) this.minimapContainer.style.display = 'none';
                this.audio.playKeyPickup();
                this.onVictoryCallback();
                return;
            }
        }

        const isMoving = this.player.keys.w || this.player.keys.a || this.player.keys.s || this.player.keys.d;
        if (this.hasWalkedInside && this.player.isGrounded && !this.player.keys.ctrl && isMoving && this.glassSoundCooldown <= 0) {
            for (const gp of this.glassPatches) {
                const dist = Math.hypot(pPos.x - gp.x, pPos.z - gp.z);
                if (dist < gp.radius) {
                    this.glassSoundCooldown = 1.8;
                    this.alertFleischisToGlassSound(gp.x, gp.z);
                    break;
                }
            }
        }

        if (this.hasWalkedInside && this.spawnGraceTimer <= 0) {
            for (const lf of this.libraryFleischis) {
                const mPos = lf.group.position;
                const horizDist = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);
                const inSector = pPos.z >= lf.minZ - 3.5 && pPos.z <= lf.maxZ + 3.5;

                const canSeePlayer = inSector && horizDist < 11.5 && this.hasLineOfSight(mPos.x, mPos.z, pPos.x, pPos.z);

                if (canSeePlayer) {
                    lf.alertTarget = new THREE.Vector3(pPos.x, 0, pPos.z);
                    lf.alertTimer = 4.0;
                }

                if (lf.alertTimer > 0) {
                    lf.alertTimer -= delta;
                } else {
                    lf.alertTarget = null;
                }

                const isChasing = lf.alertTarget !== null;
                lf.entity.animate(delta, isChasing, true);

                let targetPos;
                let moveSpeed;
                if (isChasing) {
                    targetPos = canSeePlayer ? new THREE.Vector3(pPos.x, 0, pPos.z) : lf.alertTarget;
                    moveSpeed = lf.chaseSpeed;
                } else {
                    targetPos = lf.waypoints[lf.wpIndex];
                    moveSpeed = lf.patrolSpeed;
                    if (Math.hypot(targetPos.x - mPos.x, targetPos.z - mPos.z) < 0.45) {
                        lf.wpIndex = (lf.wpIndex + 1) % lf.waypoints.length;
                        targetPos = lf.waypoints[lf.wpIndex];
                    }
                }

                const dir = new THREE.Vector3(targetPos.x - mPos.x, 0, targetPos.z - mPos.z);
                if (dir.lengthSq() > 0.001) {
                    dir.normalize();
                    const desiredPos = mPos.clone().addScaledVector(dir, moveSpeed * delta);
                    const resolvedPos = this.physics.resolveMovement(mPos, desiredPos, 0.38, 0.0);
                    mPos.x = resolvedPos.x;
                    mPos.z = resolvedPos.z;
                    lf.group.lookAt(targetPos.x, 0, targetPos.z);
                }

                if (horizDist <= 1.15) {
                    this.audio.playJumpscareSound();
                    if (this.onCaughtCallback) {
                        this.onCaughtCallback(lf.entity, lf.group);
                    }
                    return;
                }
            }
        }

        this.drawMinimap();
    }
}
