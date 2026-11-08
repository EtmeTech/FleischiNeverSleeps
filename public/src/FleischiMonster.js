import * as THREE from 'three';

export class FleischiMonster {
    constructor() {
        this.group = new THREE.Group();
        this.twitchTimer = 0;

        this.spineNodes = [];
        this.ribPairs = [];
        this.leftFingers = [];
        this.rightFingers = [];
        this.tendrils = [];

        this.initMaterials();
        this.buildSeamlessMonster();
    }

    initMaterials() {
        const skinCanvas = document.createElement('canvas');
        skinCanvas.width = 512;
        skinCanvas.height = 512;
        const ctx = skinCanvas.getContext('2d');

        ctx.fillStyle = '#240303';
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 900; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const w = Math.random() * 18 + 4;
            const h = Math.random() * 80 + 20;
            const shade = Math.floor(Math.random() * 35 + 20);
            ctx.fillStyle = `rgba(${shade + 25}, 4, 4, 0.28)`;
            ctx.fillRect(x, y, w, h);
        }

        for (let i = 0; i < 35; i++) {
            ctx.strokeStyle = 'rgba(8, 0, 0, 0.7)';
            ctx.lineWidth = Math.random() * 2.5 + 1;
            ctx.beginPath();
            let vx = Math.random() * 512;
            let vy = 0;
            ctx.moveTo(vx, vy);
            while (vy < 512) {
                vy += Math.random() * 30 + 10;
                vx += (Math.random() - 0.5) * 30;
                ctx.lineTo(vx, vy);
            }
            ctx.stroke();
        }

        const skinTex = new THREE.CanvasTexture(skinCanvas);
        skinTex.wrapS = THREE.RepeatWrapping;
        skinTex.wrapT = THREE.RepeatWrapping;

        this.skinMat = new THREE.MeshStandardMaterial({
            map: skinTex,
            color: 0x4a0909,
            roughness: 0.68,
            metalness: 0.05
        });

        this.darkFleshMat = new THREE.MeshStandardMaterial({
            map: skinTex,
            color: 0x2b0404,
            roughness: 0.75,
            metalness: 0.04
        });

