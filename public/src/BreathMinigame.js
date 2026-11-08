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
