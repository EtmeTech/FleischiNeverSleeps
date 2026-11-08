import * as THREE from 'three';

export class PlayerController {
    constructor(camera, domElement, physics) {
        this.camera = camera;
        this.physics = physics;
        this.domElement = domElement;

        this.position = new THREE.Vector3(0, 1.6, 2.5);
        this.camera.position.copy(this.position);

        this.keys = { w: false, a: false, s: false, d: false, shift: false, ctrl: false, space: false };

        this.keybinds = {
            forward: 'KeyW',
            backward: 'KeyS',
            left: 'KeyA',
            right: 'KeyD',
            sprint: 'ShiftLeft',
            crouch: 'ControlLeft',
            jump: 'Space',
            interact: 'KeyE'
        };

        this.walkSpeed = 4.2;
        this.sprintSpeed = 7.6;
        this.crouchSpeed = 2.0;

        this.waterPenalty = 1.0;

        this.eyeHeightStand = 1.6;
        this.eyeHeightCrouch = 0.85;
        this.currentEyeHeight = 1.6;
        this.headBobTimer = 0;

        this.groundY = 0;
        this.footY = 0;
        this.jumpOffset = 0;
        this.verticalVelocity = 0;
        this.gravity = 19.0;
        this.jumpStrength = 7.4;
        this.isGrounded = true;
        this.isHiddenInLocker = false;

        this.setupKeyListeners();
    }

    matchesBind(code, action) {
        const bind = this.keybinds[action];
        if (code === bind) return true;
        if (bind === 'ShiftLeft' && code === 'ShiftRight') return true;
        if (bind === 'ControlLeft' && code === 'ControlRight') return true;
        return false;
    }

    setupKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (this.matchesBind(e.code, 'forward')) this.keys.w = true;
            if (this.matchesBind(e.code, 'backward')) this.keys.s = true;
            if (this.matchesBind(e.code, 'left')) this.keys.a = true;
            if (this.matchesBind(e.code, 'right')) this.keys.d = true;
            if (this.matchesBind(e.code, 'sprint')) this.keys.shift = true;
            if (this.matchesBind(e.code, 'crouch')) this.keys.ctrl = true;
            if (this.matchesBind(e.code, 'jump')) {
                this.keys.space = true;
                if (this.isGrounded && !this.keys.ctrl && !this.isHiddenInLocker) {
                    this.verticalVelocity = this.jumpStrength;
                    this.isGrounded = false;
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (this.matchesBind(e.code, 'forward')) this.keys.w = false;
            if (this.matchesBind(e.code, 'backward')) this.keys.s = false;
            if (this.matchesBind(e.code, 'left')) this.keys.a = false;
            if (this.matchesBind(e.code, 'right')) this.keys.d = false;
            if (this.matchesBind(e.code, 'sprint')) this.keys.shift = false;
            if (this.matchesBind(e.code, 'crouch')) this.keys.ctrl = false;
            if (this.matchesBind(e.code, 'jump')) this.keys.space = false;
        });
    }

    resetKeys() {
        this.keys.w = false;
        this.keys.a = false;
        this.keys.s = false;
        this.keys.d = false;
        this.keys.shift = false;
        this.keys.ctrl = false;
        this.keys.space = false;
        this.jumpOffset = 0;
        this.verticalVelocity = 0;
        this.isGrounded = true;
    }

    update(delta) {
        if (this.isHiddenInLocker) {
            return;
        }

        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        if (Math.abs(euler.z) > 0.0001) {
            euler.z = 0;
            this.camera.quaternion.setFromEuler(euler);
        }
        const yaw = euler.y;

        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

        const moveDir = new THREE.Vector3(0, 0, 0);
        if (this.keys.w) moveDir.add(forward);
        if (this.keys.s) moveDir.sub(forward);
        if (this.keys.d) moveDir.add(right);
        if (this.keys.a) moveDir.sub(right);

        const isMoving = moveDir.lengthSq() > 0.001;
        if (isMoving) moveDir.normalize();

        let speed = this.walkSpeed;
        if (this.keys.ctrl) {
            speed = this.crouchSpeed;
        } else if (this.keys.shift && isMoving) {
            speed = this.sprintSpeed;
        }
        speed *= this.waterPenalty;

        if (this.isGrounded) {
            this.footY = this.groundY;
        } else {
            this.footY = this.groundY + this.jumpOffset;
        }

        const targetPos = this.position.clone().addScaledVector(moveDir, speed * delta);
        this.position = this.physics.resolveMovement(this.position, targetPos, 0.35, this.footY);

        const supportY = this.physics.getGroundHeight(this.position.x, this.position.z, this.footY);

        if (!this.isGrounded || this.verticalVelocity > 0) {
            this.footY += this.verticalVelocity * delta;
            this.verticalVelocity -= this.gravity * delta;

            if (this.verticalVelocity <= 0 && this.footY <= supportY + 0.06) {
                this.footY = supportY;
                this.groundY = supportY;
                this.jumpOffset = 0;
                this.verticalVelocity = 0;
                this.isGrounded = true;
            } else {
                this.jumpOffset = this.footY - this.groundY;
            }
        } else {
            if (supportY < this.groundY - 0.55) {
                this.isGrounded = false;
                this.verticalVelocity = 0;
                this.jumpOffset = 0;
            } else {
                this.groundY += (supportY - this.groundY) * Math.min(1.0, delta * 18.0);
                this.footY = this.groundY;
            }
        }

        const targetHeight = this.keys.ctrl ? this.eyeHeightCrouch : this.eyeHeightStand;
        this.currentEyeHeight += (targetHeight - this.currentEyeHeight) * 12.0 * delta;

        let bobY = 0;
        if (isMoving && this.isGrounded) {
            this.headBobTimer += delta * (this.keys.shift ? 14 : 9) * this.waterPenalty;
            bobY = Math.sin(this.headBobTimer) * (this.keys.shift ? 0.055 : 0.03);
        }

        this.position.y = this.footY + this.currentEyeHeight;
        this.camera.position.set(
            this.position.x,
            this.footY + this.currentEyeHeight + bobY,
            this.position.z
        );
    }
}
