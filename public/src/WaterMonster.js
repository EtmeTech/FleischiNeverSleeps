import * as THREE from 'three';

export class WaterMonster {
    constructor(scene, playerControls) {
        this.scene = scene;
        this.player = playerControls;
        this.waterLevel = 0.5; // Knee-deep water
        this.inWaterTimer = 0.0;
        this.maxWaterTime = 3.5; // 3.5 seconds to reach dry platform[cite: 1]
        
        // Particle system for V-shaped wake[cite: 1]
        this.wakeGeo = new THREE.BufferGeometry();
        this.wakeMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 });
        this.wakeParticles = new THREE.Points(this.wakeGeo, this.wakeMat);
        this.scene.add(this.wakeParticles);
    }

    update(delta) {
        if (this.player.camera.position.y - 1.6 < this.waterLevel) {
            this.player.waterPenalty = 0.65; // -35% speed[cite: 1]
            this.inWaterTimer += delta;
            
            if (this.inWaterTimer >= this.maxWaterTime) {
                console.log("JUMPSCARE: Pulled under by Submerged Fleischi!");
                window.location.reload();
            }
            
            this.updateWake(this.player.camera.position);
        } else {
            this.player.waterPenalty = 1.0;
            this.inWaterTimer = Math.max(0, this.inWaterTimer - delta);
        }
    }

    updateWake(targetPos) {
        // Simulates the invisible monster rushing towards the player in water[cite: 1]
        // Renders particle bubbles moving towards targetPos
    }
}
