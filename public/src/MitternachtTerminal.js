import { milanMode } from './MilanModeManager.js';
export class MitternachtTerminal {
    constructor(audio, onSuccessCallback) {
    if (typeof window !== 'undefined') { window.__fnsActiveTerminalInstance = this; }
        this.audio = audio;
        this.onSuccess = onSuccessCallback;
        this.currentInput = "";
        this.isActive = false;
        this.roomRef = null;

        this.inputElement = typeof document !== 'undefined' ? document.getElementById('formula-input') : null;
        this.overlay = typeof document !== 'undefined' ? document.getElementById('formula-overlay') : null;
    }

    attachRoom(room) {
        this.roomRef = room;
    }

    activateOnDoor() {
        this.isActive = true;
        this.currentInput = "";
        if (this.roomRef) {
            this.roomRef.showDoorTerminal();
            this.roomRef.updateDoorTerminalScreen(this.currentInput, 'normal');
        }
    }

    normalizeInput(str) {
        return str
            .replace(/\s+/g, '')
            .replace(/⋅/g, '')
            .replace(/\*/g, '')
            .replace(/√/g, 'sqrt')
            .toLowerCase();
    }

    validate(input) {
        let clean = this.normalizeInput(input);
        if (clean.startsWith('x=')) {
            clean = clean.slice(2);
        } else if (clean.startsWith('=')) {
            clean = clean.slice(1);
        }

        const validCorePatterns = [
            "(-b+-sqrt(b^2-4ac))/(2a)",
            "(-b-+sqrt(b^2-4ac))/(2a)",
            "(-b+-sqrt(bb-4ac))/(2a)",
            "(-b-+sqrt(bb-4ac))/(2a)",
            "(-b+-sqrt(b^2-4ac))/2a",
            "(-b+-sqrtb^2-4ac)/(2a)"
        ];
        return validCorePatterns.includes(clean);
    }

    appendToken(token) {
        if (!this.isActive) return;
        if (token === 'CLEAR') {
            this.currentInput = "";
        } else if (token === 'BACK') {
            this.currentInput = this.currentInput.slice(0, -1);
        } else if (token === 'ENTER') {
            this.submitCurrentInput();
            return;
        } else if (this.currentInput.length < 34) {
            this.currentInput += token;
        }
        if (this.audio && this.audio.playTick) this.audio.playTick(1.2);
        if (this.roomRef) {
            this.roomRef.updateDoorTerminalScreen(this.currentInput, 'normal');
        }
    }

    submitCurrentInput() {
        if (!this.isActive) return;
        if (this.validate(this.currentInput)) {
            this.playSuccess();
        } else {
            this.playError();
        }
    }

    playSuccess() {
        this.isActive = false;
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.roomRef) {
            this.roomRef.updateDoorTerminalScreen(this.currentInput, 'success');
        }
        if (this.onSuccess) this.onSuccess();
    }

    playError() {
        if (this.audio && this.audio.triggerScoldJumpscare) {
            this.audio.triggerScoldJumpscare();
        } else if (this.audio && this.audio.playMetalBang) {
            this.audio.playMetalBang();
        }

        if (this.roomRef) {
            this.roomRef.updateDoorTerminalScreen(this.currentInput, 'error');
            setTimeout(() => {
                if (this.isActive && this.roomRef) {
                    this.roomRef.updateDoorTerminalScreen(this.currentInput, 'normal');
                }
            }, 600);
        }
    }
}


// [MILAN_MODE_HOOK_B4]

(() => {
    const cls = (typeof MitternachtTerminal !== 'undefined') ? MitternachtTerminal : null;
    if (!cls || !cls.prototype) return;
    const proto = cls.prototype;

    for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === 'constructor' || typeof proto[method] !== 'function') continue;
        if (method.toLowerCase().includes('command') || method.toLowerCase().includes('exec') || method.toLowerCase().includes('input')) {
            const orig = proto[method];
            proto[method] = function(cmd, ...rest) {
                if (typeof cmd === 'string' && cmd.trim().toLowerCase() === 'furz') {
                    if (milanMode.isMilan) {
                        milanMode.lastFurzTime = -999999;
                        milanMode.triggerFurz();
                    }
                }
                return orig.call(this, cmd, ...rest);
            };
        }
    }
})();

