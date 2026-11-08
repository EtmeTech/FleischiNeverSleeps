import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PhysicsEngine } from './PhysicsEngine.js?v=1794067776';
import { PlayerController } from './PlayerController.js?v=1794067776';
import { Level01Room } from './Level01Room.js?v=1794067776';
import { HallwayManager } from './HallwayManager.js?v=1794067776';
import { FleischroomsManager } from './FleischroomsManager.js?v=1794067776';
import { SchoolLevelManager } from './SchoolLevelManager.js?v=1794067776';
import { MultiFloorLabyrinthManager } from './MultiFloorLabyrinthManager.js?v=1794067776';
import { FloodedBoilerManager } from './FloodedBoilerManager.js?v=1794067776';
import { WhisperLibraryManager } from './WhisperLibraryManager.js?v=1794067776';
import { FleischiMonster } from './FleischiMonster.js?v=1794067776';
import { MitternachtTerminal } from './MitternachtTerminal.js?v=1794067776';
import { HorrorPostProcessing } from './PostProcessing.js?v=1794067776';
import { AudioSynthesizer } from './AudioSynthesizer.js?v=1794067776';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);
scene.fog = new THREE.FogExp2(0x020202, 0.06);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const postProcessing = new HorrorPostProcessing(renderer, scene, camera);
const audio = new AudioSynthesizer();
for (const ev of ['click', 'keydown']) document.addEventListener(ev, () => audio.init(), { once: true });
const physics = new PhysicsEngine();
const player = new PlayerController(camera, document.body, physics);

const ambientLight = new THREE.AmbientLight(0x221c1a, 0.55);
scene.add(ambientLight);
const controls = new PointerLockControls(camera, document.body);

const crosshairUI = document.getElementById('crosshair');
const promptUI = document.getElementById('interaction-prompt');
const desktopUI = document.getElementById('desktop-overlay');
const notepadUI = document.getElementById('notepad-window');
const fileSchluessel = document.getElementById('file-schluessel');
const notepadOkBtn = document.getElementById('notepad-ok-btn');
const laptopCloseBtn = document.getElementById('laptop-close-btn');
const fadeUI = document.getElementById('fade-overlay');
const hud = document.getElementById('hud-message');
const mainMenuUI = document.getElementById('main-menu-overlay');
const menuMainButtons = document.getElementById('menu-main-buttons');
const menuLevelsInline = document.getElementById('menu-levels-inline');
const ingameMenuBtn = document.getElementById('ingame-menu-btn');

let isZoomingLaptop = false;
let isAtLaptop = false;
let savedCamPos = new THREE.Vector3();
let savedCamQuat = new THREE.Quaternion();
let zoomProgress = 0;
let zoomDirection = 0;

let isBeingGrabbed = false;
let grabTimer = 0;
let grabMonsterEntity = null;
let grabMonsterGroup = null;
let grabStartCamPos = new THREE.Vector3();
let grabSavedYaw = 0;
let grabBaseY = 0;
let grabRespawnTriggered = false;
let grabRespawnCallback = null;

let currentStage = 'menu';
let gamePlayMode = 'campaign';

let level01 = null;
let hallway = null;
let fleischrooms = null;
let schoolLevel = null;
let multiFloorLabyrinth = null;
let floodedBoiler = null;
let whisperLibrary = null;

const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

// ============================================================================
// KOMPAKTE INLINE-LEVEL-AUSWAHL (KEIN OVERLAY, NUR DIE 6 LEVEL-BUTTONS)
// ============================================================================
const LEVEL_DEFINITIONS = [
    { id: 'act1',         title: 'Schlafzimmer' },
    { id: 'fleischrooms', title: 'Fleischrooms' },
    { id: 'school',       title: 'Schulflur & 2er-Potenzen' },
    { id: 'labyrinth',    title: 'Mega Labyrinth' },
    { id: 'boiler',       title: 'Gefluteter Heizungskeller' },
    { id: 'library',      title: 'Schul-Bibliothek' }
];

const LOCK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

function getUnlockedLevels() {
    try {
        const raw = localStorage.getItem('fleischi_unlocked_levels');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                if (!parsed.includes('act1')) parsed.unshift('act1');
                return parsed;
            }
        }
    } catch (e) {}
    return ['act1'];
}

function unlockLevel(levelId) {
    const unlocked = getUnlockedLevels();
    if (!unlocked.includes(levelId)) {
        unlocked.push(levelId);
        try {
            localStorage.setItem('fleischi_unlocked_levels', JSON.stringify(unlocked));
        } catch (e) {}
    }
    updateLevelsMenuUI();
}

