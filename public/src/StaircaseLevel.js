import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }

export class StaircaseLevel {
    constructor(scene, playerControls, onExitReached) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('potenz_treppenhaus', this), 200); }
        this.scene = scene;
        this.player = playerControls;
        this.onExitReached = onExitReached;
        this.currentFloor = 2;
        this.sequence = [2, 4, 8, 16, 32];
        this.targetFloor = 32;
        this.doors = [];
        this.buildStairwell();
    }

    buildStairwell() {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x303030 });
        const shaftGeo = new THREE.BoxGeometry(6, 40, 6);
        const shaft = new THREE.Mesh(shaftGeo, wallMat);
        shaft.position.set(0, 15, 0);
        this.scene.add(shaft);

        for (let i = 0; i < this.sequence.length; i++) {
            const floorNum = this.sequence[i];
            const y = i * 6;

            const doorGeo = new THREE.BoxGeometry(1.2, 2.2, 0.1);
            const doorMat = new THREE.MeshStandardMaterial({ color: floorNum === 32 ? 0x8b0000 : 0x444444 });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(0, y + 1.1, 2.9);
            door.userData = { floor: floorNum };
            this.scene.add(door);
            this.doors.push(door);
        }
    }

    interactWithDoor(doorMesh) {
        const floor = doorMesh.userData.floor;
        if (floor === this.targetFloor) {
            console.log("Correct door reached (Floor 32). Staircase unlocked.");
            this.onExitReached();
        } else {
            console.log(`Wrong door (Floor ${floor})! Fleischi ambushes!`);
            document.getElementById('jumpscare-overlay').style.display = 'block';
            setTimeout(() => window.location.reload(), 1800);
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof StaircaseLevel !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'potenz_treppenhaus', cls: StaircaseLevel });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('potenz_treppenhaus', StaircaseLevel);
  }
}
