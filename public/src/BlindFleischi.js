import * as THREE from 'three';

export class BlindFleischi {
    constructor(scene, playerControls) {
        this.scene = scene;
        this.player = playerControls;
        this.isActive = false;
        
        // Mechanics based on GDD Level 05[cite: 1]
        this.walkHearRadius = 6.0;
        this.sprintHearRadius = 20.0;
        this.speed = 4.5;
        this.mesh = this.buildMesh();
    }

    buildMesh() {
        const group = new THREE.Group();
        const geo = new THREE.CylinderGeometry(0.3, 0.2, 2.35, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x111111 }); // Darker, blind variant
        const body = new THREE.Mesh(geo, mat);
        body.position.y = 1.175;
        group.add(body);
        
        // No face sprite for Blind Fleischi[cite: 1]
        group.position.set(0, 0, -15);
        this.scene.add(group);
        return group;
    }

    update(delta, playerPos) {
        if (!this.isActive) return;

        let hearRadius = this.player.isCrouching ? 0.0 : (this.player.isSprinting ? this.sprintHearRadius : this.walkHearRadius);
        let dist = this.mesh.position.distanceTo(playerPos);

        if (dist <= hearRadius) {
            // Move towards player if heard
            const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).normalize();
            dir.y = 0;
            this.mesh.position.addScaledVector(dir, this.speed * delta);
        }

        if (dist < 1.2) {
            console.log("JUMPSCARE: Blind Fleischi caught you!");
            window.location.reload();
        }
    }
}