function updateLevelsMenuUI() {
    const unlocked = getUnlockedLevels();
    const grid = document.getElementById('levels-inline-grid');
    if (!grid) return;
    grid.innerHTML = '';

    LEVEL_DEFINITIONS.forEach((lvl) => {
        const isUnlocked = unlocked.includes(lvl.id);
        const btn = document.createElement('button');
        btn.className = `level-inline-btn ${isUnlocked ? 'unlocked' : 'locked'}`;
        btn.innerHTML = isUnlocked ? `<span>${lvl.title}</span>` : `${LOCK_SVG}<span>${lvl.title}</span>`;

        if (isUnlocked) {
            btn.addEventListener('click', () => {
                audio.playKeyPickup();
                startGameFromMenu(lvl.id, 'single');
            });
        } else {
            btn.addEventListener('click', () => {
                audio.playMetalBang();
            });
        }
        grid.appendChild(btn);
    });
}

// Dynamische Untertitel unter dem Titel (ohne 2^8 = 256)
const MENU_SUBTITLES = [
    "„Hast du die Mitternachtsformel gelernt?“",
    "„Erinnerst du dich noch an die Binomischen Formeln?“",
    "„Tritt nicht auf die Scherben…“",
    "„Dreh dich im dunklen Gang nicht zu langsam um…“",
    "„Im schwarzen Wasser bist du 35 % langsamer…“",
    "„Wo ein Kronleuchter glimmt, verbirgt sich ein Geheimgang…“"
];
let subtitleIdx = 0;
setInterval(() => {
    if (currentStage !== 'menu') return;
    const subEl = document.getElementById('menu-dynamic-subtitle');
    if (!subEl) return;
    subEl.style.opacity = '0';
    setTimeout(() => {
        subtitleIdx = (subtitleIdx + 1) % MENU_SUBTITLES.length;
        subEl.innerText = MENU_SUBTITLES[subtitleIdx];
        subEl.style.opacity = '1';
    }, 240);
}, 4200);

// Geheimer 3-Klick-Jumpscare auf das Fleischi-Bild unten rechts
let secretClickCount = 0;
let secretClickResetTimer = null;
const secretDossier = document.getElementById('secret-fleischi-dossier');
if (secretDossier) {
    secretDossier.addEventListener('click', (e) => {
        e.stopPropagation();
        secretClickCount++;
        audio.playTick(1.2 + secretClickCount * 0.25);
        if (secretClickResetTimer) clearTimeout(secretClickResetTimer);
        if (secretClickCount >= 3) {
            secretClickCount = 0;
            audio.triggerScoldJumpscare();
        } else {
            secretClickResetTimer = setTimeout(() => {
                secretClickCount = 0;
            }, 2200);
        }
    });
}

// ============================================================================
// 3D-ÜBERWACHUNGSKAMERA-SZENERIE IM HAUPTMENÜ (CAM 01 - CAM 04)
// ============================================================================
const menuCctvMonster = new FleischiMonster();
scene.add(menuCctvMonster.group);

const CCTV_CAMERAS = [
    {
        camPos: new THREE.Vector3(2.15, 2.55, 3.65),
        lookBase: new THREE.Vector3(-0.6, 1.15, 0.35),
        panAmp: 0.45,
        fogColor: 0x050202,
        fogDensity: 0.055,
        monsterPos: new THREE.Vector3(-0.35, 0.0, 1.35),
        monsterLookAt: new THREE.Vector3(2.15, 1.85, 3.65)
    },
    {
        camPos: new THREE.Vector3(0.75, 3.35, -36.0),
        lookBase: new THREE.Vector3(0.0, 1.35, -47.5),
        panAmp: 0.28,
        fogColor: 0x050202,
        fogDensity: 0.048,
        monsterPos: new THREE.Vector3(0.0, 0.0, -44.0),
        monsterLookAt: new THREE.Vector3(0.75, 2.2, -36.0)
    },
    {
        camPos: new THREE.Vector3(-0.85, 2.75, -50.25),
        lookBase: new THREE.Vector3(0.15, 1.45, -52.85),
        panAmp: 0.22,
        fogColor: 0x080202,
        fogDensity: 0.05,
        monsterPos: new THREE.Vector3(0.15, 0.0, -51.95),
        monsterLookAt: new THREE.Vector3(-0.85, 2.1, -50.25)
    },
    {
        camPos: new THREE.Vector3(-1.85, 2.35, 2.95),
        lookBase: new THREE.Vector3(0.0, 1.35, 0.05),
        panAmp: 0.35,
        fogColor: 0x040202,
        fogDensity: 0.055,
        monsterPos: new THREE.Vector3(0.25, 0.0, 0.85),
        monsterLookAt: new THREE.Vector3(-1.85, 1.9, 2.95)
    }
];

let activeCctvIndex = 0;
let cctvAutoSwitchTimer = 0;
let cctvPanTime = 0;

function triggerCctvStaticFlash() {
    const flash = document.getElementById('cctv-static-flash');
    if (flash) {
        flash.style.opacity = '0.9';
        setTimeout(() => {
            flash.style.opacity = '0';
        }, 140);
    }
}

function setCctvCamera(index) {
    activeCctvIndex = index % CCTV_CAMERAS.length;
    cctvAutoSwitchTimer = 0;
    triggerCctvStaticFlash();

    document.querySelectorAll('.cctv-switch-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === activeCctvIndex);
    });
}

