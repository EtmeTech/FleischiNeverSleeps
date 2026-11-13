import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';

export class StrobeMechanic {
    constructor(scene, mannequins) {
        this.scene = scene;
        this.mannequins = mannequins; // Array of Fleischi Mannequins[cite: 1]
        this.lightTimer = 0.0;
        
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this.ambientLight);
    }

    update(delta, playerPos) {
        this.lightTimer += delta;
        
        // 3s light, 1.5s dark[cite: 1]
        const cycle = 4.5;
        const currentPhase = this.lightTimer % cycle;
        
        if (currentPhase < 3.0) {
            this.ambientLight.intensity = 0.8; // Lights ON
        } else {
            this.ambientLight.intensity = 0.05; // Lights OFF
            this.moveMannequins(delta, playerPos);
        }
    }

    moveMannequins(delta, playerPos) {
        // Mannequins move silently towards player only in the dark[cite: 1]
        this.mannequins.forEach(m => {
            const dir = new THREE.Vector3().subVectors(playerPos, m.position).normalize();
            dir.y = 0;
            m.position.addScaledVector(dir, 3.0 * delta); // 3 m/s crawl speed
            
            if (m.position.distanceTo(playerPos) < 1.0) {
                console.log("JUMPSCARE: Mannequin grabbed you!");
                window.location.reload();
            }
        });
    }
}


// [MILAN_MODE_HOOK_B4]

(() => {
    const cls = (typeof StrobeMechanic !== 'undefined') ? StrobeMechanic : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            if (milanMode.isMilan && typeof this.stunDuration === 'number' && !this._milanAdjusted) {
                this._milanAdjusted = true;
                // Strobe stun is shorter in Milan mode so you have to rely on the Furz-Button!
                this.stunDuration *= 0.65;
            }
            return orig.apply(this, args);
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
