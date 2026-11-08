import * as THREE from 'three';

export class FleshTextureGenerator {
    static createSinewMaterial() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Dark bloody base
        ctx.fillStyle = '#2b0303';
        ctx.fillRect(0, 0, 512, 512);

        // Striated muscle fibers
        for (let i = 0; i < 900; i++) {
            const y = Math.random() * 512;
            const h = Math.random() * 3 + 1;
            const shade = Math.floor(Math.random() * 110 + 60);
            ctx.fillStyle = `rgba(${shade + 40}, ${Math.floor(shade * 0.15)}, ${Math.floor(shade * 0.15)}, ${Math.random() * 0.7 + 0.3})`;
            ctx.fillRect(0, y, 512, h);
        }

        // Connective white fascia/tendons
        ctx.strokeStyle = 'rgba(230, 200, 200, 0.25)';
        ctx.lineWidth = 1.2;
        for (let j = 0; j < 35; j++) {
            ctx.beginPath();
            let x = 0;
            let y = Math.random() * 512;
            ctx.moveTo(x, y);
            while (x < 512) {
                x += Math.random() * 50 + 20;
                y += (Math.random() - 0.5) * 40;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        return new THREE.MeshStandardMaterial({
            map: texture,
            color: 0x9e1818,
            roughness: 0.25,
            metalness: 0.15,
            bumpMap: texture,
            bumpScale: 0.05
        });
    }
}
