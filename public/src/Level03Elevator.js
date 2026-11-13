import { milanMode } from './MilanModeManager.js';
export class ElevatorKeypad {
    constructor(onFloorSelected) {
        this.onFloorSelected = onFloorSelected;
        this.correctFloor = '9'; // (x-3)^2 = x^2 - 6x + 9
        this.isActive = false;
    }

    interact(key) {
        if (!this.isActive) return;
        
        if (key === this.correctFloor) {
            console.log("Elevator doors closing. Shaft sequence initiating.");
            this.isActive = false;
            this.triggerFreefall();
        } else {
            console.log("Error buzz. Wrong floor.");
        }
    }

    triggerFreefall() {
        setTimeout(() => {
            // Elevator drops after 3 seconds
            console.log("ELEVATOR CABLE SNAP!");
            this.onFloorSelected();
        }, 3000);
    }
}


// [MILAN_MODE_HOOK_B3]

(() => {
    const cls = (typeof Level03Elevator !== 'undefined') ? Level03Elevator : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        const orig = proto[method];
        proto[method] = function(...args) {
            milanMode.registerLevelManager('Level03Elevator', this);
            if (this._milanFurzKnockedDown && (
                method.toLowerCase().includes('monster') ||
                method.toLowerCase().includes('enemy') ||
                method.toLowerCase().includes('attack') ||
                method.toLowerCase().includes('chase')
            )) {
                return;
            }
            if (milanMode.isMilan && (
                method.toLowerCase().includes('update') ||
                method.toLowerCase().includes('tick') ||
                method.toLowerCase().includes('animate')
            )) {
                if (args.length > 0 && typeof args[0] === 'number' && args[0] < 0.5) {
                    args[0] = args[0] * 1.5;
                }
            }
            return orig.apply(this, args);
        };
    }
})();


if (typeof window !== "undefined" && typeof milanMode !== "undefined") { window.milanMode = milanMode; }
