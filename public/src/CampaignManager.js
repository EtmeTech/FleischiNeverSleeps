import { milanMode } from './MilanModeManager.js';
import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { ElevatorKeypad } from './Level03Elevator.js';
import { BackroomsLogic } from './BackroomsLogic.js';

export class CampaignManager {
    constructor(scene, camera, player, physics) {
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.physics = physics;
        this.activeLevel = 2; // Level 1 & 2 run simultaneously in main.js
    }

    startElevatorLevel() {
        this.activeLevel = 3;
        console.log("Entering Level 3: The Elevator Crash");

        // Teleport inside elevator
        this.player.position.set(0, 1.6, -49.2);

        // Keypad display overlay
        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = "KEYPAD: Bestimme das Absolutglied von (x - 3)² [Taste 0-9]";
            hud.style.color = '#ff9900';
            hud.style.display = 'block';
        }

        this.elevator = new ElevatorKeypad(() => {
            if (hud) {
                hud.innerText = "AUFZUG REISST AB... ABSTURZ!";
                hud.style.color = '#ff0000';
            }
            setTimeout(() => this.startBackroomsLevel(), 3500);
        });
        this.elevator.isActive = true;
    }

    startBackroomsLevel() {
        this.activeLevel = 4;
        console.log("Entering Level 4: The Face Backrooms");

        // Clear previous geometry
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }

        // Ambient yellow backrooms light
        const amb = new THREE.AmbientLight(0xffe58a, 1.2);
        this.scene.add(amb);

        // Face tiled walls
        const faceTex = new THREE.TextureLoader().load('assets/textures/fleischi_face.png');
        faceTex.wrapS = THREE.RepeatWrapping;
        faceTex.wrapT = THREE.RepeatWrapping;
        faceTex.repeat.set(4, 2);
        const wallMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.8 });

        const carpetMat = new THREE.MeshStandardMaterial({ color: 0x4a4422, roughness: 0.95 });

        // Maze Arena
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), carpetMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, 0);
        this.scene.add(floor);

        // Backrooms perimeter
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), wallMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 3, 0);
        this.scene.add(ceiling);

        this.backroomsLogic = new BackroomsLogic({
            loadNextLevel: () => {
                alert("VICTORY! You navigated the 6-door anomaly and escaped Act I!");
                window.location.reload();
            },
            spawnMonsterBehindPlayer: (dist) => {
                console.log(`Alert: Fleischi spawned ${dist}m behind! Run!`);
            }
        });

        // Spawn 6 interactive doors inside the maze
        this.doors = [];
        for (let i = 0; i < 6; i++) {
            const doorGeo = new THREE.BoxGeometry(1.2, 2.2, 0.1);
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x6e2617 });
            const door = new THREE.Mesh(doorGeo, doorMat);
            const angle = (i / 6) * Math.PI * 2;
            door.position.set(Math.cos(angle) * 8, 1.1, Math.sin(angle) * 8);
            door.userData = { opened: false };
            this.scene.add(door);
            this.doors.push(door);
        }

        // Reposition player to center
        this.player.position.set(0, 1.6, 0);

        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.innerText = "FINDE DEN ECHTEN AUSGANG (REGEL DER 6 TÜREN)";
            hud.style.color = '#ffff00';
            hud.style.display = 'block';
            setTimeout(() => { hud.style.display = 'none'; }, 5000);
        }
    }

    handleKey(e) {
        if (this.activeLevel === 3 && this.elevator) {
            // Numbers 0-9
            if (e.key >= '0' && e.key <= '9') {
                this.elevator.interact(e.key);
            }
        }
    }
}


// [MILAN_MODE_HOOK_B4]

(() => {
    const cls = (typeof CampaignManager !== 'undefined') ? CampaignManager : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            const res = orig.apply(this, args);
            if (this.difficulty && String(this.difficulty).toLowerCase().includes('milan')) {
                milanMode.setMilanActive(true);
            }
            if (this.currentLevel && typeof this.currentLevel === 'object') {
                const lvlName = this.currentLevel.constructor ? this.currentLevel.constructor.name : 'CampaignLevel';
                milanMode.registerLevelManager(lvlName, this.currentLevel);
            }
            return res;
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
