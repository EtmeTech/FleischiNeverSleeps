import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }

export class GalleriaLevel {
    constructor(scene, playerControls) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('mega_labyrinth', this), 350); }
        this.scene = scene;
        this.player = playerControls;
        this.fusesCollected = 0;
        this.totalFuses = 3;
        this.fuseMeshes = [];
        this.coldRoomBounds = new THREE.Box3(
            new THREE.Vector3(-15, 0, -35),
            new THREE.Vector3(-5, 5, -20)
        );
        this.initEnvironment();
    }

    initEnvironment() {
        const floorGeo = new THREE.PlaneGeometry(60, 60);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.8 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);

        const storeGeo = new THREE.BoxGeometry(10, 4, 15);
        const storeMat = new THREE.MeshStandardMaterial({ color: 0x22222a });
        const coldRoom = new THREE.Mesh(storeGeo, storeMat);
        coldRoom.position.set(-10, 2, -27.5);
        this.scene.add(coldRoom);

        const fuseSpawnPoints = [
            new THREE.Vector3(-10, 0.8, -30),
            new THREE.Vector3(12, 0.8, -10),
            new THREE.Vector3(4, 0.8, 14)
        ];

        fuseSpawnPoints.forEach((pos, idx) => {
            const fuseGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 12);
            const fuseMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x553300 });
            const mesh = new THREE.Mesh(fuseGeo, fuseMat);
            mesh.position.copy(pos);
            mesh.userData = { id: idx, collected: false };
            this.scene.add(mesh);
            this.fuseMeshes.push(mesh);
        });
    }

    update(delta) {
        const pPos = this.player.camera.position;

        if (this.coldRoomBounds.containsPoint(pPos)) {
            if (this.scene.fog === null || this.scene.fog.far > 3.0) {
                this.scene.fog = new THREE.Fog(0x050505, 0.5, 3.0);
            }
        } else {
            if (this.scene.fog && this.scene.fog.far <= 3.0) {
                this.scene.fog = new THREE.Fog(0x050505, 5.0, 30.0);
            }
        }

        for (let i = 0; i < this.fuseMeshes.length; i++) {
            const fuse = this.fuseMeshes[i];
            if (!fuse.userData.collected && pPos.distanceTo(fuse.position) < 1.4) {
                fuse.userData.collected = true;
                fuse.visible = false;
                this.fusesCollected++;
                console.log(`Fuse collected: ${this.fusesCollected}/${this.totalFuses}`);
                if (this.fusesCollected === this.totalFuses) {
                    console.log("All fuses collected. Elevator power restored.");
                }
            }
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof GalleriaLevel !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'mega_labyrinth', cls: GalleriaLevel });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('mega_labyrinth', GalleriaLevel);
  }
}
