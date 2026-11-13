import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
import { MitternachtTerminal } from './MitternachtTerminal.js';
import { HallwayManager } from './HallwayManager.js';
import { ElevatorKeypad } from './Level03Elevator.js';
import { BackroomsLogic } from './BackroomsLogic.js';
import { BlindFleischi } from './BlindFleischi.js';
import { OpticsPuzzle } from './OpticsPuzzle.js';
import { WaterMonster } from './WaterMonster.js';
import { HighVoltageTerminal } from './LogicGates.js';
import { GalleriaLevel } from './GalleriaLevel.js';
import { StrobeMechanic } from './StrobeMechanic.js';
import { StaircaseLevel } from './StaircaseLevel.js';
import { FleshArchiveLevel } from './FleshArchiveLevel.js';
import { TimeReversal } from './TimeReversal.js';
import { MidnightArena } from './MidnightArena.js';
import { HorrorAudioManager } from './AudioManager.js';

export class GameDirector {
    constructor(scene, camera, playerControls) {
        this.scene = scene;
        this.camera = camera;
        this.player = playerControls;
        this.audio = new HorrorAudioManager();
        this.timeReversal = new TimeReversal(camera);
        this.currentLevel = 1;

        this.levelInstances = {};
        this.initCurrentLevel();
    }

    clearScene() {
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        const amb = new THREE.AmbientLight(0x222222);
        this.scene.add(amb);
    }

    loadNextLevel() {
        this.currentLevel++;
        console.log(`Entering Level ${this.currentLevel}`);
        this.clearScene();
        this.initCurrentLevel();
    }

    initCurrentLevel() {
        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.style.display = 'block';
            hud.innerText = `LEVEL ${this.currentLevel}`;
            setTimeout(() => { hud.style.display = 'none'; }, 2500);
        }

        switch (this.currentLevel) {
            case 1:
                this.initLevel01();
                break;
            case 2:
                this.player.camera.position.set(0, 1.6, 0);
                this.levelInstances.l02 = new HallwayManager(this.scene, this.camera, this.player.camera);
                break;
            case 3:
                this.levelInstances.l03 = new ElevatorKeypad(() => this.loadNextLevel());
                this.levelInstances.l03.isActive = true;
                break;
            case 4:
                this.levelInstances.l04 = new BackroomsLogic(this);
                break;
            case 5:
                this.levelInstances.l05 = new BlindFleischi(this.scene, this.player);
                this.levelInstances.l05.isActive = true;
                break;
            case 6:
                this.levelInstances.l06 = new OpticsPuzzle(this.scene);
                break;
            case 7:
                this.levelInstances.l07 = new WaterMonster(this.scene, this.player);
                break;
            case 8:
                this.levelInstances.l08 = new HighVoltageTerminal(() => this.loadNextLevel());
                break;
            case 9:
                this.levelInstances.l09 = new GalleriaLevel(this.scene, this.player);
                break;
            case 10:
                const dummies = [];
                for (let i = 0; i < 5; i++) {
                    const m = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8),
                        new THREE.MeshStandardMaterial({ color: 0x777777 })
                    );
                    m.position.set(i * 3 - 6, 0.9, -15);
                    this.scene.add(m);
                    dummies.push(m);
                }
                this.levelInstances.l10 = new StrobeMechanic(this.scene, dummies);
                break;
            case 11:
                this.levelInstances.l11 = new StaircaseLevel(this.scene, this.player, () => this.loadNextLevel());
                break;
            case 12:
                this.levelInstances.l12 = new FleshArchiveLevel(this.scene, this.player);
                break;
            case 13:
                console.log("Level 13: Gears Room. Use Right-Click for 3-second rewind.");
                setTimeout(() => this.loadNextLevel(), 6000);
                break;
            case 14:
                this.levelInstances.l14 = new MidnightArena(this.scene, this.player, () => {
                    alert("VICTORY! The clock struck 00:00:00. Fleischi is gone.");
                    window.location.reload();
                });
                break;
        }
    }

    initLevel01() {
        const roomGeo = new THREE.BoxGeometry(5, 3, 4);
        const roomMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.BackSide });
        const room = new THREE.Mesh(roomGeo, roomMat);
        room.position.set(0, 1.5, 0);
        this.scene.add(room);

        const laptopGeo = new THREE.BoxGeometry(0.5, 0.1, 0.4);
        const laptopMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
        this.laptop = new THREE.Mesh(laptopGeo, laptopMat);
        this.laptop.position.set(0, 1.0, -1.8);
        this.scene.add(this.laptop);

        this.levelInstances.l01 = new MitternachtTerminal(() => {
            this.audio.playUnlock();
            this.loadNextLevel();
        });
    }

    update(delta) {
        this.timeReversal.update(delta);

        if (this.currentLevel === 2 && this.levelInstances.l02) {
            this.levelInstances.l02.update(delta);
        } else if (this.currentLevel === 5 && this.levelInstances.l05) {
            this.levelInstances.l05.update(delta, this.player.camera.position);
        } else if (this.currentLevel === 7 && this.levelInstances.l07) {
            this.levelInstances.l07.update(delta);
        } else if (this.currentLevel === 9 && this.levelInstances.l09) {
            this.levelInstances.l09.update(delta);
        } else if (this.currentLevel === 10 && this.levelInstances.l10) {
            this.levelInstances.l10.update(delta, this.player.camera.position);
        } else if (this.currentLevel === 12 && this.levelInstances.l12) {
            this.levelInstances.l12.update(delta);
        } else if (this.currentLevel === 14 && this.levelInstances.l14) {
            this.levelInstances.l14.update(delta);
        }
    }
}


// [MILAN_MODE_HOOK_B4]

(() => {
    const cls = (typeof GameDirector !== 'undefined') ? GameDirector : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('GameDirector', this);
            if (milanMode.isMilan) {
                if (typeof this.difficultyMultiplier === 'number') {
                    this.difficultyMultiplier = Math.max(this.difficultyMultiplier, 2.4);
                }
                if (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick')) {
                    if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                        args[0] = args[0] * 1.6;
                    }
                }
            }
            return orig.apply(this, args);
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
