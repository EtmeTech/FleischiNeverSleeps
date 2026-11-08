import * as THREE from 'three';

export class OpticsPuzzle {
    constructor(scene) {
        this.scene = scene;
        this.mirrors = [];
        this.laserBeam = null;
        this.targetSensor = new THREE.Vector3(10, 1, -10);
        
        // Requires exactly 45, 60, and 30 degrees[cite: 1]
        this.targetAngles = [45, 60, 30]; 
        this.currentAngles = [0, 0, 0];
        
        this.initMirrors();
    }

    initMirrors() {
        for(let i=0; i<3; i++) {
            const geo = new THREE.BoxGeometry(0.8, 1.2, 0.1);
            const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1.0 });
            const mirror = new THREE.Mesh(geo, mat);
            mirror.position.set(i * 3, 1, -5);
            this.scene.add(mirror);
            this.mirrors.push(mirror);
        }
    }

    rotateMirror(index) {
        this.currentAngles[index] = (this.currentAngles[index] + 15) % 360;
        this.mirrors[index].rotation.y = THREE.MathUtils.degToRad(this.currentAngles[index]);
        this.checkReflection();
    }

    checkReflection() {
        // alpha_einfall = alpha_reflexion check[cite: 1]
        let correct = true;
        for(let i=0; i<3; i++) {
            if (this.currentAngles[i] !== this.targetAngles[i]) correct = false;
        }

        if (correct) {
            console.log("Laser hits sensor! Door open.");
        } else {
            console.log("Laser hits alarm! Triggering Blind Fleischi...");
            // Alarm logic triggers here[cite: 1]
        }
    }
}