        this.clawMat = new THREE.MeshStandardMaterial({
            color: 0x110202,
            roughness: 0.35,
            metalness: 0.3
        });
    }

    buildSeamlessMonster() {
        this.bodyGroup = new THREE.Group();
        this.group.add(this.bodyGroup);

        this.buildSculptedTorso();
        this.buildEmbeddedRibsAndSpine();
        this.buildShoulderBridges();
        this.buildSeamlessNeckAndFace();

        this.leftArm = this.buildConnectedArm(-1);
        this.rightArm = this.buildConnectedArm(1);
        this.bodyGroup.add(this.leftArm, this.rightArm);

        this.leftLeg = this.buildConnectedLeg(-1);
        this.rightLeg = this.buildConnectedLeg(1);
        this.group.add(this.leftLeg, this.rightLeg);

        this.group.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }

    buildSculptedTorso() {
        const torsoHeight = 1.40;
        const torsoGeo = new THREE.CylinderGeometry(0.28, 0.20, torsoHeight, 48, 64, false);
        const pos = torsoGeo.attributes.position;

        for (let i = 0; i < pos.count; i++) {
            let x = pos.getX(i);
            let y = pos.getY(i);
            let z = pos.getZ(i);

            const t = (y + torsoHeight / 2) / torsoHeight;
            const angle = Math.atan2(z, x);

            let widthScale = 1.0;
            let depthScale = 0.68;

            if (t < 0.22) {
                const pt = t / 0.22;
                widthScale = 0.95 + Math.sin(pt * Math.PI) * 0.18;
                depthScale = 0.65;
            } else if (t < 0.48) {
                const wt = (t - 0.22) / 0.26;
                widthScale = 0.92 - Math.sin(wt * Math.PI) * 0.28;
                depthScale = 0.56 - Math.sin(wt * Math.PI) * 0.14;
            } else if (t < 0.86) {
                const ct = (t - 0.48) / 0.38;
                widthScale = 0.78 + Math.sin(ct * Math.PI * 0.75) * 0.58;
                depthScale = 0.58 + Math.sin(ct * Math.PI * 0.8) * 0.22;

                const ribWave = Math.sin(ct * Math.PI * 12.0) * 0.028;
                widthScale += ribWave;
                depthScale += ribWave * 0.7;
            } else {
                const nt = (t - 0.86) / 0.14;
                widthScale = 1.25 * (1.0 - nt * 0.72);
                depthScale = 0.68 * (1.0 - nt * 0.55);
            }

            const forwardCurve = Math.sin(t * Math.PI) * -0.05 + (t > 0.65 ? Math.pow(t - 0.65, 2) * 0.55 : 0);
            const frontIndent = Math.cos(angle * 2.0) > 0.5 && z > 0 ? -0.015 : 0;

            pos.setX(i, x * widthScale);
            pos.setZ(i, z * depthScale + forwardCurve + frontIndent);
        }

        torsoGeo.computeVertexNormals();
        this.torsoMesh = new THREE.Mesh(torsoGeo, this.skinMat);
        this.torsoMesh.position.set(0, 1.65, 0);
        this.bodyGroup.add(this.torsoMesh);

        const pelvisCapGeo = new THREE.SphereGeometry(0.21, 24, 18);
        pelvisCapGeo.scale(1.1, 0.65, 0.68);
        const pelvisCap = new THREE.Mesh(pelvisCapGeo, this.skinMat);
        pelvisCap.position.set(0, 0.96, -0.01);
        this.bodyGroup.add(pelvisCap);
    }

    buildEmbeddedRibsAndSpine() {
        const numSpine = 16;
        for (let i = 0; i < numSpine; i++) {
            const t = i / (numSpine - 1);
            const y = 1.05 + t * 1.25;
            const z = -0.11 - Math.sin(t * Math.PI) * 0.05 + (t > 0.65 ? Math.pow(t - 0.65, 2) * 0.48 : 0);

            const ridgeGroup = new THREE.Group();
            ridgeGroup.position.set(0, y, z);

            const ridgeBump = new THREE.Mesh(
                new THREE.SphereGeometry(0.042 - Math.abs(t - 0.5) * 0.015, 12, 10),
                this.darkFleshMat
            );
            ridgeBump.scale.set(0.85, 1.1, 1.3);
            ridgeGroup.add(ridgeBump);

            const dorsalFin = new THREE.Mesh(
                new THREE.ConeGeometry(0.018, 0.075 + Math.sin(t * Math.PI) * 0.05, 8),
                this.clawMat
            );
            dorsalFin.rotation.x = -Math.PI * 0.55;
            dorsalFin.position.set(0, 0, -0.04);
            ridgeGroup.add(dorsalFin);

            this.bodyGroup.add(ridgeGroup);
            this.spineNodes.push(ridgeGroup);
        }

        for (let r = 0; r < 6; r++) {
            const rt = r / 5;
            const y = 1.54 + rt * 0.46;
            const w = 0.21 + Math.sin(rt * Math.PI * 0.8) * 0.09;
            const d = 0.12 + Math.sin(rt * Math.PI * 0.8) * 0.04;

            for (let side of [-1, 1]) {
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(side * 0.03, y + 0.02, -0.11),
                    new THREE.Vector3(side * w, y, -0.01),
                    new THREE.Vector3(side * (w * 0.72), y - 0.025, d),
                    new THREE.Vector3(side * 0.02, y - 0.02, d * 0.92)
                ]);
                const ribGeo = new THREE.TubeGeometry(curve, 16, 0.016, 8, false);
                const ribMesh = new THREE.Mesh(ribGeo, this.darkFleshMat);
                this.bodyGroup.add(ribMesh);
                this.ribPairs.push(ribMesh);
            }
        }
    }

    buildShoulderBridges() {
        for (let s of [-1, 1]) {
            const trapCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(s * 0.05, 2.34, 0.02),
                new THREE.Vector3(s * 0.20, 2.26, 0.0),
                new THREE.Vector3(s * 0.34, 2.15, 0.01)
            ]);
            const trapGeo = new THREE.TubeGeometry(trapCurve, 14, 0.068, 12, false);
            const trapMesh = new THREE.Mesh(trapGeo, this.skinMat);
            this.bodyGroup.add(trapMesh);

            const pecCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(s * 0.03, 2.02, 0.11),
                new THREE.Vector3(s * 0.19, 2.08, 0.09),
                new THREE.Vector3(s * 0.34, 2.13, 0.02)
            ]);
            const pecGeo = new THREE.TubeGeometry(pecCurve, 14, 0.062, 12, false);
            const pecMesh = new THREE.Mesh(pecGeo, this.skinMat);
            this.bodyGroup.add(pecMesh);

            const latCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(s * 0.08, 1.82, -0.09),
                new THREE.Vector3(s * 0.24, 1.98, -0.06),
                new THREE.Vector3(s * 0.34, 2.13, -0.01)
            ]);
            const latGeo = new THREE.TubeGeometry(latCurve, 14, 0.058, 12, false);
            const latMesh = new THREE.Mesh(latGeo, this.skinMat);
            this.bodyGroup.add(latMesh);
        }
    }

    buildSeamlessNeckAndFace() {
        this.neckGroup = new THREE.Group();
        this.neckGroup.position.set(0, 2.26, 0.03);
        this.bodyGroup.add(this.neckGroup);

        const neckCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -0.04, 0.0),
            new THREE.Vector3(0, 0.12, 0.03),
            new THREE.Vector3(0, 0.28, 0.06)
        ]);
        const neckGeo = new THREE.TubeGeometry(neckCurve, 16, 0.075, 16, false);
        const nPos = neckGeo.attributes.position;
        for (let i = 0; i < nPos.count; i++) {
            const y = nPos.getY(i);
            const taper = y > 0.12 ? 1.0 - (y - 0.12) * 1.8 : 1.0;
            nPos.setX(i, nPos.getX(i) * Math.max(0.55, taper));
            nPos.setZ(i, nPos.getZ(i) * Math.max(0.55, taper));
        }
        neckGeo.computeVertexNormals();
        const neckMesh = new THREE.Mesh(neckGeo, this.skinMat);
        this.neckGroup.add(neckMesh);

        for (let s of [-1, 1]) {
            const tendonCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(s * 0.09, -0.06, 0.05),
                new THREE.Vector3(s * 0.06, 0.10, 0.05),
                new THREE.Vector3(s * 0.04, 0.26, 0.06)
            ]);
            const tendonGeo = new THREE.TubeGeometry(tendonCurve, 10, 0.022, 8, false);
            const tendon = new THREE.Mesh(tendonGeo, this.darkFleshMat);
            this.neckGroup.add(tendon);
        }

        this.headGroup = new THREE.Group();
        this.headGroup.position.set(0, 0.42, 0.08);
        this.neckGroup.add(this.headGroup);

        const faceGeo = new THREE.PlaneGeometry(0.90, 0.94, 20, 20);
        const fPos = faceGeo.attributes.position;
        for (let i = 0; i < fPos.count; i++) {
            const x = fPos.getX(i);
            const y = fPos.getY(i);
            const zCurve = Math.cos(x * 1.4) * 0.02 + Math.cos(y * 1.4) * 0.015;
            fPos.setZ(i, zCurve);
        }
        faceGeo.computeVertexNormals();

        const faceMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            alphaTest: 0.08,
            side: THREE.DoubleSide
        });

        this.faceMesh = new THREE.Mesh(faceGeo, faceMat);
        this.faceMesh.position.set(0, 0.06, 0.04);
        this.headGroup.add(this.faceMesh);

        const loader = new THREE.TextureLoader();
        loader.load('assets/textures/fleischi_face_monster.png', (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            faceMat.map = tex;
            faceMat.needsUpdate = true;
        });
    }

    buildConnectedArm(side) {
        const s = side;
        const armRoot = new THREE.Group();
        armRoot.position.set(s * 0.33, 2.15, 0.02);

        const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 18), this.skinMat);
        shoulderCap.scale.set(1.05, 1.25, 0.95);
        armRoot.add(shoulderCap);

        const upperCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(s * 0.03, -0.32, 0.01),
            new THREE.Vector3(s * 0.05, -0.66, 0.03)
        ]);
        const upperGeo = new THREE.TubeGeometry(upperCurve, 20, 0.058, 14, false);
        const uPos = upperGeo.attributes.position;
        for (let i = 0; i < uPos.count; i++) {
            const y = uPos.getY(i);
            const t = Math.abs(y) / 0.66;
            const muscleBulge = 1.0 + Math.sin(t * Math.PI) * 0.22 - t * 0.18;
            uPos.setX(i, uPos.getX(i) * muscleBulge);
            uPos.setZ(i, uPos.getZ(i) * muscleBulge);
        }
        upperGeo.computeVertexNormals();
        const upperArmMesh = new THREE.Mesh(upperGeo, this.skinMat);
        armRoot.add(upperArmMesh);

        const elbowGroup = new THREE.Group();
        elbowGroup.position.set(s * 0.05, -0.66, 0.03);
        armRoot.add(elbowGroup);

        const elbowSphere = new THREE.Mesh(new THREE.SphereGeometry(0.054, 14, 14), this.skinMat);
        elbowGroup.add(elbowSphere);

        const elbowSpike = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 8), this.clawMat);
        elbowSpike.position.set(0, -0.01, -0.06);
        elbowSpike.rotation.x = -Math.PI * 0.62;
        elbowGroup.add(elbowSpike);

        const forearmCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(s * 0.01, -0.38, 0.03),
            new THREE.Vector3(s * 0.01, -0.76, 0.07)
        ]);
        const forearmGeo = new THREE.TubeGeometry(forearmCurve, 20, 0.046, 14, false);
        const faPos = forearmGeo.attributes.position;
        for (let i = 0; i < faPos.count; i++) {
            const y = faPos.getY(i);
            const t = Math.min(1, Math.abs(y) / 0.76);
            const taper = 1.08 - t * 0.42;
            faPos.setX(i, faPos.getX(i) * taper);
            faPos.setZ(i, faPos.getZ(i) * taper);
        }
        forearmGeo.computeVertexNormals();
        const forearmMesh = new THREE.Mesh(forearmGeo, this.darkFleshMat);
        elbowGroup.add(forearmMesh);

        const handGroup = new THREE.Group();
        handGroup.position.set(s * 0.01, -0.76, 0.07);
        elbowGroup.add(handGroup);

        const wristSphere = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), this.darkFleshMat);
        handGroup.add(wristSphere);

        const palmGeo = new THREE.SphereGeometry(0.055, 14, 14);
        palmGeo.scale(0.85, 1.45, 0.45);
        const palmMesh = new THREE.Mesh(palmGeo, this.darkFleshMat);
        palmMesh.position.set(0, -0.065, 0.01);
        handGroup.add(palmMesh);

        const fingerArr = s < 0 ? this.leftFingers : this.rightFingers;
        for (let f = 0; f < 5; f++) {
            const fGroup = new THREE.Group();
            const isThumb = f === 0;
            const offset = (f - 2) * 0.019;

            fGroup.position.set(
                isThumb ? s * -0.042 : offset,
                isThumb ? -0.05 : -0.11,
                isThumb ? 0.025 : 0.01
            );
            fGroup.rotation.z = isThumb ? s * -0.38 : (f - 2) * 0.07;

            const fCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, -0.08, 0.015),
                new THREE.Vector3(0, -0.16, 0.045)
            ]);
            const fGeo = new THREE.TubeGeometry(fCurve, 10, 0.011, 8, false);
            const fMesh = new THREE.Mesh(fGeo, this.darkFleshMat);
            fGroup.add(fMesh);

            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.12, 8), this.clawMat);
            claw.position.set(0, -0.20, 0.065);
            claw.rotation.x = Math.PI * 0.78;
            fGroup.add(claw);

            handGroup.add(fGroup);
            fingerArr.push(fGroup);
        }

        armRoot.userData = { elbowGroup, handGroup };
        return armRoot;
    }

    buildConnectedLeg(side) {
        const s = side;
        const legRoot = new THREE.Group();
        legRoot.position.set(s * 0.15, 0.98, 0.0);

        const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 14), this.skinMat);
        legRoot.add(hipJoint);

        const thighCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(s * 0.01, -0.25, 0.03),
            new THREE.Vector3(s * 0.01, -0.50, 0.04)
        ]);
        const thighGeo = new THREE.TubeGeometry(thighCurve, 16, 0.072, 14, false);
        const thighMesh = new THREE.Mesh(thighGeo, this.skinMat);
        legRoot.add(thighMesh);

        const kneeGroup = new THREE.Group();
        kneeGroup.position.set(s * 0.01, -0.50, 0.04);
        legRoot.add(kneeGroup);

        const kneeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), this.darkFleshMat);
        kneeGroup.add(kneeSphere);

        const shinCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -0.24, -0.02),
            new THREE.Vector3(0, -0.46, 0.0)
        ]);
        const shinGeo = new THREE.TubeGeometry(shinCurve, 16, 0.048, 12, false);
        const shinMesh = new THREE.Mesh(shinGeo, this.darkFleshMat);
        kneeGroup.add(shinMesh);

        const footGroup = new THREE.Group();
        footGroup.position.set(0, -0.46, 0.02);
        kneeGroup.add(footGroup);

        const footBase = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), this.darkFleshMat);
        footBase.scale.set(0.9, 0.5, 1.8);
        footBase.position.set(0, 0, 0.04);
        footGroup.add(footBase);

        for (let t = 0; t < 4; t++) {
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.11, 8), this.clawMat);
            claw.rotation.x = Math.PI * 0.52;
            claw.position.set((t - 1.5) * 0.026, -0.01, 0.12);
            footGroup.add(claw);
        }

        legRoot.userData = { kneeGroup };
        return legRoot;
    }

    setGrabPose(liftProgress) {
        this.twitchTimer += 0.25;
        const p = Math.min(1.0, Math.max(0.0, liftProgress));

        if (this.bodyGroup) {
            this.bodyGroup.rotation.set(0, 0, 0);
            this.bodyGroup.position.y = 0;
        }

        if (this.leftArm && this.rightArm) {
            this.leftArm.rotation.x = -1.25 - p * 0.55;
            this.rightArm.rotation.x = -1.25 - p * 0.55;
            this.leftArm.rotation.y = 0.28;
            this.rightArm.rotation.y = -0.28;
            this.leftArm.rotation.z = 0;
            this.rightArm.rotation.z = 0;

            this.leftArm.userData.elbowGroup.rotation.x = -0.55 - p * 0.25;
            this.rightArm.userData.elbowGroup.rotation.x = -0.55 - p * 0.25;
        }

        for (const f of this.leftFingers) f.rotation.x = 0.65;
        for (const f of this.rightFingers) f.rotation.x = 0.65;

        if (this.headGroup) {
            this.headGroup.rotation.z = Math.sin(this.twitchTimer * 3.5) * 0.16;
            this.headGroup.rotation.x = 0.12 + Math.cos(this.twitchTimer * 2.8) * 0.06;
        }
    }

    resetPose() {
        if (this.bodyGroup) {
            this.bodyGroup.position.y = 0;
            this.bodyGroup.rotation.set(0, 0, 0);
        }
        if (this.leftArm && this.rightArm) {
            this.leftArm.rotation.set(0, 0, 0);
            this.rightArm.rotation.set(0, 0, 0);
            this.leftArm.userData.elbowGroup.rotation.set(0, 0, 0);
            this.rightArm.userData.elbowGroup.rotation.set(0, 0, 0);
        }
        if (this.leftLeg && this.rightLeg) {
            this.leftLeg.rotation.set(0, 0, 0);
            this.rightLeg.rotation.set(0, 0, 0);
            this.leftLeg.userData.kneeGroup.rotation.set(0, 0, 0);
            this.rightLeg.userData.kneeGroup.rotation.set(0, 0, 0);
        }
    }

    // SPEZIAL-ANIMATION FÜR UNTERWASSER- / WASSER-FLEISCHI IM GEFLUTETEN HEIZUNGSKELLER!
    // Wenn isCharging = true: Gewaltige Überkopf-Kraul-/Krallenschläge durch das schwarze Wasser + Vorwärts-Lunge!
    animateWaterStalk(delta, isCharging = false) {
        const rate = isCharging ? 15.5 : 5.2;
        this.twitchTimer += delta * rate;
        const t = this.twitchTimer;

        if (this.bodyGroup) {
            // Aggressives Nach-Vorne-Lehnen beim Durchpflügen des Wassers + Raubtier-Windung
            const forwardPitch = isCharging ? 0.36 + Math.sin(t * 2.0) * 0.08 : 0.18;
            const bodyRoll = Math.sin(t) * (isCharging ? 0.18 : 0.07);
            const bodyYaw = Math.cos(t) * (isCharging ? 0.22 : 0.09);
            const surgeY = Math.abs(Math.sin(t)) * (isCharging ? 0.14 : 0.04);

            this.bodyGroup.rotation.set(forwardPitch, bodyYaw, bodyRoll);
            this.bodyGroup.position.y = surgeY;
        }

        // Kopf bleibt bedrohlich aufgerichtet und stößt bei jedem Zug nach vorne
        if (this.headGroup) {
            this.headGroup.rotation.x = isCharging ? -0.28 + Math.sin(t * 2.0) * 0.10 : -0.12;
            this.headGroup.rotation.z = Math.sin(t * 1.5) * (isCharging ? 0.18 : 0.06);
            this.headGroup.rotation.y = Math.cos(t) * 0.10;
        }

        // Weite 3D-Wasser-Greifschläge (Arme heben sich abwechselnd hoch aus dem Wasser und reißen nach vorne!)
        if (this.leftArm && this.rightArm) {
            const leftPhase = t;
            const rightPhase = t + Math.PI;

            if (isCharging) {
                // Überkopf-Wasser-Klauenschlag
                this.leftArm.rotation.x = -1.05 + Math.sin(leftPhase) * 0.95;
                this.leftArm.rotation.z = -0.28 - Math.max(0, Math.cos(leftPhase)) * 0.35;
                this.leftArm.userData.elbowGroup.rotation.x = -0.55 + Math.sin(leftPhase - 0.6) * 0.45;

                this.rightArm.rotation.x = -1.05 + Math.sin(rightPhase) * 0.95;
                this.rightArm.rotation.z = 0.28 + Math.max(0, Math.cos(rightPhase)) * 0.35;
                this.rightArm.userData.elbowGroup.rotation.x = -0.55 + Math.sin(rightPhase - 0.6) * 0.45;
            } else {
                // Lauerndes Brustschwimmen / Wasserteilen im tiefen Wasser
                this.leftArm.rotation.x = -0.85 + Math.sin(leftPhase) * 0.45;
                this.leftArm.rotation.z = -0.35 - Math.cos(leftPhase) * 0.25;
                this.leftArm.userData.elbowGroup.rotation.x = -0.65;

                this.rightArm.rotation.x = -0.85 + Math.sin(rightPhase) * 0.45;
                this.rightArm.rotation.z = 0.35 + Math.cos(rightPhase) * 0.25;
                this.rightArm.userData.elbowGroup.rotation.x = -0.65;
            }
        }

        const clawSnap = isCharging ? 0.15 + (Math.sin(t * 3.2) + 1.0) * 0.32 : 0.25;
        for (const f of this.leftFingers) f.rotation.x = clawSnap;
        for (const f of this.rightFingers) f.rotation.x = clawSnap;

        // Beine treten unter Wasser kräftig mit
        if (this.leftLeg && this.rightLeg) {
            const lKick = Math.sin(t);
            const rKick = Math.sin(t + Math.PI);
            this.leftLeg.rotation.x = -lKick * 0.65;
            this.rightLeg.rotation.x = -rKick * 0.65;
            this.leftLeg.userData.kneeGroup.rotation.x = Math.max(0, -lKick) * 0.85 + 0.15;
            this.rightLeg.userData.kneeGroup.rotation.x = Math.max(0, -rKick) * 0.85 + 0.15;
        }
    }

    animate(delta, isChasing = false, isWalking = false) {
        const moving = isChasing || isWalking;
        const speedMult = isChasing ? 13.5 : (isWalking ? 6.8 : 3.5);
        this.twitchTimer += delta * speedMult;

        if (this.torsoMesh) {
            const breath = 1.0 + Math.sin(this.twitchTimer * 1.5) * 0.025;
            this.torsoMesh.scale.set(breath, 1.0, breath);
        }

        if (this.bodyGroup) {
            const bobAmp = isChasing ? 0.065 : (isWalking ? 0.038 : 0.0);
            this.bodyGroup.position.y = Math.abs(Math.sin(this.twitchTimer)) * bobAmp;
            this.bodyGroup.rotation.x = 0;
            this.bodyGroup.rotation.y = moving ? Math.sin(this.twitchTimer) * (isChasing ? 0.12 : 0.07) : 0;
            this.bodyGroup.rotation.z = moving ? Math.cos(this.twitchTimer) * 0.035 : 0;
        }

        if (this.headGroup) {
            this.headGroup.rotation.x = 0;
            this.headGroup.rotation.z = Math.sin(this.twitchTimer * 1.7) * (isChasing ? 0.14 : 0.06);
            this.headGroup.rotation.y = Math.cos(this.twitchTimer * 1.2) * 0.08;
        }

        const armAmp = isChasing ? 0.65 : (isWalking ? 0.38 : 0.06);
        const armSwing = Math.sin(this.twitchTimer) * armAmp;
        if (this.leftArm && this.rightArm) {
            this.leftArm.rotation.y = 0;
            this.rightArm.rotation.y = 0;
            this.leftArm.rotation.z = 0;
            this.rightArm.rotation.z = 0;
            this.leftArm.rotation.x = -0.30 + armSwing;
            this.rightArm.rotation.x = -0.30 - armSwing;

            this.leftArm.userData.elbowGroup.rotation.x = -0.42 + Math.max(0, armSwing) * 0.45;
            this.rightArm.userData.elbowGroup.rotation.x = -0.42 + Math.max(0, -armSwing) * 0.45;
        }

        const clawCurl = (Math.sin(this.twitchTimer * 2.2) + 1.0) * 0.22;
        for (const f of this.leftFingers) f.rotation.x = clawCurl;
        for (const f of this.rightFingers) f.rotation.x = clawCurl;

        if (this.leftLeg && this.rightLeg) {
            if (moving) {
                const strideAmp = isChasing ? 0.68 : 0.46;
                const leftPhase = Math.sin(this.twitchTimer);
                const rightPhase = Math.sin(this.twitchTimer + Math.PI);

                this.leftLeg.rotation.x = -leftPhase * strideAmp;
                this.rightLeg.rotation.x = -rightPhase * strideAmp;

                this.leftLeg.userData.kneeGroup.rotation.x = Math.max(0, -leftPhase) * (strideAmp * 1.15) + 0.08;
                this.rightLeg.userData.kneeGroup.rotation.x = Math.max(0, -rightPhase) * (strideAmp * 1.15) + 0.08;
            } else {
                this.leftLeg.rotation.x = 0;
                this.rightLeg.rotation.x = 0;
                this.leftLeg.userData.kneeGroup.rotation.x = 0.05;
                this.rightLeg.userData.kneeGroup.rotation.x = 0.05;
            }
        }
    }
}
