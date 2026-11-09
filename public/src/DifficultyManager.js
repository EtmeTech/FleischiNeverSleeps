import { milanMode } from './MilanModeManager.js';
/**
 * FleischiNeverSleeps - Clean Difficulty Selector + Full-Run Timer & 5-Star Victory Screen
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'fleischi_difficulty_v1';

    const DIFFICULTIES = {
        mats: {
            id: 'mats',
            name: 'Mats',
            label: 'Einfach',
            color: '#00ff88',
            scoreMult: 1.0,
            imgPrimary: 'assets/textures/Mats.png',
            imgFallback: 'assets/textures/mats.png',
            speedMult: 0.75,
            animSpeedMult: 0.82,
            detectDistMult: 0.75,
            coneAngleMult: 0.80,
            proximityMult: 0.75,
            pauseTimeMult: 1.50,
            lockerGraceMult: 1.45,
            goldChance: 0.12,
            goldPityMax: 6
        },
        praeti: {
            id: 'praeti',
            name: 'Praeti',
            label: 'Normal',
            color: '#ffaa00',
            scoreMult: 1.35,
            imgPrimary: 'assets/textures/Praeti.png',
            imgFallback: 'assets/textures/Preati.png',
            speedMult: 1.00,
            animSpeedMult: 1.00,
            detectDistMult: 1.00,
            coneAngleMult: 1.00,
            proximityMult: 1.00,
            pauseTimeMult: 1.00,
            lockerGraceMult: 1.00,
            goldChance: 0.24,
            goldPityMax: 4
        },
        milan: {
            id: 'milan',
            name: 'Milan',
            label: 'Schwer',
            color: '#ff2211',
            scoreMult: 1.80,
            imgPrimary: 'assets/textures/Milan.png',
            imgFallback: 'assets/textures/milan.png',
            speedMult: 1.35,
            animSpeedMult: 1.35,
            detectDistMult: 1.40,
            coneAngleMult: 1.30,
            proximityMult: 1.50,
            pauseTimeMult: 0.40,
            lockerGraceMult: 0.60,
            goldChance: 0.42,
            goldPityMax: 2
        }
    };

    let currentDiffKey = 'praeti';
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && DIFFICULTIES[saved]) currentDiffKey = saved;
    } catch (e) {}

    let bypassPlayIntercept = false;

    // Run-Tracking (Play = Full Run mit Timer & Endmenü | Levels = Einzellevel ohne Endmenü)
    window.__fnsIsFullRun = false;
    window.__fnsRunStartTime = 0;
    window.__fnsRunStickers = 0;

    function getConfig() {
        return DIFFICULTIES[currentDiffKey] || DIFFICULTIES.praeti;
    }

    function setDifficulty(key) {
        if (!DIFFICULTIES[key]) return;
        currentDiffKey = key;
        try {
            localStorage.setItem(STORAGE_KEY, key);
        } catch (e) {}
    }

    function formatTime(totalSeconds) {
        const sec = Math.max(0, Math.floor(totalSeconds));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function getCollectedStickerCount() {
        let runCount = window.__fnsRunStickers || 0;
        try {
            const raw = localStorage.getItem('fleischi_stickers_save_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                const normalCount = parsed.normal ? Object.keys(parsed.normal).filter(k => parsed.normal[k]).length : 0;
                const goldCount = parsed.gold ? Object.keys(parsed.gold).filter(k => parsed.gold[k]).length : 0;
                return Math.max(runCount, normalCount + goldCount);
            }
        } catch (e) {}
        return runCount;
    }

    function injectStyles() {
        if (document.getElementById('fns-difficulty-styles')) return;
        const style = document.createElement('style');
        style.id = 'fns-difficulty-styles';
        style.textContent = `
            #menu-difficulty-inline {
                display: none;
                flex-direction: column;
                gap: 14px;
                z-index: 25;
            }
            #btn-difficulty-back {
                width: 160px;
                padding: 10px 20px;
                font-size: 18px;
            }
            .fns-diff-grid {
                display: grid;
                grid-template-columns: repeat(3, 210px);
                gap: 16px;
            }
            .fns-diff-card {
                background: rgba(14, 5, 5, 0.88);
                border: 2px solid #992211;
                padding: 14px;
                color: #ffffff;
                font-family: 'Courier New', Courier, monospace;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.85);
                transition: 0.16s;
            }
            .fns-diff-card:hover,
            .fns-diff-card.fns-gp-hover {
                background: rgba(90, 12, 8, 0.92);
                border-color: #ffaa00;
                transform: translateY(-4px);
                box-shadow: 0 0 22px rgba(255, 40, 10, 0.55);
            }
            .fns-diff-name {
                font-size: 24px;
                font-weight: 900;
                color: #ffffff;
                text-transform: uppercase;
                letter-spacing: 2px;
            }
            .fns-diff-img {
                width: 168px;
                height: 168px;
                object-fit: cover;
                border: 2px solid #551811;
                background: #080303;
            }
            .fns-diff-label {
                font-size: 18px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 1.5px;
            }
            .fns-diff-play-btn {
                width: 100%;
                padding: 10px 0;
                background: rgba(14, 5, 5, 0.95);
                border: 2px solid #992211;
                color: #ffea00;
                font-family: 'Courier New', monospace;
                font-size: 18px;
                font-weight: bold;
                text-align: center;
                text-transform: uppercase;
                letter-spacing: 2px;
                transition: 0.15s;
            }
            .fns-diff-card:hover .fns-diff-play-btn {
                background: #aa180c;
                color: #ffffff;
                border-color: #ffea00;
            }

            /* 5-STERNE VICTORY OVERLAY IM HORROR-LOOK */
            #fns-victory-backdrop {
                display: none;
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.6) 100%);
                z-index: 1200;
                align-items: center;
                justify-content: center;
                font-family: 'Courier New', Courier, monospace;
            }
            .fns-victory-box {
                width: 460px;
                max-width: 90vw;
                background: none;
                border: none;
                box-shadow: none;
                text-shadow: 0 0 10px #000, 0 0 24px rgba(0,0,0,0.9);
                animation: fns-victory-float 4s ease-in-out infinite;
                padding: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 18px;
            }
            @keyframes fns-victory-float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
            .fns-victory-stars {
                display: flex;
                gap: 12px;
                font-size: 46px;
                line-height: 1;
                margin-bottom: 2px;
            }
            .fns-star {
                color: #260d0a;
                text-shadow: 0 0 4px #000;
                transition: transform 0.25s ease, color 0.25s ease;
            }
            .fns-star.earned {
                color: #ffea00;
                text-shadow: 0 0 18px rgba(255, 170, 0, 0.9), 0 0 6px #ff2200;
            }
            .fns-victory-stats {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 10px;
                border: none;
                padding: 10px 0;
            }
            .fns-victory-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 18px;
                color: #dddddd;
                font-weight: bold;
                letter-spacing: 1px;
            }
            .fns-victory-row span:last-child {
                color: #ffea00;
            }
            .fns-victory-score-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 24px;
                font-weight: 900;
                color: #ffaa00;
                padding-top: 6px;
                letter-spacing: 2px;
            }
            .fns-victory-score-row span:last-child {
                color: #00ff88;
                text-shadow: 0 0 12px rgba(0, 255, 136, 0.5);
            }
            .fns-victory-buttons {
                width: 100%;
                display: flex;
                gap: 14px;
                margin-top: 4px;
            }
            .fns-victory-buttons .horror-menu-btn {
                flex: 1;
                text-align: center;
                padding: 12px 10px;
                font-size: 18px;
            }
        `;
        document.head.appendChild(style);
    }

    function attachFallback(imgEl, d) {
        let step = 0;
        const list = [d.imgPrimary, d.imgFallback, '/' + d.imgPrimary, '/' + d.imgFallback, 'assets/textures/fleischi_face.png'];
        imgEl.onerror = function () {
            step++;
            if (step < list.length) imgEl.src = list[step];
        };
    }

    function openDifficultyMenu() {
        const mainButtons = document.getElementById('menu-main-buttons');
        const levelsInline = document.getElementById('menu-levels-inline');
        const diffInline = document.getElementById('menu-difficulty-inline');
        if (!diffInline || !mainButtons) return;
        mainButtons.style.display = 'none';
        if (levelsInline) levelsInline.style.display = 'none';
        diffInline.style.display = 'flex';
    }

    function closeDifficultyMenu() {
        const mainButtons = document.getElementById('menu-main-buttons');
        const diffInline = document.getElementById('menu-difficulty-inline');
        if (!diffInline || !mainButtons) return;
        diffInline.style.display = 'none';
        mainButtons.style.display = 'flex';
    }

    function startWithDifficulty(diffKey) {
        setDifficulty(diffKey);
        closeDifficultyMenu();

        // Startet einen kompletten Run ab Level 1 mit aktivem Timer!
        window.__fnsIsFullRun = true;
        window.__fnsRunStartTime = performance.now();
        window.__fnsRunStickers = 0;

        const playBtn = document.getElementById('btn-menu-play');
        if (playBtn) {
            bypassPlayIntercept = true;
            playBtn.click();
            setTimeout(() => { bypassPlayIntercept = false; }, 100);
        }
    }

    function showVictoryModal() {
        injectStyles();
        if (typeof window.__fnsEnterVictoryBackground === 'function') {
            try { window.__fnsEnterVictoryBackground(); } catch (e) {}
        }
        if (document.exitPointerLock) {
            try { document.exitPointerLock(); } catch (e) {}
        }

        const elapsedSec = window.__fnsRunStartTime > 0
            ? (performance.now() - window.__fnsRunStartTime) / 1000
            : 180;
        const stickers = getCollectedStickerCount();
        const cfg = getConfig();

        // Punkteberechnung aus Zeit + Stickern + Schwierigkeit
        const basePoints = 1500;
        const timeBonus = Math.max(300, 3200 - Math.floor(elapsedSec * 3.5));
        const stickerBonus = stickers * 450;
        const totalScore = Math.round((basePoints + timeBonus + stickerBonus) * (cfg.scoreMult || 1.0));

        let stars = 1;
        if (totalScore >= 5800) stars = 5;
        else if (totalScore >= 4400) stars = 4;
        else if (totalScore >= 3100) stars = 3;
        else if (totalScore >= 1900) stars = 2;

        let modal = document.getElementById('fns-victory-backdrop');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fns-victory-backdrop';
            document.body.appendChild(modal);
        }

        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            starsHtml += `<span class="fns-star ${i <= stars ? 'earned' : ''}">&#9733;</span>`;
        }

        modal.innerHTML = `
            <div class="fns-victory-box">
                <div class="fns-victory-stars">${starsHtml}</div>
                <div class="fns-victory-stats">
                    <div class="fns-victory-row">
                        <span>ZEIT</span>
                        <span>${formatTime(elapsedSec)}</span>
                    </div>
                    <div class="fns-victory-row">
                        <span>STICKER</span>
                        <span>${stickers}</span>
                    </div>
                    <div class="fns-victory-row">
                        <span>SCHWIERIGKEIT</span>
                        <span style="color:${cfg.color}">${cfg.name.toUpperCase()}</span>
                    </div>
                    <div class="fns-victory-score-row">
                        <span>PUNKTE</span>
                        <span>${totalScore}</span>
                    </div>
                </div>
                <div class="fns-victory-buttons">
                    <button type="button" class="horror-menu-btn" id="btn-victory-again">Play Again</button>
                    <button type="button" class="horror-menu-btn" id="btn-victory-menu">Hauptmenü</button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';

        modal.querySelector('#btn-victory-again').addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = 'none';
            const ingameBtn = document.getElementById('ingame-menu-btn');
            if (ingameBtn) ingameBtn.click();
            setTimeout(() => {
                startWithDifficulty(currentDiffKey);
            }, 80);
        });

        modal.querySelector('#btn-victory-menu').addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = 'none';
            window.__fnsIsFullRun = false;
            const ingameBtn = document.getElementById('ingame-menu-btn');
            if (ingameBtn) ingameBtn.click();
        });
    }

    function setupUI() {
        injectStyles();
        const bottomLeft = document.getElementById('menu-bottom-left');
        const playBtn = document.getElementById('btn-menu-play');
        if (!bottomLeft || !playBtn) return;

        const oldDiff = document.getElementById('menu-difficulty-inline');
        if (oldDiff) oldDiff.remove();

        const diffContainer = document.createElement('div');
        diffContainer.id = 'menu-difficulty-inline';

        const cardsHtml = Object.values(DIFFICULTIES).map(d => `
            <button type="button" class="fns-diff-card" data-diff="${d.id}">
                <div class="fns-diff-name">${d.name}</div>
                <img class="fns-diff-img" src="${d.imgPrimary}" alt="${d.name}" data-diff-img="${d.id}" />
                <div class="fns-diff-label" style="color:${d.color}">${d.label}</div>
                <div class="fns-diff-play-btn">Play</div>
            </button>
        `).join('');

        diffContainer.innerHTML = `
            <button type="button" class="horror-menu-btn" id="btn-difficulty-back">Back</button>
            <div class="fns-diff-grid">${cardsHtml}</div>
        `;
        bottomLeft.appendChild(diffContainer);

        diffContainer.querySelectorAll('img[data-diff-img]').forEach(img => {
            const k = img.getAttribute('data-diff-img');
            attachFallback(img, DIFFICULTIES[k]);
        });

        diffContainer.querySelector('#btn-difficulty-back').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeDifficultyMenu();
        });

        diffContainer.querySelectorAll('.fns-diff-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startWithDifficulty(card.getAttribute('data-diff'));
            });
        });

        if (!playBtn.__fnsDiffHooked) {
            playBtn.__fnsDiffHooked = true;
            playBtn.addEventListener('click', (e) => {
                if (bypassPlayIntercept) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                openDifficultyMenu();
            }, true);
        }

        // Wenn irgendein Level über das Levels-Menü gestartet wird -> KEIN Full-Run
        const levelsGrid = document.getElementById('levels-inline-grid');
        if (levelsGrid && !levelsGrid.__fnsHooked) {
            levelsGrid.__fnsHooked = true;
            levelsGrid.addEventListener('click', () => {
                window.__fnsIsFullRun = false;
            }, true);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupUI);
    } else {
        setupUI();
    }

    window.showFleischiVictoryScreen = showVictoryModal;

    window.DifficultyManager = {
        DIFFICULTIES,
        getDifficulty: () => currentDiffKey,
        setDifficulty,
        getConfig,
        showVictoryModal,
        getSpeedMultiplier: () => getConfig().speedMult,
        getAnimMultiplier: () => getConfig().animSpeedMult,
        getDetectMultiplier: () => getConfig().detectDistMult,
        getGoldSpawnConfig: () => ({
            chance: getConfig().goldChance,
            pityMax: getConfig().goldPityMax
        })
    };
})();

export const DifficultyManager = window.DifficultyManager;


// [MILAN_MODE_HOOK]

(() => {
    const cls = (typeof DifficultyManager !== 'undefined') ? DifficultyManager : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerDifficultyManager(this);
            if (args.length > 0 && typeof args[0] === 'string') {
                if (args[0].toLowerCase().includes('milan')) {
                    milanMode.setMilanActive(true);
                } else if (method.toLowerCase().includes('set') || method.toLowerCase().includes('select')) {
                    milanMode.setMilanActive(false);
                }
            }
            const res = orig.apply(this, args);
            const cur = String(this.currentDifficulty || this.difficulty || this.selectedDifficulty || '').toLowerCase();
            if (cur.includes('milan')) {
                milanMode.setMilanActive(true);
                if (res && typeof res === 'object') {
                    if (typeof res.speedMultiplier === 'number') res.speedMultiplier = Math.max(res.speedMultiplier * 1.85, 2.35);
                    if (typeof res.monsterSpeed === 'number') res.monsterSpeed *= 1.85;
                    if (typeof res.spawnMultiplier === 'number') res.spawnMultiplier = Math.max(res.spawnMultiplier * 2.5, 3.0);
                    if (typeof res.aggroMultiplier === 'number') res.aggroMultiplier = Math.max(res.aggroMultiplier * 2.2, 2.5);
                }
            }
            return res;
        };
    }
})();