document.querySelectorAll('.cctv-switch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-cam') || '0', 10);
        audio.playTick(1.4);
        setCctvCamera(idx);
    });
});

function updateMenuCctv(delta) {
    cctvPanTime += delta;
    cctvAutoSwitchTimer += delta;

    if (cctvAutoSwitchTimer >= 6.0) {
        setCctvCamera((activeCctvIndex + 1) % CCTV_CAMERAS.length);
    }

    const cfg = CCTV_CAMERAS[activeCctvIndex];
    scene.fog.color.setHex(cfg.fogColor);
    scene.fog.density = cfg.fogDensity;

    const panOffset = Math.sin(cctvPanTime * 0.65) * cfg.panAmp;
    camera.position.copy(cfg.camPos);
    const target = cfg.lookBase.clone();
    target.x += panOffset;
    camera.lookAt(target);

    menuCctvMonster.group.visible = true;
    if (activeCctvIndex === 1) {
        const walkZ = -46.5 + ((cctvPanTime * 1.45) % 8.5);
        menuCctvMonster.group.position.set(0.0, 0.0, walkZ);
        menuCctvMonster.group.lookAt(0.0, 0.0, -34.0);
        menuCctvMonster.animate(delta, false, true);
    } else {
        menuCctvMonster.group.position.copy(cfg.monsterPos);
        menuCctvMonster.group.lookAt(cfg.monsterLookAt.x, 0.0, cfg.monsterLookAt.z);
        menuCctvMonster.animate(delta, false, false);
        if (menuCctvMonster.headGroup) {
            menuCctvMonster.headGroup.rotation.x = -0.25 + Math.sin(cctvPanTime * 5.0) * 0.06;
            menuCctvMonster.headGroup.rotation.z = Math.cos(cctvPanTime * 4.2) * 0.14;
        }
    }
}

// ============================================================================
// LEVEL-AUFRÄUMEN & STARTEN
// ============================================================================
const terminal = new MitternachtTerminal(audio, () => {
    physics.unlockDoor();
    if (level01) level01.unlockAndOpenDoor();
});

function initBaseAct1Objects() {
    if (!level01) {
        level01 = new Level01Room(scene, camera, physics, audio, () => {
            terminal.activateOnDoor();
        });
        terminal.attachRoom(level01);
    }
    if (!hallway) {
        hallway = new HallwayManager(
            scene,
            camera,
            player,
            audio,
            physics,
            () => onLevelCompleted('act1', () => startFleischroomsLevel()),
            () => {
                startGrabAndLiftSequence(hallway.monsterEntity, hallway.monsterGroup, () => {
                    hallway.resetHallway();
                    level01.resetForRespawnWithKey();
                    player.groundY = 0;
                    player.footY = 0;
                    player.position.set(0, 1.6, 2.5);
                    camera.position.set(0, 1.6, 2.5);
                    resetCameraUpright(0);
                });
            }
        );
    }
}

initBaseAct1Objects();

function cleanupDynamicLevels() {
    if (fleischrooms && fleischrooms.group) {
        scene.remove(fleischrooms.group);
        fleischrooms = null;
    }
    if (schoolLevel && schoolLevel.group) {
        scene.remove(schoolLevel.group);
        schoolLevel = null;
    }
    if (multiFloorLabyrinth && multiFloorLabyrinth.group) {
        scene.remove(multiFloorLabyrinth.group);
        multiFloorLabyrinth = null;
    }
    if (floodedBoiler && floodedBoiler.group) {
        scene.remove(floodedBoiler.group);
        floodedBoiler = null;
    }
    if (whisperLibrary && whisperLibrary.group) {
        scene.remove(whisperLibrary.group);
        whisperLibrary = null;
    }
    const minimap = document.getElementById('minimap-container');
    if (minimap) minimap.style.display = 'none';
    const lockerOverlay = document.getElementById('locker-overlay');
    if (lockerOverlay) lockerOverlay.style.display = 'none';
    if (hud) hud.style.display = 'none';
    if (promptUI) promptUI.style.display = 'none';
    player.isHiddenInLocker = false;
    player.waterPenalty = 1.0;
}

function onLevelCompleted(completedStageId, nextCampaignStepCallback) {
    const order = ['act1', 'fleischrooms', 'school', 'labyrinth', 'boiler', 'library'];
    const idx = order.indexOf(completedStageId);
    if (idx !== -1 && idx + 1 < order.length) {
        unlockLevel(order[idx + 1]);
    }

    if (gamePlayMode === 'single') {
        if (hud) {
            hud.innerText = "LEVEL GESCHAFFT! ZURÜCK ZUM HAUPTMENÜ...";
            hud.style.color = '#00ff88';
            hud.style.display = 'block';
        }
        setTimeout(() => {
            returnToMainMenu();
        }, 2200);
    } else {
        if (nextCampaignStepCallback) nextCampaignStepCallback();
    }
}

