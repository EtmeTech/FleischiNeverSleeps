import * as THREE from 'three';

export class ProceduralTextures {
    static createWoodFloor(repeatX = 4, repeatY = 4) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#1e0f07';
        ctx.fillRect(0, 0, 1024, 1024);

        const numPlanks = 8;
        const plankH = 1024 / numPlanks;

        for (let row = 0; row < numPlanks; row++) {
            const y = row * plankH;
            const jointX = ((row * 370) % 760) + 120;

            const planks = [
                { x: 0, w: jointX },
                { x: jointX, w: 1024 - jointX }
            ];

            for (const p of planks) {
                const shade = Math.floor(Math.random() * 14) - 7;
                const r = Math.max(18, 46 + shade);
                const g = Math.max(9, 24 + Math.floor(shade * 0.6));
                const b = Math.max(4, 12 + Math.floor(shade * 0.3));

                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(p.x + 2, y + 2, p.w - 4, plankH - 4);

                for (let i = 0; i < 70; i++) {
                    const gy = y + 4 + Math.random() * (plankH - 8);
                    const gh = Math.random() * 2.5 + 0.8;
                    ctx.fillStyle = i % 2 === 0 ? 'rgba(10, 4, 1, 0.28)' : 'rgba(90, 50, 22, 0.12)';
                    ctx.fillRect(p.x + 4, gy, p.w - 8, gh);
                }

                if (Math.random() < 0.65) {
                    const kx = p.x + 40 + Math.random() * Math.max(20, p.w - 80);
                    const ky = y + 24 + Math.random() * (plankH - 48);
                    const kr = 8 + Math.random() * 10;
                    const kGrad = ctx.createRadialGradient(kx, ky, 1, kx, ky, kr * 2.2);
                    kGrad.addColorStop(0, '#0a0401');
                    kGrad.addColorStop(0.5, '#1f0e05');
                    kGrad.addColorStop(1, 'rgba(30, 14, 5, 0)');
                    ctx.fillStyle = kGrad;
                    ctx.beginPath();
                    ctx.ellipse(kx, ky, kr * 2.2, kr * 0.9, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.strokeStyle = '#070301';
                ctx.lineWidth = 4;
                ctx.strokeRect(p.x + 1, y + 1, p.w - 2, plankH - 2);

                ctx.fillStyle = '#0a0402';
                for (const ny of [y + 18, y + plankH - 18]) {
                    ctx.beginPath();
                    ctx.arc(p.x + 14, ny, 3.2, 0, Math.PI * 2);
                    ctx.arc(p.x + p.w - 14, ny, 3.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);

        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.028,
            roughness: 0.56,
            metalness: 0.08
        });
    }

    static createWallpaper(repeatX = 4, repeatY = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#211e18';
        ctx.fillRect(0, 0, 1024, 1024);

        for (let x = 0; x < 1024; x += 64) {
            ctx.fillStyle = (x / 64) % 2 === 0 ? 'rgba(42, 37, 29, 0.58)' : 'rgba(24, 21, 16, 0.58)';
            ctx.fillRect(x, 0, 32, 700);

            ctx.strokeStyle = 'rgba(80, 66, 42, 0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 32, 0);
            ctx.lineTo(x + 32, 700);
            ctx.stroke();

            for (let y = 48; y < 680; y += 64) {
                ctx.fillStyle = 'rgba(70, 56, 35, 0.22)';
                ctx.beginPath();
                ctx.moveTo(x + 16, y - 14);
                ctx.lineTo(x + 28, y);
                ctx.lineTo(x + 16, y + 14);
                ctx.lineTo(x + 4, y);
                ctx.closePath();
                ctx.fill();
            }
        }

        for (let i = 0; i < 55; i++) {
            const sx = Math.random() * 1024;
            const sy = Math.random() * 680;
            const sr = 30 + Math.random() * 85;
            const sGrad = ctx.createRadialGradient(sx, sy, 4, sx, sy, sr);
            sGrad.addColorStop(0, 'rgba(8, 5, 3, 0.45)');
            sGrad.addColorStop(1, 'rgba(8, 5, 3, 0)');
            ctx.fillStyle = sGrad;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#1c0f08';
        ctx.fillRect(0, 700, 1024, 324);

        ctx.fillStyle = '#331c0e';
        ctx.fillRect(0, 692, 1024, 18);
        ctx.fillStyle = '#0c0602';
        ctx.fillRect(0, 710, 1024, 6);

        for (let x = 16; x < 1024; x += 128) {
            ctx.fillStyle = '#140904';
            ctx.fillRect(x, 734, 96, 230);
            ctx.strokeStyle = '#2b160b';
            ctx.lineWidth = 6;
            ctx.strokeRect(x + 3, 737, 90, 224);
            ctx.strokeStyle = '#080301';
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 10, 744, 76, 210);
        }

        ctx.fillStyle = '#0e0603';
        ctx.fillRect(0, 984, 1024, 40);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);

        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.024,
            roughness: 0.82,
            metalness: 0.05
        });
    }

    static createCeiling(repeatX = 4, repeatY = 4) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#110f0d';
        ctx.fillRect(0, 0, 512, 512);

        for (let y = 0; y < 512; y += 128) {
            for (let x = 0; x < 512; x += 128) {
                ctx.fillStyle = '#161310';
                ctx.fillRect(x + 6, y + 6, 116, 116);
                ctx.strokeStyle = '#070605';
                ctx.lineWidth = 6;
                ctx.strokeRect(x + 3, y + 3, 122, 122);
                ctx.strokeStyle = '#221c17';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 12, y + 12, 104, 104);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);

        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.022,
            roughness: 0.88,
            metalness: 0.05
        });
    }

    static createFurnitureWood(baseHex = '#2e160b', borderHex = '#170a04') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseHex;
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 180; i++) {
            const y = Math.random() * 512;
            const h = Math.random() * 4 + 1;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.20)' : 'rgba(255,200,150,0.06)';
            ctx.fillRect(0, y, 512, h);
        }

        ctx.strokeStyle = borderHex;
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, 498, 498);
        ctx.strokeStyle = 'rgba(255, 210, 160, 0.12)';
        ctx.lineWidth = 3;
        ctx.strokeRect(18, 18, 476, 476);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.016,
            roughness: 0.48,
            metalness: 0.1
        });
    }

    static createFabricTexture(type = 'blanket') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        if (type === 'blanket') {
            ctx.fillStyle = '#4d0c0c';
            ctx.fillRect(0, 0, 512, 512);
            for (let y = 0; y < 512; y += 4) {
                ctx.fillStyle = y % 8 === 0 ? 'rgba(0,0,0,0.18)' : 'rgba(255,120,120,0.05)';
                ctx.fillRect(0, y, 512, 2);
            }
            for (let x = 0; x < 512; x += 64) {
                const foldGrad = ctx.createLinearGradient(x, 0, x + 64, 0);
                foldGrad.addColorStop(0, 'rgba(0,0,0,0.30)');
                foldGrad.addColorStop(0.5, 'rgba(255,180,180,0.08)');
                foldGrad.addColorStop(1, 'rgba(0,0,0,0.30)');
                ctx.fillStyle = foldGrad;
                ctx.fillRect(x, 0, 64, 512);
            }
        } else if (type === 'mattress') {
            ctx.fillStyle = '#c8bfb0';
            ctx.fillRect(0, 0, 512, 512);
            ctx.strokeStyle = 'rgba(85, 75, 60, 0.35)';
            ctx.lineWidth = 3;
            for (let i = -512; i < 1024; i += 48) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i + 512, 512);
                ctx.moveTo(i + 512, 0);
                ctx.lineTo(i, 512);
                ctx.stroke();
            }
        } else {
            ctx.fillStyle = '#e5e0d5';
            ctx.fillRect(0, 0, 512, 512);
            const pGrad = ctx.createRadialGradient(256, 256, 30, 256, 256, 250);
            pGrad.addColorStop(0, '#f5f2eb');
            pGrad.addColorStop(1, '#b2a99b');
            ctx.fillStyle = pGrad;
            ctx.fillRect(0, 0, 512, 512);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.018,
            roughness: 0.85,
            metalness: 0.02
        });
    }

    static createDetailedDoorMaterial(baseColor = '#361c0e', panelDark = '#210f06', highlight = '#4f2b17') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, 512, 1024);

        for (let i = 0; i < 240; i++) {
            const x = Math.random() * 512;
            const w = Math.random() * 3 + 1;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.20)' : 'rgba(255,190,130,0.06)';
            ctx.fillRect(x, 0, w, 1024);
        }

        ctx.strokeStyle = panelDark;
        ctx.lineWidth = 18;
        ctx.strokeRect(9, 9, 494, 1006);

        const panels = [
            { x: 52, y: 56, w: 182, h: 360 },
            { x: 278, y: 56, w: 182, h: 360 },
            { x: 52, y: 520, w: 182, h: 420 },
            { x: 278, y: 520, w: 182, h: 420 }
        ];

        for (const p of panels) {
            ctx.fillStyle = panelDark;
            ctx.fillRect(p.x, p.y, p.w, p.h);

            ctx.fillStyle = baseColor;
            ctx.fillRect(p.x + 18, p.y + 18, p.w - 36, p.h - 36);

            ctx.strokeStyle = highlight;
            ctx.lineWidth = 4;
            ctx.strokeRect(p.x + 16, p.y + 16, p.w - 32, p.h - 32);

            ctx.strokeStyle = '#0d0502';
            ctx.lineWidth = 6;
            ctx.strokeRect(p.x + 3, p.y + 3, p.w - 6, p.h - 6);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.032,
            roughness: 0.55,
            metalness: 0.08
        });
    }

    static createLaptopKeyboardMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 700;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#1b1d22';
        ctx.fillRect(0, 0, 1024, 700);

        for (let y = 0; y < 700; y += 2) {
            ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.12)';
            ctx.fillRect(0, y, 1024, 1);
        }

        ctx.strokeStyle = '#2d3139';
        ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, 1012, 688);

        ctx.fillStyle = '#0b0c0e';
        for (let x = 110; x < 780; x += 10) {
            for (let y = 26; y < 56; y += 8) {
                ctx.beginPath();
                ctx.arc(x, y, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.fillStyle = '#101216';
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.strokeRect(845, 24, 68, 30);
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PWR', 879, 44);

        ctx.fillStyle = '#0c0d10';
        ctx.fillRect(68, 72, 888, 385);
        ctx.strokeStyle = '#2a2e36';
        ctx.lineWidth = 4;
        ctx.strokeRect(68, 72, 888, 385);

        const rows = [
            ['ESC', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'DEL'],
            ['^', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ß', '´', 'BACK'],
            ['TAB', 'Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü', '+', 'ENTER'],
            ['CAPS', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä', '#', 'RETURN'],
            ['SHIFT', '<', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '-', 'SHIFT'],
            ['CTRL', 'FN', 'WIN', 'ALT', 'SPACE', 'ALT GR', 'CTRL', '◄', '▲▼', '►']
        ];

        let curY = 82;
        rows.forEach((row, rIdx) => {
            const keyH = rIdx === 0 ? 40 : 56;
            const gap = 6;
            const totalW = 868;

            const weights = row.map((label) => {
                if (label === 'SPACE') return 4.6;
                if (label === 'BACK' || label === 'ENTER' || label === 'RETURN' || label === 'SHIFT' || label === 'CAPS') return 1.85;
                if (label === 'TAB' || label === 'CTRL' || label === 'ALT GR') return 1.35;
                return 1.0;
            });
            const weightSum = weights.reduce((a, b) => a + b, 0);
            let curX = 78;

            row.forEach((label, kIdx) => {
                const kw = (weights[kIdx] / weightSum) * (totalW - (row.length - 1) * gap);

                ctx.fillStyle = '#1e2128';
                ctx.fillRect(curX, curY, kw, keyH);

                ctx.strokeStyle = '#363b46';
                ctx.lineWidth = 2;
                ctx.strokeRect(curX + 1, curY + 1, kw - 2, keyH - 3);

                const isHighlight = ['W', 'A', 'S', 'D', 'E'].includes(label);
                ctx.fillStyle = isHighlight ? '#00ffaa' : '#d8dee9';
                ctx.font = label.length > 2 ? 'bold 14px sans-serif' : 'bold 19px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, curX + kw / 2, curY + keyH / 2);

                curX += kw + gap;
            });

            curY += keyH + gap;
        });

        const tpX = 332;
        const tpY = 478;
        const tpW = 360;
        const tpH = 196;

        ctx.fillStyle = '#14161a';
        ctx.fillRect(tpX, tpY, tpW, tpH);
        ctx.strokeStyle = '#343942';
        ctx.lineWidth = 4;
        ctx.strokeRect(tpX, tpY, tpW, tpH);

        ctx.beginPath();
        ctx.moveTo(tpX, tpY + tpH - 42);
        ctx.lineTo(tpX + tpW, tpY + tpH - 42);
        ctx.moveTo(tpX + tpW / 2, tpY + tpH - 42);
        ctx.lineTo(tpX + tpW / 2, tpY + tpH);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.015,
            roughness: 0.38,
            metalness: 0.45
        });
    }

    static createHallwayWall(repeatX = 14, repeatY = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#191412';
        ctx.fillRect(0, 0, 1024, 660);

        for (let x = 0; x < 1024; x += 64) {
            ctx.fillStyle = (x / 64) % 2 === 0 ? 'rgba(36, 24, 18, 0.7)' : 'rgba(18, 12, 9, 0.7)';
            ctx.fillRect(x, 0, 32, 660);

            ctx.fillStyle = 'rgba(105, 22, 12, 0.22)';
            ctx.fillRect(x + 12, 0, 4, 660);
        }

        // Schimmel-, Riss- & Blutspuren an der Korridor-Tapete
        for (let i = 0; i < 65; i++) {
            const rx = Math.random() * 1024;
            const ry = Math.random() * 620;
            const rad = 20 + Math.random() * 75;
            const g = ctx.createRadialGradient(rx, ry, 2, rx, ry, rad);
            g.addColorStop(0, i % 3 === 0 ? 'rgba(65, 6, 4, 0.45)' : 'rgba(5, 3, 2, 0.55)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(rx, ry, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        const topGrime = ctx.createLinearGradient(0, 0, 0, 260);
        topGrime.addColorStop(0, 'rgba(0,0,0,0.88)');
        topGrime.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrime;
        ctx.fillRect(0, 0, 1024, 260);

        ctx.fillStyle = '#180b05';
        ctx.fillRect(0, 660, 1024, 364);

        ctx.fillStyle = '#301609';
        ctx.fillRect(0, 650, 1024, 20);

        for (let x = 16; x < 1024; x += 128) {
            ctx.fillStyle = '#0e0602';
            ctx.fillRect(x, 692, 96, 280);
            ctx.strokeStyle = '#261207';
            ctx.lineWidth = 6;
            ctx.strokeRect(x + 4, 696, 88, 272);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);

        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.03,
            roughness: 0.80,
            metalness: 0.08
        });
    }

    // EXTREM AUFWENDIGER HORROR-BODEN FÜR DEN GANG (Alte Eichendielen + zerschlissener viktorianischer Teppichläufer + Blutflecken!)
    static createHallwayFloor(repeatX = 1, repeatY = 16) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // 1. Detaillierte verrottete Holzdielen links (0..210) und rechts (814..1024)
        ctx.fillStyle = '#170b05';
        ctx.fillRect(0, 0, 1024, 1024);

        const plankW = 52;
        for (let x = 0; x < 1024; x += plankW) {
            if (x > 200 && x < 780) continue;
            const shade = (x % 104 === 0) ? '#211007' : '#180b04';
            ctx.fillStyle = shade;
            ctx.fillRect(x + 2, 0, plankW - 4, 1024);

            // Querfugen & Dielen-Nägel
            for (let y = 128; y < 1024; y += 256) {
                ctx.fillStyle = '#080301';
                ctx.fillRect(x, y, plankW, 5);
                ctx.beginPath();
                ctx.arc(x + 14, y - 14, 3.5, 0, Math.PI * 2);
                ctx.arc(x + plankW - 14, y - 14, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Holzmaserung auf den Randdielen
            for (let g = 0; g < 40; g++) {
                ctx.fillStyle = 'rgba(0,0,0,0.28)';
                ctx.fillRect(x + Math.random() * (plankW - 6), Math.random() * 1024, 2, 90);
            }
        }

        // Schattenkante unter dem Teppichläufer
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(198, 0, 628, 1024);

        // 2. Schwerer, gealterter Horror-Teppichläufer in der Mitte (x = 210 bis 814)
        ctx.fillStyle = '#380707';
        ctx.fillRect(210, 0, 604, 1024);

        // Ausgefranste goldene Fransen-Bordüre am linken & rechten Teppichrand
        ctx.fillStyle = '#7a561d';
        ctx.fillRect(222, 0, 18, 1024);
        ctx.fillRect(784, 0, 18, 1024);
        ctx.fillStyle = '#1f0303';
        ctx.fillRect(246, 0, 10, 1024);
        ctx.fillRect(768, 0, 10, 1024);

        // Aufwendige viktorianische Medaillons & Rauten-Muster auf dem Läufer
        for (let y = 128; y < 1024; y += 256) {
            // Äußere Gold-Raute
            ctx.strokeStyle = '#825c22';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(512, y - 96);
            ctx.lineTo(710, y);
            ctx.lineTo(512, y + 96);
            ctx.lineTo(314, y);
            ctx.closePath();
            ctx.stroke();

            // Innere dunkelrote Zier-Raute
            ctx.fillStyle = '#240303';
            ctx.beginPath();
            ctx.moveTo(512, y - 64);
            ctx.lineTo(645, y);
            ctx.lineTo(512, y + 64);
            ctx.lineTo(379, y);
            ctx.closePath();
            ctx.fill();

            // Zentrales Ornament-Medaillon
            ctx.strokeStyle = '#9c712b';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(512, y, 28, 0, Math.PI * 2);
            ctx.stroke();

            // Eck-Ornamente
            for (const cx of [285, 739]) {
                ctx.fillStyle = '#634416';
                ctx.fillRect(cx - 12, y - 110, 24, 24);
                ctx.fillRect(cx - 12, y + 86, 24, 24);
            }
        }

        // Feine gewebte Teppich-Struktur (Kreuzschraffur)
        for (let y = 0; y < 1024; y += 4) {
            ctx.fillStyle = y % 8 === 0 ? 'rgba(0,0,0,0.22)' : 'rgba(255,190,140,0.04)';
            ctx.fillRect(210, y, 604, 2);
        }

        // Dunkle Schmutz-, Schleif- und Blutflecken auf dem Teppich und den Dielen
        for (let i = 0; i < 35; i++) {
            const bx = 120 + Math.random() * 780;
            const by = Math.random() * 1024;
            const br = 25 + Math.random() * 85;
            const bGrad = ctx.createRadialGradient(bx, by, 4, bx, by, br);
            bGrad.addColorStop(0, i % 2 === 0 ? 'rgba(25, 2, 2, 0.72)' : 'rgba(8, 5, 3, 0.65)');
            bGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);

        return new THREE.MeshStandardMaterial({
            map: tex,
            bumpMap: tex,
            bumpScale: 0.032,
            roughness: 0.72,
            metalness: 0.06
        });
    }

    static createConcreteHallway(repeatX = 14, repeatY = 1) {
        return ProceduralTextures.createHallwayWall(repeatX, repeatY);
    }

    static getConcreteMaterial() {
        return ProceduralTextures.createHallwayWall(14, 1);
    }
}
