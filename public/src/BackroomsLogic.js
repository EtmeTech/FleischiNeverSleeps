export class BackroomsLogic {
    constructor(engineRef, targetDoorCount = 10) {
    if (typeof window !== 'undefined') { setTimeout(() => window.StickerSystem && window.StickerSystem.notifyLevelActive('fleischrooms', this), 350); }
        this.doorsOpened = 0;
        this.targetDoorCount = targetDoorCount;
        this.isHunting = false;
        this.countdownActive = false;
        this.engine = engineRef;
    }

    onDoorInteract(doorObj) {
        if (!doorObj || doorObj.userData.opened) return;

        doorObj.userData.opened = true;
        this.doorsOpened++;

        const counterHud = document.getElementById('door-counter-hud');
        if (counterHud) {
            counterHud.style.display = 'none';
        }

        if (this.doorsOpened === this.targetDoorCount) {
            this.triggerTrueExit(doorObj);
            return;
        }

        this.swingDoorOpen(doorObj);

        if (Math.random() < 0.10 && !this.countdownActive) {
            this.startCountdown(doorObj);
        }
    }

    // WICHTIGER FIX: Negativer Winkel (-angle) lässt die Tür nach AUSSEN (von der Wand weg!) in den Raum schwingen!
    swingDoorOpen(doorObj, onComplete = null) {
        if (this.engine && this.engine.audio) {
            this.engine.audio.playDrawerSlide();
        }
        let angle = 0;
        const target = Math.PI * 0.62;
        const animateDoor = () => {
            if (angle < target) {
                angle += 0.07;
                doorObj.rotation.y = (doorObj.userData.baseRotY || 0) - angle;
                requestAnimationFrame(animateDoor);
            } else if (onComplete) {
                onComplete();
            }
        };
        animateDoor();
    }

    startCountdown(doorObj) {
        this.countdownActive = true;
        let count = 5;
        const hud = document.getElementById('hud-message');
        if (hud) {
            hud.style.display = 'block';
            hud.style.color = '#ff2222';
            hud.innerText = `Spawning Fleischi in ${count}...`;
        }
        if (this.engine && this.engine.audio) this.engine.audio.playTick(1.3);

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                if (hud) hud.innerText = `Spawning Fleischi in ${count}...`;
                if (this.engine && this.engine.audio) this.engine.audio.playTick(1.3 + (5 - count) * 0.2);
            } else {
                clearInterval(interval);
                this.countdownActive = false;
                if (hud) {
                    hud.innerText = "Spawning Fleischi in 0 - RENN WEG!";
                    setTimeout(() => { hud.style.display = 'none'; }, 1800);
                }
                this.spawnFleischiChaser(doorObj);
            }
        }, 900);
    }

    spawnFleischiChaser(doorObj) {
        this.isHunting = true;
        if (this.engine && this.engine.spawnMonsterBehindPlayer) {
            this.engine.spawnMonsterBehindPlayer(9.5, doorObj);
        }
    }

    triggerTrueExit(doorObj) {
        this.swingDoorOpen(doorObj);
        if (this.engine && this.engine.activateExitPortal) {
            this.engine.activateExitPortal(doorObj);
        } else if (this.engine && this.engine.loadNextLevel) {
            this.engine.loadNextLevel();
        }
    }
}


/* === FNS STICKER HOOK === */
if (typeof window !== 'undefined' && typeof BackroomsLogic !== 'undefined') {
  window.__FNS_REGISTER_LEVEL_CLASS__ = window.__FNS_REGISTER_LEVEL_CLASS__ || [];
  window.__FNS_REGISTER_LEVEL_CLASS__.push({ key: 'fleischrooms', cls: BackroomsLogic });
  if (window.StickerSystem && window.StickerSystem.hookLevelClass) {
    window.StickerSystem.hookLevelClass('fleischrooms', BackroomsLogic);
  }
}
