import * as THREE from 'three';

export class TimeReversal {
    constructor(playerCamera) {
        this.camera = playerCamera;
        this.history = []; // Ring buffer for positions
        this.maxSamples = 180; // 3 seconds at 60 FPS[cite: 1]
        this.cooldown = 0.0;
        
        this.setupInput();
    }

    update(delta) {
        if (this.cooldown > 0) this.cooldown -= delta;
        
        // Record position every frame
        this.history.push({
            pos: this.camera.position.clone(),
            rot: this.camera.rotation.clone()
        });
        
        if (this.history.length > this.maxSamples) {
            this.history.shift(); // Maintain 3 second rolling window
        }
    }

    setupInput() {
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.triggerReversal();
        });
    }

    triggerReversal() {
        if (this.cooldown > 0 || this.history.length === 0) return;
        
        // Restore state from 3 seconds ago[cite: 1]
        const pastState = this.history[0];
        this.camera.position.copy(pastState.pos);
        this.camera.rotation.copy(pastState.rot);
        
        console.log("TIME REVERSED! Warped back 3 seconds.");
        
        this.history = []; // Clear buffer
        this.cooldown = 10.0; // 10 second cooldown[cite: 1]
    }
}
