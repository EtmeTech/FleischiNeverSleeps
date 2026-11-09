import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { ProceduralTextures } from './ProceduralTextures.js';
import { MitternachtTerminal } from './MitternachtTerminal.js';

export class Level01 {
    constructor(scene, graphicsEngine, onUnlock) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('gang', this), 350); }
        this.scene = scene;
        this.graphics = graphicsEngine;
        this.onUnlock = onUnlock;
        this.buildRoom();
    }

    buildRoom() {
        const concreteMat = ProceduralTextures.getConcreteMaterial();
        const roomGeo = new THREE.BoxGeometry(5, 3, 4);
        const room = new THREE.Mesh(roomGeo, concreteMat);
        room.position.set(0, 1.5, 0);
        room.material.side = THREE.BackSide;
        room.receiveShadow = true;
        this.scene.add(room);

        const deskGeo = new THREE.BoxGeometry(1.5, 0.8, 0.8);
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.7 });
        const desk = new THREE.Mesh(deskGeo, woodMat);
        desk.position.set(0, 0.4, -1.6);
        desk.castShadow = true;
        desk.receiveShadow = true;
        this.scene.add(desk);

        const laptopGeo = new THREE.BoxGeometry(0.5, 0.05, 0.4);
        const plasticMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
        this.laptop = new THREE.Mesh(laptopGeo, plasticMat);
        this.laptop.position.set(0, 0.825, -1.6);
        this.laptop.castShadow = true;
        this.scene.add(this.laptop);

        // Desk Lamp
        this.lampLight = this.graphics.createFlickeringLight(0xffeedd, 5.0, 10.0, new THREE.Vector3(0, 1.2, -1.6));
        
        this.terminal = new MitternachtTerminal(() => {
            this.lampLight.color.setHex(0x00ff00); // Visual feedback
            this.onUnlock();
        });
    }

    update(delta) {
        // Subtle light flicker
        this.lampLight.intensity = 4.5 + Math.random() * 1.0;
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof Level01 !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'gang', cls: Level01 });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('gang', Level01);
  }
}


// [MILAN_MODE_HOOK_B4]

(() => {
    const cls = (typeof Level01Refactored !== 'undefined') ? Level01Refactored : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('Level01Refactored', this);
            if (this._milanFurzKnockedDown && (
                method.toLowerCase().includes('monster') ||
                method.toLowerCase().includes('attack') ||
                method.toLowerCase().includes('chase')
            )) {
                return;
            }
            if (milanMode.isMilan && (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick'))) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.55;
                }
            }
            return orig.apply(this, args);
        };
    }
})();

