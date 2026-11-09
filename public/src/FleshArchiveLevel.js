import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';

export class FleshArchiveLevel {
    constructor(scene, playerControls) {
        this.scene = scene;
        this.player = playerControls;
        this.acidCharges = 3;
        this.tendrilBarriers = [];
        this.patrolFleischi = null;
        this.lanternSpot = null;
        this.initFleshEnvironment();
        this.initPatrol();
    }

    initFleshEnvironment() {
        const tendrilGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.0, 6);
        const tendrilMat = new THREE.MeshStandardMaterial({ color: 0x5a1111, roughness: 0.3 });

        for (let i = 0; i < 4; i++) {
            const barrierGroup = new THREE.Group();
            for (let j = 0; j < 8; j++) {
                const tendril = new THREE.Mesh(tendrilGeo, tendrilMat);
                tendril.position.set((j - 4) * 0.25, 1.5, 0);
                tendril.rotation.z = (Math.random() - 0.5) * 0.4;
                barrierGroup.add(tendril);
            }
            barrierGroup.position.set(0, 0, -10 - (i * 8));
            barrierGroup.userData = { dissolved: false };
            this.scene.add(barrierGroup);
            this.tendrilBarriers.push(barrierGroup);
        }
    }

    initPatrol() {
        this.patrolFleischi = new THREE.Group();
        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.2, 2.35, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x220505 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.175;
        this.patrolFleischi.add(body);

        this.lanternSpot = new THREE.SpotLight(0xffdd66, 4.0, 14.0, Math.PI / 6, 0.5, 1.0);
        this.lanternSpot.position.set(0, 1.8, 0.5);
        const targetObj = new THREE.Object3D();
        targetObj.position.set(0, 0, 5);
        this.patrolFleischi.add(targetObj);
        this.lanternSpot.target = targetObj;
        this.patrolFleischi.add(this.lanternSpot);

        this.patrolFleischi.position.set(0, 0, -40);
        this.scene.add(this.patrolFleischi);
    }

    useAcid() {
        if (this.acidCharges <= 0) return;
        const pPos = this.player.camera.position;

        for (let b of this.tendrilBarriers) {
            if (!b.userData.dissolved && pPos.distanceTo(b.position) < 3.0) {
                b.userData.dissolved = true;
                b.visible = false;
                this.acidCharges--;
                console.log(`Acid dissolved flesh barrier! Charges left: ${this.acidCharges}`);
                return;
            }
        }
    }

    update(delta) {
        const time = performance.now() * 0.001;
        this.patrolFleischi.position.x = Math.sin(time * 0.8) * 4.0;

        const pPos = this.player.camera.position;
        const toPlayer = new THREE.Vector3().subVectors(pPos, this.patrolFleischi.position);
        const dist = toPlayer.length();

        if (dist < 12.0) {
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.patrolFleischi.quaternion);
            const angle = forward.angleTo(toPlayer.normalize());
            if (angle < Math.PI / 6) {
                console.log("Player caught in Fleischi lantern cone!");
                document.getElementById('jumpscare-overlay').style.display = 'block';
                setTimeout(() => window.location.reload(), 1500);
            }
        }
    }
}


// [MILAN_MODE_HOOK_B3]

(() => {
    const cls = (typeof FleshArchiveLevel !== 'undefined') ? FleshArchiveLevel : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('FleshArchiveLevel', this);
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
                    args[0] = args[0] * 1.65;
                }
            }
            return orig.apply(this, args);
        };
    }
})();