function showMainMenuButtons() {
    if (menuLevelsInline) menuLevelsInline.style.display = 'none';
    if (menuMainButtons) menuMainButtons.style.display = 'flex';
}

function showInlineLevelsButtons() {
    updateLevelsMenuUI();
    if (menuMainButtons) menuMainButtons.style.display = 'none';
    if (menuLevelsInline) menuLevelsInline.style.display = 'flex';
}

function returnToMainMenu() {
    isBeingGrabbed = false;
    isZoomingLaptop = false;
    isAtLaptop = false;
    fadeUI.style.opacity = '0';
    desktopUI.style.display = 'none';
    notepadUI.style.display = 'none';

    cleanupDynamicLevels();

    if (level01 && level01.roomGroup) level01.roomGroup.visible = true;
    if (level01 && level01.heldKeyGroup) level01.heldKeyGroup.visible = false;
    if (hallway) {
        hallway.isDisabled = false;
        hallway.hallwayGroup.visible = true;
        hallway.resetHallway();
    }

    currentStage = 'menu';
    menuCctvMonster.group.visible = true;
    if (crosshairUI) crosshairUI.style.display = 'none';
    if (ingameMenuBtn) ingameMenuBtn.style.display = 'none';
    if (mainMenuUI) mainMenuUI.style.display = 'block';
    showMainMenuButtons();

    if (controls.isLocked) {
        controls.unlock();
    }
}

function startGameFromMenu(targetStage, mode = 'campaign') {
    gamePlayMode = mode;
    menuCctvMonster.group.visible = false;
    if (mainMenuUI) mainMenuUI.style.display = 'none';
    if (crosshairUI) crosshairUI.style.display = 'block';
    if (ingameMenuBtn) ingameMenuBtn.style.display = 'block';

    cleanupDynamicLevels();
    player.resetKeys();
    resetCameraUpright(0);

    if (targetStage === 'act1') {
        currentStage = 'act1';
        scene.fog = new THREE.FogExp2(0x020202, 0.06);
        physics.setMode('act1');
        physics.lockDoor();
        physics.addObstacle(-2.45, -1.02, 0.15, 1.15);
        physics.addObstacle(0.92, 2.40, 0.85, 3.15);

        if (level01) {
            level01.roomGroup.visible = true;
            level01.doorOpen = false;
            level01.doorHinge.rotation.y = 0;
            if (level01.doorTerminalGroup) level01.doorTerminalGroup.visible = false;
            level01.isTerminalUnlockedOnDoor = false;
            level01.clockActivated = false;
            level01.isKeyInserted = false;
            if (level01.insertedKeyMesh) level01.insertedKeyMesh.visible = false;
        }
        if (hallway) {
            hallway.isDisabled = false;
            hallway.hallwayGroup.visible = true;
            hallway.elevatorSolved = false;
            hallway.resetHallway();
        }
        player.groundY = 0;
        player.footY = 0;
        player.position.set(0, 1.6, 2.5);
        camera.position.set(0, 1.6, 2.5);
        resetCameraUpright(0);
    } else {
        if (level01 && level01.roomGroup) level01.roomGroup.visible = false;
        if (level01 && level01.heldKeyGroup) level01.heldKeyGroup.visible = false;
        if (hallway) hallway.hideAll();

        if (targetStage === 'fleischrooms') startFleischroomsLevel();
        else if (targetStage === 'school') enterSchoolHallwayThroughDoor();
        else if (targetStage === 'labyrinth') startMultiFloorLabyrinth();
        else if (targetStage === 'boiler') startFloodedBoilerLevel();
        else if (targetStage === 'library') startWhisperLibraryLevel();
    }

    controls.lock();
}

window.fillFormula = (submit = false) => {
    if (!terminal.isActive) terminal.activateOnDoor();
    terminal.currentInput = "x=(-b+-√(b^2-4⋅a⋅c))/(2⋅a)".slice(0, 34);
    if (level01) level01.updateDoorTerminalScreen(terminal.currentInput, 'normal');
    if (submit) terminal.submitCurrentInput();
    return terminal.currentInput;
};

function resetCameraUpright(yaw = 0) {
    camera.up.set(0, 1, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, yaw, 0);
    camera.quaternion.setFromEuler(camera.rotation);
}

