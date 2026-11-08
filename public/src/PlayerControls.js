import * as THREE from 'three';

export class PlayerState {
    constructor(camera, domElement) {
        this.camera = camera;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isSprinting = false;
        this.isCrouching = false;
        
        // Base Speeds
        this.walkSpeed = 40.0;
        this.sprintSpeed = 70.0;
        this.crouchSpeed = 20.0;
        this.waterPenalty = 1.0; // Drops to 0.65 in Level 07 (-35%)
        
        this.setupInputs();
    }

    setupInputs() {
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('keyup', (event) => this.onKeyUp(event));
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'ShiftLeft': this.isSprinting = true; break;
            case 'ControlLeft': 
                this.isCrouching = true; 
                this.camera.position.y = 0.8; // Duck height
                break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyD': this.moveRight = false; break;
            case 'ShiftLeft': this.isSprinting = false; break;
            case 'ControlLeft': 
                this.isCrouching = false; 
                this.camera.position.y = 1.6; // Stand height
                break;
        }
    }

    update(delta) {
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;

        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        let currentSpeed = this.isCrouching ? this.crouchSpeed : (this.isSprinting ? this.sprintSpeed : this.walkSpeed);
        currentSpeed *= this.waterPenalty;

        if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * currentSpeed * delta;
        if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * currentSpeed * delta;

        this.camera.translateX(this.velocity.x * delta);
        this.camera.translateZ(this.velocity.z * delta);
    }
}
