import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { Level01 } from './Level01Refactored.js';
import { HallwayManager } from './HallwayManager.js';
import { ElevatorKeypad } from './Level03Elevator.js';
import { BackroomsLogic } from './BackroomsLogic.js';
import { ProceduralTextures } from './ProceduralTextures.js';

export class MasterDirector {
    constructor(scene, graphics, physics, player) {
        this.scene = scene;
        this.graphics = graphics;
        this.physics = physics;
        this.player = player;
        this.currentLevel = 1;
        this.activeModules = [];
        
        this.loadLevel(this.currentLevel);
    }

    clearEnvironment() {
        this.physics.clear();
        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const obj = this.scene.children[i];
            if (obj.isMesh || obj.isLight || obj.isGroup) {
                this.scene.remove(obj);
            }
        }
        this.graphics.setupEnvironmentLights();
        this.activeModules = [];
    }

    displayHUD(text, duration = 3000, color = "#ff0000") {
        let hud = document.getElementById('hud-message');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'hud-message';
            hud.style.position = 'absolute';
            hud.style.bottom = '10%';
            hud.style.left = '50%';
            hud.style.transform = 'translateX(-50%)';
            hud.style.fontFamily = 'monospace';
            hud.style.fontSize = '24px';
            hud.style.zIndex = '100';
            document.body.appendChild(hud);
        }
        hud.innerText = text;
        hud.style.color = color;
        hud.style.display = 'block';
        setTimeout(() => { hud.style.display = 'none'; }, duration);
    }

    loadLevel(levelNumber) {
        this.clearEnvironment();
        this.currentLevel = levelNumber;
        this.displayHUD(`ACT ${Math.ceil(levelNumber/3)}: LEVEL ${levelNumber}`, 4000, "#ffffff");

        const concrete = ProceduralTextures.getConcreteMaterial();

        switch (levelNumber) {
            case 1:
                this.player.position.set(0, 0, 0);
                this.player.camera.rotation.set(0, 0, 0);
                const l1 = new Level01(this.scene, this.graphics, () => {
                    this.displayHUD("DOOR UNLOCKED", 2000, "#00ff00");
                    setTimeout(() => this.loadLevel(2), 2000);
                });
                
                // Add room to physics
                const floorGeo = new THREE.BoxGeometry(5, 0.2, 4);
                const floor = new THREE.Mesh(floorGeo, concrete);
                floor.position.set(0, -0.1, 0);
                this.scene.add(floor);
                this.physics.addCollider(floor);
                
                const wall1 = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), concrete);
                wall1.position.set(0, 1.5, -2.1);
                this.scene.add(wall1);
                this.physics.addCollider(wall1);
                
                this.activeModules.push(l1);
                break;

            case 2:
                // 50m Hallway setup[cite: 1]
                this.player.position.set(0, 0, 0);
                const hallFloor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 50), concrete);
                hallFloor.position.set(0, -0.1, -25);
                this.scene.add(hallFloor);
                this.physics.addCollider(hallFloor);

                const hallWallL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 50), concrete);
                hallWallL.position.set(-1.3, 1.5, -25);
                this.scene.add(hallWallL);
                this.physics.addCollider(hallWallL);

                const hallWallR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 50), concrete);
                hallWallR.position.set(1.3, 1.5, -25);
                this.scene.add(hallWallR);
                this.physics.addCollider(hallWallR);

                const l2 = new HallwayManager(this.scene, this.player.camera, this.player.camera);
                this.activeModules.push(l2);

                // Exit trigger at Z = -49
                this.physics.addTrigger(
                    new THREE.Box3(new THREE.Vector3(-1.2, 0, -50), new THREE.Vector3(1.2, 3, -48)),
                    () => {
                        this.displayHUD("ESCAPED TO ELEVATOR", 2000, "#00ff00");
                        this.loadLevel(3);
                    }
                );
                break;

            case 3:
                // Elevator Keypad logic[cite: 1]
                this.player.position.set(0, 0, 0);
                const elevBox = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3, 2.5), concrete);
                elevBox.material.side = THREE.BackSide;
                elevBox.position.set(0, 1.5, 0);
                this.scene.add(elevBox);
                
                const floor3 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 2.5), concrete);
                floor3.position.y = -0.1;
                this.scene.add(floor3);
                this.physics.addCollider(floor3);

                const l3 = new ElevatorKeypad(() => this.loadLevel(4));
                l3.isActive = true;
                this.activeModules.push(l3);
                this.displayHUD("Absolute term of (x - 3)²?", 10000, "#ff8800");
                break;
                
            case 4:
                // Backrooms 6-Door Invariant setup[cite: 1]
                this.player.position.set(0, 0, 0);
                const brFloor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20), concrete);
                brFloor.position.set(0, -0.1, -10);
                this.scene.add(brFloor);
                this.physics.addCollider(brFloor);
                
                const l4 = new BackroomsLogic(this);
                this.activeModules.push(l4);
                this.displayHUD("FIND THE 6TH DOOR", 5000, "#ff0000");
                // Minimal viable implementation logic continues...
                break;
        }
    }

    update(delta) {
        for (const mod of this.activeModules) {
            if (mod.update) mod.update(delta);
        }
    }
}


// [MILAN_MODE_HOOK_B4]

(() => {
    const cls = (typeof MasterDirector !== 'undefined') ? MasterDirector : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('MasterDirector', this);
            if (milanMode.isMilan) {
                if (typeof this.tension === 'number') this.tension = Math.max(this.tension, 0.85);
                if (typeof this.aggression === 'number') this.aggression = Math.max(this.aggression, 2.0);
                if (typeof this.spawnInterval === 'number' && !this._milanIntervalScaled) {
                    this._milanIntervalScaled = true;
                    this.spawnInterval *= 0.45;
                }
                if (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick')) {
                    if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                        args[0] = args[0] * 1.65;
                    }
                }
            }
            return orig.apply(this, args);
        };
    }
})();