function startGrabAndLiftSequence(monsterEntity, monsterGroup, respawnCallback) {
    if (isBeingGrabbed) return;
    isBeingGrabbed = true;
    grabTimer = 0;
    grabRespawnTriggered = false;
    grabMonsterEntity = monsterEntity;
    grabMonsterGroup = monsterGroup;
    grabRespawnCallback = respawnCallback;

    player.resetKeys();
    promptUI.style.display = 'none';
    grabStartCamPos.copy(camera.position);
    grabBaseY = player.footY || player.groundY || 0;

    const currentEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    currentEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    grabSavedYaw = currentEuler.y;

    const monsterWorldPos = new THREE.Vector3();
    monsterGroup.getWorldPosition(monsterWorldPos);

    const dirToPlayer = new THREE.Vector3(
        player.position.x - monsterWorldPos.x,
        0,
        player.position.z - monsterWorldPos.z
    );
    if (dirToPlayer.lengthSq() < 0.001) dirToPlayer.set(0, 0, 1);
    dirToPlayer.normalize();

    const targetWorldPos = new THREE.Vector3(
        player.position.x - dirToPlayer.x * 0.92,
        grabBaseY,
        player.position.z - dirToPlayer.z * 0.92
    );

    if (monsterGroup.parent && monsterGroup.parent !== scene) {
        monsterGroup.parent.worldToLocal(targetWorldPos);
    }
    monsterGroup.position.copy(targetWorldPos);
    monsterGroup.lookAt(player.position.x, grabBaseY, player.position.z);
    monsterGroup.visible = true;
}

// ============================================================================
// HAUPTMENÜ-BUTTON-EVENTS
// ============================================================================
document.getElementById('btn-menu-play').addEventListener('click', () => {
    audio.playKeyPickup();
    startGameFromMenu('act1', 'campaign');
});

document.getElementById('btn-menu-levels').addEventListener('click', () => {
    audio.playTick(1.2);
    showInlineLevelsButtons();
});

document.getElementById('btn-levels-back').addEventListener('click', () => {
    audio.playTick(0.9);
    showMainMenuButtons();
});

document.getElementById('btn-menu-settings').addEventListener('click', () => {
    audio.playTick(1.2);
    document.getElementById('modal-settings').style.display = 'flex';
});

document.getElementById('btn-close-settings').addEventListener('click', () => {
    audio.playKeyPickup();
    document.getElementById('modal-settings').style.display = 'none';
});

if (ingameMenuBtn) {
    ingameMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playTick(0.9);
        returnToMainMenu();
    });
}

const volSlider = document.getElementById('setting-volume');
if (volSlider) {
    volSlider.addEventListener('input', () => {
        const v = parseInt(volSlider.value, 10) / 100;
        if (audio.setMasterVolume) audio.setMasterVolume(v);
    });
}

const sensSlider = document.getElementById('setting-sensitivity');
if (sensSlider) {
    sensSlider.addEventListener('input', () => {
        const s = parseInt(sensSlider.value, 10) / 100;
        controls.pointerSpeed = s;
    });
}

const brightSlider = document.getElementById('setting-brightness');
if (brightSlider) {
    brightSlider.addEventListener('input', () => {
        const b = parseInt(brightSlider.value, 10) / 100;
        ambientLight.intensity = 0.55 * b;
    });
}

let listeningKeybindBtn = null;
document.querySelectorAll('.keybind-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (listeningKeybindBtn) listeningKeybindBtn.classList.remove('listening');
        listeningKeybindBtn = btn;
        btn.classList.add('listening');
        btn.innerText = '...';
    });
});

window.addEventListener('keydown', (e) => {
    if (listeningKeybindBtn) {
        e.preventDefault();
        e.stopPropagation();
        const action = listeningKeybindBtn.getAttribute('data-action');
        if (action && e.code !== 'Escape') {
            player.keybinds[action] = e.code;
            listeningKeybindBtn.innerText = e.code;
            audio.playKeyPickup();
        } else {
            listeningKeybindBtn.innerText = player.keybinds[action] || 'KeyW';
        }
        listeningKeybindBtn.classList.remove('listening');
        listeningKeybindBtn = null;
    }
}, true);

updateLevelsMenuUI();

document.addEventListener('click', (e) => {
    if (currentStage === 'menu') return;
    if (e.target === ingameMenuBtn) return;

    const isDesktopOpen = desktopUI.style.display === 'flex';
    if (!isDesktopOpen && !isZoomingLaptop && !isAtLaptop && !isBeingGrabbed) {
        if (!controls.isLocked) {
            controls.lock();
        } else {
            raycaster.setFromCamera(center, camera);
            if (currentStage === 'act1') {
                if (level01 && level01.isTerminalUnlockedOnDoor && !level01.doorOpen) {
                    if (level01.pressHoveredTerminalButton(raycaster, terminal)) return;
                }
                if (hallway && hallway.doorsFullyClosed) {
                    hallway.pressHoveredButton(raycaster);
                }
            } else if (currentStage === 'library' && whisperLibrary) {
                whisperLibrary.tryInteract(raycaster);
            }
        }
    }
});

function enterLaptopView() {
    if (isAtLaptop || isZoomingLaptop || isBeingGrabbed) return;
    controls.unlock();
    promptUI.style.display = 'none';
    savedCamPos.copy(camera.position);
    savedCamQuat.copy(camera.quaternion);
    isZoomingLaptop = true;
    zoomDirection = 1;
    zoomProgress = 0;
}

