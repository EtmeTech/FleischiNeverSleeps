import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
import { FleischiMonster } from './FleischiMonster.js';

export class MidnightArena {
    constructor(scene, playerControls, onVictory, onCaughtCallback) {
        this.scene = scene;
        this.player = playerControls;
        this.onVictory = onVictory;
        this.onCaughtCallback = onCaughtCallback;

        this.apexSpeed = 5.4;
        this.killThreshold = 1.35;
        this.isActive = true;

        this.cranks = [
            { id: 'hour', pos: new THREE.Vector3(0, 1.0, -14), locked: false },
            { id: 'min', pos: new THREE.Vector3(-14, 1.0, 0), locked: false },
            { id: 'sec', pos: new THREE.Vector3(14, 1.0, 0), locked: false }
        ];

        this.initArena();
        this.initApexFleischi();
    }

    initArena() {
        const dialGeo = new THREE.CylinderGeometry(22, 22, 1, 32);
        const dialMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.6 });
        const dial = new THREE.Mesh(dialGeo, dialMat);
        dial.position.y = -0.5;
        this.scene.add(dial);

        const arenaLight = new THREE.PointLight(0xff4422, 3.0, 35);
        arenaLight.position.set(0, 8, 0);
        this.scene.add(arenaLight);

        this.cranks.forEach(c => {
            const crankGeo = new THREE.BoxGeometry(0.7, 1.4, 0.7);
            const crankMat = new THREE.MeshStandardMaterial({
                color: 0xffaa00,
                emissive: 0x552200,
                metalness: 0.8
            });
            const mesh = new THREE.Mesh(crankGeo, crankMat);
            mesh.position.copy(c.pos);
            mesh.userData = c;
            c.mesh = mesh;
            this.scene.add(mesh);
        });
    }

    initApexFleischi() {
        this.monsterEntity = new FleischiMonster();
        this.monsterGroup = this.monsterEntity.group;
        this.monsterGroup.position.set(0, 0, 15);
        this.scene.add(this.monsterGroup);
    }

    interactCrank() {
        const pPos = this.player.camera.position;
        for (let c of this.cranks) {
            const dist = Math.hypot(pPos.x - c.pos.x, pPos.z - c.pos.z);
            if (!c.locked && dist < 2.6) {
                c.locked = true;
                if (c.mesh) {
                    c.mesh.material.color.setHex(0x00ff66);
                    c.mesh.material.emissive.setHex(0x005522);
                }
                this.checkMidnightCondition();
                return;
            }
        }
    }

    checkMidnightCondition() {
        const allLocked = this.cranks.every(c => c.locked);
        if (allLocked) {
            this.isActive = false;
            this.monsterGroup.visible = false;
            this.onVictory();
        }
    }

    resetOnCatch() {
        this.monsterGroup.position.set(0, 0, 15);
        this.isActive = true;
    }

    update(delta) {
        if (!this.isActive || !this.monsterGroup.visible) return;

        this.monsterEntity.animate(delta, true);

        const pPos = this.player.camera.position;
        const mPos = this.monsterGroup.position;
        const dir = new THREE.Vector3(pPos.x - mPos.x, 0, pPos.z - mPos.z).normalize();
        mPos.addScaledVector(dir, this.apexSpeed * delta);
        this.monsterGroup.lookAt(pPos.x, 0, pPos.z);

        const horizDist = Math.hypot(pPos.x - mPos.x, pPos.z - mPos.z);
        if (horizDist <= this.killThreshold) {
            this.isActive = false;
            if (this.onCaughtCallback) {
                this.onCaughtCallback(this.monsterEntity, this.monsterGroup);
            }
        }
    }
}


// [MILAN_MODE_HOOK_B3]

(() => {
    const cls = (typeof MidnightArena !== 'undefined') ? MidnightArena : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('MidnightArena', this);
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
                    args[0] = args[0] * 1.75;
                }
            }
            return orig.apply(this, args);
        };
    }
})();

