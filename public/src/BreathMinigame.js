import { milanMode } from './MilanModeManager.js';
export class BreathMinigame {
    constructor(onSuccess, onFail) {
        this.onSuccess = onSuccess;
        this.onFail = onFail;
        this.isActive = false;
        this.rhythmTarget = 1.0; // 1 second intervals
        this.tolerance = 0.2;
        this.lastPress = performance.now() / 1000;
        this.successCount = 0;
        
        this.setupListener();
    }

    setupListener() {
        document.addEventListener('keydown', (e) => {
            if (!this.isActive || e.code !== 'Space') return;
            
            const now = performance.now() / 1000;
            const diff = now - this.lastPress;
            this.lastPress = now;

            if (Math.abs(diff - this.rhythmTarget) < this.tolerance) {
                this.successCount++;
                if (this.successCount > 5) { // 5 successful beats to survive[cite: 1]
                    this.isActive = false;
                    this.onSuccess();
                }
            } else {
                this.isActive = false;
                this.onFail(); // Alerts Blind Fleischi
            }
        });
    }

    start() {
        this.isActive = true;
        this.successCount = 0;
        this.lastPress = performance.now() / 1000;
        console.log("Locker minigame started: Press Space every 1 second!");
    }
}


// [MILAN_MODE_HOOK_B4]

(() => {
    const cls = (typeof BreathMinigame !== 'undefined') ? BreathMinigame : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            if (milanMode.isMilan && (method.toLowerCase().includes('update') || method.toLowerCase().includes('tick'))) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.45; // Harder breath minigame in Milan mode
                }
            }
            return orig.apply(this, args);
        };
    }
})();