function exitLaptopView(openDrawerAfter = false) {
    if (!isAtLaptop && !isZoomingLaptop) return;
    notepadUI.style.display = 'none';
    desktopUI.style.display = 'none';
    isAtLaptop = false;
    isZoomingLaptop = true;
    zoomDirection = -1;
    zoomProgress = 1;
    if (openDrawerAfter && level01) {
        level01.openDeskDrawer();
    }
}

fileSchluessel.addEventListener('click', () => {
    notepadUI.style.display = 'block';
});

notepadOkBtn.addEventListener('click', () => {
    exitLaptopView(true);
    controls.lock();
});

if (laptopCloseBtn) {
    laptopCloseBtn.addEventListener('click', () => {
        exitLaptopView(false);
        controls.lock();
    });
}

function startFleischroomsLevel() {
    currentStage = 'fleischrooms';
    unlockLevel('fleischrooms');
    if (level01 && level01.roomGroup) level01.roomGroup.visible = false;
    if (level01 && level01.heldKeyGroup) level01.heldKeyGroup.visible = false;
    if (hud) hud.style.display = 'none';

    scene.fog = new THREE.FogExp2(0x1a0e05, 0.04);

    fleischrooms = new FleischroomsManager(
        scene,
        camera,
        player,
        audio,
        physics,
        () => onLevelCompleted('fleischrooms', () => enterSchoolHallwayThroughDoor()),
        () => {
            startGrabAndLiftSequence(fleischrooms.monsterEntity, fleischrooms.monsterGroup, () => {
                fleischrooms.resetOnCatch();
                resetCameraUpright(0);
            });
        }
    );
}

function enterSchoolHallwayThroughDoor() {
    currentStage = 'school';
    unlockLevel('school');
    if (hallway) hallway.hideAll();
    if (fleischrooms && fleischrooms.group) {
        fleischrooms.group.visible = false;
    }
    if (hud) hud.style.display = 'none';

    resetCameraUpright(0);
    scene.fog = new THREE.FogExp2(0x06080c, 0.045);

    schoolLevel = new SchoolLevelManager(
        scene,
        camera,
        player,
        audio,
        physics,
        () => onLevelCompleted('school', () => startMultiFloorLabyrinth()),
        (monsterEntity, monsterGroup) => {
            startGrabAndLiftSequence(monsterEntity, monsterGroup, () => {
                schoolLevel.resetOnCatch();
                resetCameraUpright(0);
            });
        }
    );
}

function startMultiFloorLabyrinth() {
    currentStage = 'labyrinth';
    unlockLevel('labyrinth');
    if (schoolLevel && schoolLevel.group) schoolLevel.group.visible = false;
    if (hud) hud.style.display = 'none';

    resetCameraUpright(0);
    scene.fog = new THREE.FogExp2(0x140804, 0.042);

    multiFloorLabyrinth = new MultiFloorLabyrinthManager(
        scene,
        camera,
        player,
        audio,
        physics,
        () => onLevelCompleted('labyrinth', () => startFloodedBoilerLevel()),
        (monsterEntity, monsterGroup) => {
            startGrabAndLiftSequence(monsterEntity, monsterGroup, () => {
                multiFloorLabyrinth.resetOnCatch();
                resetCameraUpright(0);
            });
        }
    );
}

function startFloodedBoilerLevel() {
    currentStage = 'boiler';
    unlockLevel('boiler');
    if (multiFloorLabyrinth && multiFloorLabyrinth.group) {
        multiFloorLabyrinth.group.visible = false;
    }
    const minimap = document.getElementById('minimap-container');
    if (minimap) minimap.style.display = 'none';
    if (hud) hud.style.display = 'none';

    resetCameraUpright(0);
    scene.fog = new THREE.FogExp2(0x050101, 0.052);

    floodedBoiler = new FloodedBoilerManager(
        scene,
        camera,
        player,
        audio,
        physics,
        () => onLevelCompleted('boiler', () => startWhisperLibraryLevel()),
        (monsterEntity, monsterGroup) => {
            startGrabAndLiftSequence(monsterEntity, monsterGroup, () => {
                floodedBoiler.resetOnCatch();
                resetCameraUpright(0);
            });
        }
    );
}

