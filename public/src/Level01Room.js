import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { ProceduralTextures } from './ProceduralTextures.js';

export class Level01Room {
    constructor(scene, camera, physics, audio, onTriggerMidnightScare) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('gang', this), 350); }
        this.scene = scene;
        this.camera = camera;
        this.physics = physics;
        this.audio = audio;
        this.onTriggerMidnightScare = onTriggerMidnightScare;

        this.hasLaptopBeenRead = false;
        this.hasKey = false;
        this.isKeyInserted = false;
        this.clockActivated = false;
        this.isTerminalUnlockedOnDoor = false;
        this.formulaSolvedOnce = false;
        this.doorOpen = false;
        this.handBobTimer = 0;

        this.doorTerminalButtons = [];
        this.currentDisplayedFormula = "";
        this.currentTerminalStatus = "normal";

        this.roomGroup = new THREE.Group();
        this.scene.add(this.roomGroup);

        this.buildArchitecture();
        this.buildInteractiveFurniture();
        this.buildBedOnRightSide();
        this.buildRealisticAnalogClock();
        this.buildExitDoor();
        this.buildHeldKeyOnCamera();
    }

    createDetailedKeyMesh(scale = 1.0) {
        const keyGroup = new THREE.Group();
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            emissive: 0x553b00,
            metalness: 0.85,
            roughness: 0.2
        });

        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 12, 24), goldMat);
        bow.position.set(0, 0, -0.09);
        bow.rotation.x = Math.PI / 2;
        keyGroup.add(bow);

        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.16, 12), goldMat);
        shaft.rotation.x = Math.PI / 2;
        keyGroup.add(shaft);

        const bit1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.022), goldMat);
        bit1.position.set(0.016, 0, 0.055);
        const bit2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.018), goldMat);
        bit2.position.set(0.014, 0, 0.025);
        keyGroup.add(bit1, bit2);

        keyGroup.scale.setScalar(scale);
        return keyGroup;
    }

    buildArchitecture() {
        const floorMat = ProceduralTextures.createWoodFloor(4, 4);
        const wallMat = ProceduralTextures.createWallpaper(4, 1);
        const ceilingMat = ProceduralTextures.createCeiling(4, 4);

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, 2);
        this.roomGroup.add(floor);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 3, 2);
        this.roomGroup.add(ceiling);

        const southWall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), wallMat);
        southWall.position.set(0, 1.5, 4.1);
        const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 4), wallMat);
        westWall.position.set(-2.6, 1.5, 2);
        const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 4), wallMat);
        eastWall.position.set(2.6, 1.5, 2);
        this.roomGroup.add(southWall, westWall, eastWall);

        const northWallL = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3, 0.2), wallMat);
        northWallL.position.set(-1.55, 1.5, -0.1);
        const northWallR = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3, 0.2), wallMat);
        northWallR.position.set(1.55, 1.5, -0.1);
        const northWallTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.2), wallMat);
        northWallTop.position.set(0, 2.6, -0.1);
        this.roomGroup.add(northWallL, northWallR, northWallTop);

        const frameMat = ProceduralTextures.createFurnitureWood('#210e06', '#0d0401');
        const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.24, 0.24), frameMat);
        jambL.position.set(-0.62, 1.12, -0.05);
        const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.24, 0.24), frameMat);
        jambR.position.set(0.62, 1.12, -0.05);
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.08, 0.24), frameMat);
        lintel.position.set(0, 2.22, -0.05);
        this.roomGroup.add(jambL, jambR, lintel);

        const roomLight = new THREE.PointLight(0xffcfa3, 1.55, 9.5);
        roomLight.position.set(0, 2.7, 2.0);
        this.roomGroup.add(roomLight);
    }

    buildInteractiveFurniture() {
        const deskMat = ProceduralTextures.createFurnitureWood('#2e160b', '#140803');
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.82), deskMat);
        deskTop.position.set(-1.72, 0.78, 0.62);
        this.roomGroup.add(deskTop);

        const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.76, 0.8), deskMat);
        legL.position.set(-2.34, 0.38, 0.62);
        const legR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.76, 0.8), deskMat);
        legR.position.set(-1.10, 0.38, 0.62);
        const backPanel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.76, 0.06), deskMat);
        backPanel.position.set(-1.72, 0.38, 0.24);
        this.roomGroup.add(legL, legR, backPanel);

        this.physics.addObstacle(-2.45, -1.02, 0.15, 1.15);

        this.drawerGroup = new THREE.Group();
        this.drawerGroup.position.set(-1.72, 0.56, 0.62);
        const drawerMat = ProceduralTextures.createFurnitureWood('#241107', '#0e0502');
        const drawerInsideMat = ProceduralTextures.createFurnitureWood('#3b1f10', '#1c0c05');

        const dBottom = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.02, 0.68), drawerInsideMat);
        dBottom.position.set(0, -0.06, 0);
        const dFront = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.03), drawerMat);
        dFront.position.set(0, 0, 0.34);
        const dLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.68), drawerMat);
        dLeft.position.set(-0.31, -0.01, 0);
        const dRight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.68), drawerMat);
        dRight.position.set(0.31, -0.01, 0);
        const dHandle = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.025, 0.03),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.22 })
        );
        dHandle.position.set(0, 0, 0.365);

        this.drawerGroup.add(dBottom, dFront, dLeft, dRight, dHandle);

        this.keyMesh = this.createDetailedKeyMesh(1.35);
        this.keyMesh.position.set(0, -0.02, 0.12);
        this.keyMesh.rotation.y = 0.4;
        this.keyMesh.visible = false;
        this.drawerGroup.add(this.keyMesh);

        this.drawerLight = new THREE.PointLight(0xffdd77, 0.0, 1.5);
        this.drawerLight.position.set(0, 0.18, 0.2);
        this.drawerGroup.add(this.drawerLight);

        this.roomGroup.add(this.drawerGroup);

        this.laptop = new THREE.Group();
        this.laptop.position.set(-1.72, 0.82, 0.62);

        const chassisMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.38, metalness: 0.55 });
        const keyboardTopMat = ProceduralTextures.createLaptopKeyboardMaterial();

        const laptopBase = new THREE.Mesh(
            new THREE.BoxGeometry(0.54, 0.026, 0.36),
            [chassisMat, chassisMat, keyboardTopMat, chassisMat, chassisMat, chassisMat]
        );
        this.laptop.add(laptopBase);

        const keycapMat = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.5, metalness: 0.2 });
        const rowZPositions = [-0.115, -0.082, -0.046, -0.010, 0.026, 0.062];
        for (let r = 0; r < rowZPositions.length; r++) {
            const numKeys = r === 5 ? 8 : 13;
            const rowW = 0.45;
            const keyW = (rowW / numKeys) - 0.004;
            for (let k = 0; k < numKeys; k++) {
                const kx = -rowW / 2 + (k + 0.5) * (rowW / numKeys);
                const keyMesh = new THREE.Mesh(new THREE.BoxGeometry(keyW, 0.005, 0.024), keycapMat);
                keyMesh.position.set(kx, 0.014, rowZPositions[r]);
                this.laptop.add(keyMesh);
            }
        }

        const touchpadRim = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.002, 0.095),
            new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.3, metalness: 0.5 })
        );
        touchpadRim.position.set(0, 0.0135, 0.125);
        this.laptop.add(touchpadRim);

        const pwrLed = new THREE.Mesh(
            new THREE.BoxGeometry(0.014, 0.004, 0.008),
            new THREE.MeshBasicMaterial({ color: 0x00ff88 })
        );
        pwrLed.position.set(0.20, 0.014, -0.15);
        this.laptop.add(pwrLed);

        const lidGroup = new THREE.Group();
        lidGroup.position.set(0, 0.014, -0.17);
        lidGroup.rotation.x = -0.15;

        for (const hx of [-0.18, 0.18]) {
            const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.05, 12), chassisMat);
            hinge.rotation.z = Math.PI / 2;
            hinge.position.set(hx, 0.005, 0);
            lidGroup.add(hinge);
        }

        const laptopLid = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.35, 0.022), chassisMat);
        laptopLid.position.set(0, 0.175, 0);
        lidGroup.add(laptopLid);

        const screenCanvas = document.createElement('canvas');
        screenCanvas.width = 512;
        screenCanvas.height = 320;
        const sctx = screenCanvas.getContext('2d');
        sctx.fillStyle = '#004d4d';
        sctx.fillRect(0, 0, 512, 320);

        sctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        for (let y = 0; y < 320; y += 4) {
            sctx.fillRect(0, y, 512, 2);
        }

        sctx.fillStyle = '#ffffff';
        sctx.fillRect(42, 34, 48, 58);
        sctx.strokeStyle = '#000000';
        sctx.lineWidth = 3;
        sctx.strokeRect(42, 34, 48, 58);
        sctx.fillStyle = '#000080';
        sctx.font = 'bold 14px monospace';
        sctx.fillText('TXT', 52, 72);

        sctx.fillStyle = '#ffffff';
        sctx.font = 'bold 18px monospace';
        sctx.fillText('Schlüssel.txt', 22, 118);

        sctx.fillStyle = '#c0c0c0';
        sctx.fillRect(0, 288, 512, 32);
        sctx.fillStyle = '#000000';
        sctx.font = 'bold 16px sans-serif';
        sctx.fillText('START | FleischiOS 95', 14, 310);

        sctx.fillStyle = '#00ffaa';
        sctx.font = 'bold 24px monospace';
        sctx.fillText('[E] LAPTOP ÖFFNEN', 135, 210);

        const screenTex = new THREE.CanvasTexture(screenCanvas);
        screenTex.colorSpace = THREE.SRGBColorSpace;
        const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
        this.laptopScreenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.49, 0.30), screenMat);
        this.laptopScreenMesh.position.set(0, 0.175, 0.012);
        lidGroup.add(this.laptopScreenMesh);

        const screenGlow = new THREE.PointLight(0x00aaaa, 0.85, 1.9);
        screenGlow.position.set(0, 0.2, 0.25);
        this.laptop.add(screenGlow);

        this.laptop.add(lidGroup);
        this.roomGroup.add(this.laptop);

        this.laptopCamPos = new THREE.Vector3(-1.72, 1.04, 1.04);
        this.laptopLookTarget = new THREE.Vector3(-1.72, 0.99, 0.45);
    }

    buildBedOnRightSide() {
        const bedGroup = new THREE.Group();
        bedGroup.position.set(1.65, 0, 2.0);

        const woodMat = ProceduralTextures.createFurnitureWood('#2c1509', '#120702');
        const mattressMat = ProceduralTextures.createFabricTexture('mattress');
        const blanketMat = ProceduralTextures.createFabricTexture('blanket');
        const pillowMat = ProceduralTextures.createFabricTexture('pillow');

        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.32, 2.2), woodMat);
        frame.position.set(0, 0.16, 0);
        bedGroup.add(frame);

        const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.95, 0.12), woodMat);
        headboard.position.set(0, 0.48, -1.05);
        bedGroup.add(headboard);

        const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.22, 2.05), mattressMat);
        mattress.position.set(0, 0.40, 0.02);
        bedGroup.add(mattress);

        const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.27, 0.23, 1.45), blanketMat);
        blanket.position.set(0, 0.41, 0.32);
        bedGroup.add(blanket);

        const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.42), pillowMat);
        pillow.position.set(0, 0.54, -0.72);
        pillow.rotation.x = 0.15;
        bedGroup.add(pillow);

        this.roomGroup.add(bedGroup);
        this.physics.addObstacle(0.92, 2.40, 0.85, 3.15);
    }

    // FIX: Analoge Uhr auf Y = 2.64m gesetzt (Radius 0.23m -> Unterkante bei 2.41m, Türrahmen endet bei 2.26m -> KEIN Überlappen mehr!)
    buildRealisticAnalogClock() {
        this.clockGroup = new THREE.Group();
        this.clockGroup.position.set(0, 2.64, 0.02);
        this.clockGroup.scale.setScalar(0.82);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#e8e0cf';
        ctx.beginPath();
        ctx.arc(256, 256, 240, 0, Math.PI * 2);
        ctx.fill();

        const grad = ctx.createRadialGradient(256, 256, 150, 256, 256, 240);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(40,20,10,0.45)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(256, 256, 240, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < 60; i++) {
            const ang = (i / 60) * Math.PI * 2;
            const isHour = i % 5 === 0;
            const r1 = isHour ? 202 : 214;
            const r2 = 228;
            ctx.strokeStyle = '#1a110a';
            ctx.lineWidth = isHour ? 6 : 2;
            ctx.beginPath();
            ctx.moveTo(256 + Math.sin(ang) * r1, 256 - Math.cos(ang) * r1);
            ctx.lineTo(256 + Math.sin(ang) * r2, 256 - Math.cos(ang) * r2);
            ctx.stroke();
        }

        ctx.fillStyle = '#1a110a';
        ctx.font = 'bold 38px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let n = 1; n <= 12; n++) {
            const ang = (n / 12) * Math.PI * 2;
            const rx = 256 + Math.sin(ang) * 170;
            const ry = 256 - Math.cos(ang) * 170;
            ctx.fillText(String(n), rx, ry);
        }

        const clockTex = new THREE.CanvasTexture(canvas);
        const dialMesh = new THREE.Mesh(
            new THREE.CircleGeometry(0.28, 36),
            new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.6 })
        );
        dialMesh.position.z = 0.02;
        this.clockGroup.add(dialMesh);

        const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.285, 0.032, 16, 36),
            new THREE.MeshStandardMaterial({ color: 0x2b1508, roughness: 0.4, metalness: 0.3 })
        );
        rim.position.z = 0.02;
        this.clockGroup.add(rim);

        this.hourHandPivot = new THREE.Group();
        this.hourHandPivot.position.z = 0.032;
        const hourHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.022, 0.14, 0.008),
            new THREE.MeshBasicMaterial({ color: 0x111111 })
        );
        hourHand.position.y = 0.055;
        this.hourHandPivot.add(hourHand);
        this.hourHandPivot.rotation.z = 0.45;
        this.clockGroup.add(this.hourHandPivot);

        this.minuteHandPivot = new THREE.Group();
        this.minuteHandPivot.position.z = 0.038;
        const minuteHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.014, 0.21, 0.008),
            new THREE.MeshBasicMaterial({ color: 0x111111 })
        );
        minuteHand.position.y = 0.085;
        this.minuteHandPivot.add(minuteHand);
        this.minuteHandPivot.rotation.z = 0.3;
        this.clockGroup.add(this.minuteHandPivot);

        this.secondHandPivot = new THREE.Group();
        this.secondHandPivot.position.z = 0.044;
        const secHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.006, 0.23, 0.006),
            new THREE.MeshBasicMaterial({ color: 0xaa1111 })
        );
        secHand.position.y = 0.09;
        this.secondHandPivot.add(secHand);
        this.clockGroup.add(this.secondHandPivot);

        const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9 })
        );
        cap.rotation.x = Math.PI / 2;
        cap.position.z = 0.046;
        this.clockGroup.add(cap);

        this.roomGroup.add(this.clockGroup);
    }

    // Erzeugt eine Holz-Intarsien-Taste, die direkt in die Maserung der Tür eingefräst ist!
    createCarvedWoodButtonMaterial(label, tintColor = '#2b1307', rimGlow = '#c86414', textColor = '#ffcf70', aspect = 1.25) {
        const canvas = document.createElement('canvas');
        const W = 256;
        const H = Math.round(W / aspect);
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = tintColor;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 45; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.26)' : 'rgba(255,180,110,0.06)';
            ctx.fillRect(0, Math.random() * H, W, 3);
        }

        ctx.strokeStyle = '#0c0401';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, W - 10, H - 10);

        ctx.strokeStyle = rimGlow;
        ctx.lineWidth = 3;
        ctx.strokeRect(12, 12, W - 24, H - 24);

        // Large engraved label
        ctx.shadowColor = rimGlow;
        ctx.shadowBlur = 8;
        ctx.fillStyle = textColor;
        ctx.font = label.length > 2 ? 'bold 78px serif' : 'bold 140px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, W / 2, H / 2 + 4);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.015,
            roughness: 0.52,
            metalness: 0.25
        });
    }

    // Die Formel-Anzeige fließt jetzt transparent & als Holz-Fräsung direkt in das Türblatt ein!
    updateDoorTerminalScreen(inputText = "", status = "normal") {
        this.currentDisplayedFormula = inputText;
        this.currentTerminalStatus = status;

        if (!this.doorTermCanvas) {
            this.doorTermCanvas = document.createElement('canvas');
            this.doorTermCanvas.width = 768;
            this.doorTermCanvas.height = 280;
            this.doorTermTex = new THREE.CanvasTexture(this.doorTermCanvas);
            this.doorTermTex.colorSpace = THREE.SRGBColorSpace;
        }

        const ctx = this.doorTermCanvas.getContext('2d');
        ctx.clearRect(0, 0, 768, 280);

        // Transparent auslaufender Holz-Hintergrund, damit keine harte Kante auf der Tür entsteht!
        const glowColor = status === 'error' ? '#ff1100' : (status === 'success' ? '#00ff66' : '#ff6600');

        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffbb66';
        ctx.font = 'bold 25px serif';
        ctx.textAlign = 'center';
        ctx.fillText('MITTERNACHTSFORMEL IN DIE TÜR GRAVIEREN', 384, 44);

        ctx.shadowBlur = 6;
        ctx.fillStyle = '#d9a066';
        ctx.font = 'bold 20px monospace';
        ctx.fillText('= (-b +- √(b^2 - 4⋅a⋅c)) / (2⋅a)', 384, 82);
        ctx.restore();

        // Tief ins Türholz eingefräste dunkle Rille für die eingegebene Formel
        ctx.fillStyle = status === 'error' ? 'rgba(65, 5, 2, 0.92)' : (status === 'success' ? 'rgba(8, 45, 15, 0.92)' : 'rgba(18, 7, 3, 0.90)');
        ctx.fillRect(42, 104, 684, 96);

        // Holzmaserung innerhalb der eingefrästen Rille
        for (let i = 0; i < 30; i++) {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(42, 106 + Math.random() * 90, 684, 2);
        }

        // Abgeschrägte Holz-Schattenkante oben/unten an der Fräsung
        ctx.strokeStyle = '#080301';
        ctx.lineWidth = 8;
        ctx.strokeRect(42, 104, 684, 96);

        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(48, 110, 672, 84);

        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12;
        ctx.fillStyle = status === 'success' ? '#00ff88' : '#ffdd77';
        ctx.font = 'bold 33px monospace';
        ctx.textAlign = 'center';
        const cursor = status === 'normal' ? '|' : '';
        ctx.fillText(inputText + cursor, 384, 162);
        ctx.restore();

        ctx.fillStyle = status === 'error' ? '#ff4433' : (status === 'success' ? '#00ff66' : '#c89664');
        ctx.font = 'bold 18px serif';
        ctx.textAlign = 'center';
        const footerMsg = status === 'error'
            ? 'FALSCHE GRAVUR!'
            : (status === 'success' ? 'TÜR ENTRIEGELT!' : 'WÄHLE DIE EINGELASSENEN TÜR-TASTEN MIT [E] ODER KLICK');
        ctx.fillText(footerMsg, 384, 236);

        this.doorTermTex.needsUpdate = true;
    }

    showDoorTerminal() {
        if (this.doorTerminalGroup) {
            this.doorTerminalGroup.visible = true;
        }
    }

    buildExitDoor() {
        this.doorHinge = new THREE.Group();
        this.doorHinge.position.set(0.6, 0, 0);

        const doorMat = ProceduralTextures.createDetailedDoorMaterial('#361c0e', '#210f06', '#4f2b17');
        this.doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.08), doorMat);
        this.doorMesh.position.set(-0.6, 1.1, 0);

        const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 14), handleMat);
        knob.position.set(-0.48, -0.10, 0.065);
        this.doorMesh.add(knob);

        const keyholePlate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.02), handleMat);
        keyholePlate.position.set(-0.48, -0.22, 0.045);
        this.doorMesh.add(keyholePlate);

        this.insertedKeyMesh = this.createDetailedKeyMesh(0.95);
        this.insertedKeyMesh.position.set(-0.48, -0.24, 0.11);
        this.insertedKeyMesh.rotation.y = Math.PI;
        this.insertedKeyMesh.visible = false;
        this.doorMesh.add(this.insertedKeyMesh);

        // =========================================================================
        // NAHTLOS IN DIE TÜR EINGELASSENES TERMINAL (OHNE AUFGESETZTEN KASTEN!)
        // =========================================================================
        this.doorTerminalGroup = new THREE.Group();
        this.doorTerminalGroup.position.set(0, 0.22, 0.041); // centered horizontally, input field at eye height
        this.doorTerminalGroup.visible = false;
        this.doorMesh.add(this.doorTerminalGroup);

        this.updateDoorTerminalScreen("", "normal");

        // Transparentes Gravur-Overlay direkt auf der Türoberfläche (kein schwarzer Hintergrundblock!)
        this.doorTermScreenMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.84, 0.30),
            new THREE.MeshBasicMaterial({
                map: this.doorTermTex,
                transparent: true,
                depthWrite: false
            })
        );
        this.doorTermScreenMesh.position.set(0, 0.36, 0.002);
        this.doorTerminalGroup.add(this.doorTermScreenMesh);

        // 4x5 Grid mit 19 bündig ins Türholz eingelassenen Holz-/Messing-Tasten!
        const grid4x4 = [
            { label: 'a', token: 'a', col: 0, row: 0 },
            { label: '1', token: '1', col: 1, row: 0 },
            { label: '+', token: '+', col: 2, row: 0 },
            { label: '√', token: '√', col: 3, row: 0 },
            { label: 'b', token: 'b', col: 0, row: 1 },
            { label: '2', token: '2', col: 1, row: 1 },
            { label: '-', token: '-', col: 2, row: 1 },
            { label: '^', token: '^', col: 3, row: 1 },
            { label: 'c', token: 'c', col: 0, row: 2 },
            { label: '3', token: '3', col: 1, row: 2 },
            { label: '⋅', token: '⋅', col: 2, row: 2 },
            { label: '(', token: '(', col: 3, row: 2 },
            { label: '=', token: '=', col: 0, row: 3 },
            { label: '4', token: '4', col: 1, row: 3 },
            { label: '/', token: '/', col: 2, row: 3 },
            { label: ')', token: ')', col: 3, row: 3 }
        ];

        // 4 columns x 4 rows, centered at x=0; action row (Back/Clear/Enter) below, same total width
        const colX = [-0.255, -0.085, 0.085, 0.255];
        const rowY = [0.12, -0.02, -0.16, -0.30];

        grid4x4.forEach((b) => {
            const mat = this.createCarvedWoodButtonMaterial(b.label, '#2b1307', '#b85d19', '#ffcf70', 1.25);
            const btnMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.12, 0.008),
                mat
            );
            btnMesh.position.set(colX[b.col], rowY[b.row], 0.004);
            btnMesh.userData = { token: b.token, label: b.label, baseZ: 0.004 };
            this.doorTerminalGroup.add(btnMesh);
            this.doorTerminalButtons.push(btnMesh);
        });

        const actions = [
            { label: 'Back', token: 'BACK', x: -0.225, bg: '#331408', border: '#cc5522', text: '#ffbb88' },
            { label: 'Clear', token: 'CLEAR', x: 0.0, bg: '#381008', border: '#cc2211', text: '#ff9988' },
            { label: 'Enter', token: 'ENTER', x: 0.225, bg: '#142e12', border: '#22aa44', text: '#88ffaa' }
        ];

        actions.forEach((act) => {
            const mat = this.createCarvedWoodButtonMaterial(act.label, act.bg, act.border, act.text, 1.75);
            const btnMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.21, 0.12, 0.008),
                mat
            );
            btnMesh.position.set(act.x, -0.45, 0.004);
            btnMesh.userData = { token: act.token, label: act.label, baseZ: 0.004 };
            this.doorTerminalGroup.add(btnMesh);
            this.doorTerminalButtons.push(btnMesh);
        });

        this.doorHinge.add(this.doorMesh);
        this.roomGroup.add(this.doorHinge);
    }

    getHoveredTerminalButton(raycaster) {
        if (!this.isTerminalUnlockedOnDoor || this.doorOpen) return null;
        const hits = raycaster.intersectObjects(this.doorTerminalButtons, false);
        if (hits.length > 0 && hits[0].distance < 3.2) {
            return hits[0].object;
        }
        return null;
    }

    pressHoveredTerminalButton(raycaster, terminalInstance) {
        const btn = this.getHoveredTerminalButton(raycaster);
        if (!btn || !terminalInstance) return false;

        btn.position.z = btn.userData.baseZ - 0.004;
        setTimeout(() => {
            btn.position.z = btn.userData.baseZ;
        }, 120);

        terminalInstance.appendToken(btn.userData.token);
        return true;
    }

    buildHeldKeyOnCamera() {
        this.heldKeyGroup = this.createDetailedKeyMesh(1.45);
        this.heldKeyGroup.position.set(0.34, -0.24, -0.48);
        this.heldKeyGroup.rotation.set(0.25, -0.55, -0.2);
        this.heldKeyGroup.visible = false;
        this.camera.add(this.heldKeyGroup);
    }

    openDeskDrawer() {
        if (this.hasLaptopBeenRead) return;
        this.hasLaptopBeenRead = true;
        this.audio.playDrawerSlide();
        this.keyMesh.visible = true;
        this.drawerLight.intensity = 1.6;

        let slideZ = 0.62;
        const animateDrawer = () => {
            if (slideZ < 1.10) {
                slideZ += 0.03;
                this.drawerGroup.position.z = slideZ;
                requestAnimationFrame(animateDrawer);
            }
        };
        animateDrawer();
    }

    pickupKey() {
        if (!this.keyMesh.visible || this.hasKey) return;
        this.hasKey = true;
        this.isKeyInserted = false;
        this.keyMesh.visible = false;
        this.drawerLight.intensity = 0.0;
        this.heldKeyGroup.visible = true;
        this.audio.playKeyPickup();
    }

    animateInsertedKeyTurn(onFinished) {
        this.heldKeyGroup.visible = false;
        this.isKeyInserted = true;
        this.insertedKeyMesh.visible = true;
        this.insertedKeyMesh.rotation.z = 0;
        this.audio.playKeyPickup();

        let rot = 0;
        const turnKey = () => {
            if (rot < Math.PI / 2) {
                rot += 0.12;
                this.insertedKeyMesh.rotation.z = rot;
                requestAnimationFrame(turnKey);
            } else if (onFinished) {
                onFinished();
            }
        };
        turnKey();
    }

    useKeyOnDoor() {
        if (!this.hasKey || this.isKeyInserted || this.doorOpen) return;

        if (this.formulaSolvedOnce) {
            this.animateInsertedKeyTurn(() => {
                this.physics.unlockDoor();
                this.unlockAndOpenDoor();
            });
            return;
        }

        if (this.clockActivated) return;
        this.clockActivated = true;

        this.animateInsertedKeyTurn(() => {
            let elapsed = 0;
            const clockInterval = setInterval(() => {
                elapsed += 80;
                this.minuteHandPivot.rotation.z -= 0.28;
                this.hourHandPivot.rotation.z -= 0.03;
                this.secondHandPivot.rotation.z -= 0.65;
                if (elapsed % 320 === 0) this.audio.playTick();

                if (elapsed >= 2200) {
                    clearInterval(clockInterval);
                    this.minuteHandPivot.rotation.z = 0;
                    this.hourHandPivot.rotation.z = 0;
                    this.secondHandPivot.rotation.z = 0;
                    this.audio.playMidnightGong();
                    this.audio.playJumpscareSound();
                    this.isTerminalUnlockedOnDoor = true;
                    this.showDoorTerminal();
                    this.onTriggerMidnightScare();
                }
            }, 80);
        });
    }

    unlockAndOpenDoor() {
        if (this.doorOpen) return;
        this.doorOpen = true;
        this.formulaSolvedOnce = true;
        this.heldKeyGroup.visible = false;
        this.audio.playDrawerSlide();

        let angle = 0;
        const swing = () => {
            if (angle < Math.PI / 2) {
                angle += 0.04;
                this.doorHinge.rotation.y = angle;
                requestAnimationFrame(swing);
            }
        };
        swing();
    }

    resetForRespawnWithKey() {
        this.doorOpen = false;
        this.doorHinge.rotation.y = 0;
        this.hasKey = true;
        this.isKeyInserted = false;
        this.insertedKeyMesh.visible = false;
        if (this.doorTerminalGroup) this.doorTerminalGroup.visible = false;
        this.heldKeyGroup.visible = true;
        this.physics.lockDoor();
    }

    update(delta) {
        if (this.heldKeyGroup && this.heldKeyGroup.visible) {
            this.handBobTimer += delta * 4.0;
            this.heldKeyGroup.position.y = -0.24 + Math.sin(this.handBobTimer) * 0.008;
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof Level01Room !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'gang', cls: Level01Room });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('gang', Level01Room);
  }
}


// [MILAN_MODE_HOOK_B3]

(() => {
    const cls = (typeof Level01Room !== 'undefined') ? Level01Room : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('Level01Room', this);
            if (this._milanFurzKnockedDown && (
                method.toLowerCase().includes('monster') ||
                method.toLowerCase().includes('enemy') ||
                method.toLowerCase().includes('attack') ||
                method.toLowerCase().includes('chase')
            )) {
                return;
            }
            if (milanMode.isMilan && (
                method.toLowerCase().includes('update') ||
                method.toLowerCase().includes('tick') ||
                method.toLowerCase().includes('animate')
            )) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.5;
                }
            }
            return orig.apply(this, args);
        };
    }
})();