function startWhisperLibraryLevel() {
    currentStage = 'library';
    unlockLevel('library');
    if (floodedBoiler && floodedBoiler.group) {
        floodedBoiler.group.visible = false;
    }
    if (hud) hud.style.display = 'none';

    resetCameraUpright(0);
    scene.fog = new THREE.FogExp2(0x070302, 0.065);

    whisperLibrary = new WhisperLibraryManager(
        scene,
        camera,
        player,
        audio,
        physics,
        () => {
            if (hud) {
                hud.innerText = "FLÜSTER-BIBLIOTHEK ÜBERLEBT – DU BIST ENTKOMMEN!";
                hud.style.color = '#00ffaa';
                hud.style.display = 'block';
            }
            setTimeout(() => returnToMainMenu(), 3500);
        },
        (monsterEntity, monsterGroup) => {
            startGrabAndLiftSequence(monsterEntity, monsterGroup, () => {
                whisperLibrary.resetOnCatch();
                resetCameraUpright(0);
            });
        }
    );
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (currentStage === 'menu') {
            document.getElementById('modal-settings').style.display = 'none';
            showMainMenuButtons();
            return;
        }
        if (isAtLaptop || desktopUI.style.display === 'flex') {
            exitLaptopView(false);
        }
        return;
    }

    if (currentStage === 'menu') return;

    if (e.code === player.keybinds.interact || e.key === 'e' || e.key === 'E') {
        if (isAtLaptop || isZoomingLaptop || isBeingGrabbed) return;
        raycaster.setFromCamera(center, camera);

        if (currentStage === 'act1') {
            if (level01 && !level01.hasLaptopBeenRead) {
                const hits = raycaster.intersectObject(level01.laptop, true);
                if (hits.length > 0 && camera.position.distanceTo(level01.laptop.position) < 2.6) {
                    enterLaptopView();
                    return;
                }
            }

            if (level01 && level01.hasLaptopBeenRead && !level01.hasKey) {
                const drawerPos = new THREE.Vector3(-1.72, 0.56, 1.05);
                if (camera.position.distanceTo(drawerPos) < 2.4) {
                    level01.pickupKey();
                    return;
                }
            }

            if (level01 && level01.hasKey && !level01.isKeyInserted && !level01.doorOpen) {
                const doorPos = new THREE.Vector3(0, 1.2, 0.0);
                if (camera.position.distanceTo(doorPos) < 2.8) {
                    level01.useKeyOnDoor();
                    return;
                }
            }

            if (level01 && level01.isTerminalUnlockedOnDoor && !level01.doorOpen) {
                if (level01.pressHoveredTerminalButton(raycaster, terminal)) return;
            }

            if (hallway && hallway.doorsFullyClosed) {
                hallway.pressHoveredButton(raycaster);
                return;
            }
        } else if (currentStage === 'fleischrooms' && fleischrooms) {
            fleischrooms.tryInteractDoor(raycaster);
        } else if (currentStage === 'school' && schoolLevel) {
            schoolLevel.tryInteract(raycaster);
        } else if (currentStage === 'boiler' && floodedBoiler) {
            floodedBoiler.tryInteract(raycaster);
        } else if (currentStage === 'library' && whisperLibrary) {
            whisperLibrary.tryInteract(raycaster);
        }
    }
});

function updateInteractionPrompt() {
    if (currentStage === 'menu' || !controls.isLocked || isZoomingLaptop || isAtLaptop || isBeingGrabbed) {
        promptUI.style.display = 'none';
        return;
    }

    raycaster.setFromCamera(center, camera);

    if (currentStage === 'act1') {
        if (level01 && !level01.hasLaptopBeenRead) {
            const hits = raycaster.intersectObject(level01.laptop, true);
            if (hits.length > 0 && camera.position.distanceTo(level01.laptop.position) < 2.6) {
                promptUI.innerText = "[E] Laptop";
                promptUI.style.display = 'block';
                return;
            }
        }

        if (level01 && level01.hasLaptopBeenRead && !level01.hasKey) {
            const drawerPos = new THREE.Vector3(-1.72, 0.56, 1.05);
            if (camera.position.distanceTo(drawerPos) < 2.4) {
                promptUI.innerText = "[E] Schlüssel nehmen";
                promptUI.style.display = 'block';
                return;
            }
        }

        if (level01 && level01.hasKey && !level01.isKeyInserted && !level01.doorOpen && (!level01.clockActivated || level01.formulaSolvedOnce)) {
            const doorPos = new THREE.Vector3(0, 1.2, 0.0);
            if (camera.position.distanceTo(doorPos) < 2.8) {
                promptUI.innerText = "[E] Schlüssel in die Tür stecken";
                promptUI.style.display = 'block';
                return;
            }
        }

        if (level01 && level01.isTerminalUnlockedOnDoor && !level01.doorOpen) {
            const termBtn = level01.getHoveredTerminalButton(raycaster);
            if (termBtn) {
                promptUI.innerText = `[KLICK / E] ${termBtn.userData.label}`;
                promptUI.style.display = 'block';
                return;
            }
        }

        if (hallway && hallway.doorsFullyClosed) {
            const btn = hallway.getHoveredButton(raycaster);
            if (btn) {
                promptUI.innerText = `[E] Taste ${btn.userData.digit}`;
                promptUI.style.display = 'block';
                return;
            }
        }
    } else if (currentStage === 'fleischrooms' && fleischrooms) {
        const door = fleischrooms.getHoveredDoor(raycaster);
        if (door) {
            promptUI.innerText = `[E] Tür öffnen`;
            promptUI.style.display = 'block';
            return;
        }
    } else if (currentStage === 'school' && schoolLevel) {
        const hit = schoolLevel.getHoveredInteraction(raycaster);
        if (hit) {
            promptUI.innerText = hit.prompt;
            promptUI.style.display = 'block';
            return;
        }
    } else if (currentStage === 'boiler' && floodedBoiler) {
        const hit = floodedBoiler.getHoveredInteraction(raycaster);
        if (hit) {
            promptUI.innerText = hit.prompt;
            promptUI.style.display = 'block';
            return;
        }
    } else if (currentStage === 'library' && whisperLibrary) {
        const hit = whisperLibrary.getHoveredInteraction(raycaster);
        if (hit) {
            promptUI.innerText = hit.prompt;
            promptUI.style.display = 'block';
            return;
        }
    }

    promptUI.style.display = 'none';
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    postProcessing.setSize(window.innerWidth, window.innerHeight);
});

let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (currentStage === 'menu') {
        updateMenuCctv(delta);
        postProcessing.render(delta);
        return;
    }

    if (isBeingGrabbed && grabMonsterGroup && grabMonsterEntity) {
        grabTimer += delta;

        const liftProgress = Math.min(1.0, grabTimer / 1.25);
        const smoothLift = 1.0 - Math.pow(1.0 - liftProgress, 3);

        grabMonsterEntity.setGrabPose(smoothLift);

        const liftedY = grabStartCamPos.y + smoothLift * 1.08;
        const shakeX = (Math.random() - 0.5) * 0.045;
        const shakeY = (Math.random() - 0.5) * 0.045;

        camera.position.set(
            grabStartCamPos.x + shakeX,
            liftedY + shakeY,
            grabStartCamPos.z
        );

        const mWorldPos = new THREE.Vector3();
        grabMonsterGroup.getWorldPosition(mWorldPos);

        const faceTarget = new THREE.Vector3(
            mWorldPos.x,
            grabBaseY + 2.68,
            mWorldPos.z
        );

        const lookMat = new THREE.Matrix4().lookAt(camera.position, faceTarget, new THREE.Vector3(0, 1, 0));
        const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ').setFromRotationMatrix(lookMat, 'YXZ');
        lookEuler.z = 0;
        camera.quaternion.setFromEuler(lookEuler);

        if (grabTimer >= 0.95 && fadeUI.style.opacity !== '1') {
            fadeUI.style.opacity = '1';
        }

        if (grabTimer >= 1.75 && !grabRespawnTriggered) {
            grabRespawnTriggered = true;
            grabMonsterEntity.resetPose();
            resetCameraUpright(grabSavedYaw);
            if (grabRespawnCallback) grabRespawnCallback();

            setTimeout(() => {
                resetCameraUpright(grabSavedYaw);
                fadeUI.style.opacity = '0';
                isBeingGrabbed = false;
            }, 350);
        }

        postProcessing.render(delta);
        return;
    }

    if (isZoomingLaptop && level01) {
        zoomProgress += zoomDirection * delta * 3.2;

        const targetQuat = new THREE.Quaternion();
        const lookMat = new THREE.Matrix4().lookAt(level01.laptopCamPos, level01.laptopLookTarget, new THREE.Vector3(0, 1, 0));
        targetQuat.setFromRotationMatrix(lookMat);

        const clamped = Math.max(0, Math.min(1, zoomProgress));
        camera.position.lerpVectors(savedCamPos, level01.laptopCamPos, clamped);
        camera.quaternion.slerpQuaternions(savedCamQuat, targetQuat, clamped);

        if (zoomDirection === 1 && zoomProgress >= 1) {
            isZoomingLaptop = false;
            isAtLaptop = true;
            desktopUI.style.display = 'flex';
        } else if (zoomDirection === -1 && zoomProgress <= 0) {
            isZoomingLaptop = false;
            isAtLaptop = false;
            const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion, 'YXZ');
            resetCameraUpright(e.y);
        }
    } else if (controls.isLocked && !isAtLaptop) {
        const isAutoEntering =
            (currentStage === 'school' && schoolLevel && schoolLevel.isEnteringWalk) ||
            (currentStage === 'labyrinth' && multiFloorLabyrinth && multiFloorLabyrinth.isEnteringWalk) ||
            (currentStage === 'boiler' && floodedBoiler && floodedBoiler.isEnteringWalk) ||
            (currentStage === 'library' && whisperLibrary && whisperLibrary.isEnteringWalk);
        if (!isAutoEntering) {
            player.update(delta);
        }
        updateInteractionPrompt();
    }

    if (currentStage === 'act1') {
        if (level01) level01.update(delta);
        if (hallway) hallway.update(delta);
    } else if (currentStage === 'fleischrooms' && fleischrooms) {
        fleischrooms.update(delta);
    } else if (currentStage === 'school' && schoolLevel) {
        schoolLevel.update(delta);
    } else if (currentStage === 'labyrinth' && multiFloorLabyrinth) {
        multiFloorLabyrinth.update(delta);
    } else if (currentStage === 'boiler' && floodedBoiler) {
        floodedBoiler.update(delta);
    } else if (currentStage === 'library' && whisperLibrary) {
        whisperLibrary.update(delta);
    }

    postProcessing.render(delta);
}

animate();
