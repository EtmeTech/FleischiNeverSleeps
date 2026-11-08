// Folder with the mp3 files (relative to index.html). vol = volume, max/fade = optional cap + fade-out (seconds).
const SAMPLE_DIR = './assets/soundeffect/';
const SAMPLE_CONFIG = {
    playJumpscareSound:    { file: 'playJumpscareSound.mp3',    vol: 0.9 },
    playCableSnap:         { file: 'playCableSnap.mp3',         vol: 1.0 },
    playWaterSplash:       { file: 'playWaterSplash.mp3',       vol: 0.8 },
    playKeyPickup:         { file: 'playKeyPickup.mp3',         vol: 0.9 },
    playScreamer:          { file: 'playScreamer.mp3',          vol: 1.0 },
    playUnlock:            { file: 'UnlockDoor.mp3',            vol: 0.9 },
    playSecretWallSlide:   { file: 'playSecretWallSlide.mp3',   vol: 0.9 },
    playBoneCrack:         { file: 'playBoneCrack.mp3',         vol: 1.0 },
    playMidnightGong:      { file: 'playMidnightGong.mp3',      vol: 0.9, max: 10, fade: 3 }, // file is 50s long
    playDrawerSlide:       { file: 'playDrawerSlide.mp3',       vol: 0.9 },
    playMetalBang:         { file: 'playMetalBang.mp3',         vol: 1.0 },
    playTick:              { file: 'playTick.mp3',              vol: 0.7 },
    playDoorSlam:          { file: 'playDoorSlam.mp3',          vol: 1.0 },
    triggerScoldJumpscare: { file: 'triggerScoldJumpscare.mp3', vol: 1.0 },
    playGlassCrunch:       { file: 'playGlassCrunch.mp3',       vol: 0.9 }
};

export class AudioSynthesizer {
    constructor() {
        this.ctx = null;
        this.scoldTimeout = null;
        this.buffers = {};
        this.rawSamples = {};
        this.samplesRequested = false;
        this.fetchSamples();
    }

    // Fetch the mp3 files right away (no AudioContext needed); decode them once the context exists.
    fetchSamples() {
        if (this.samplesRequested || typeof fetch === 'undefined') return;
        this.samplesRequested = true;
        for (const [name, cfg] of Object.entries(SAMPLE_CONFIG)) {
            this.rawSamples[name] = fetch(SAMPLE_DIR + cfg.file)
                .then((r) => (r.ok ? r.arrayBuffer() : null))
                .catch(() => null);
        }
    }

    async decodeSamples() {
        for (const name of Object.keys(SAMPLE_CONFIG)) {
            if (this.buffers[name] || !this.rawSamples[name]) continue;
            try {
                const raw = await this.rawSamples[name];
                if (raw) this.buffers[name] = await this.ctx.decodeAudioData(raw.slice(0));
            } catch (e) {
                console.warn('Sound konnte nicht geladen werden:', name, e);
            }
        }
    }

    // Plays the mp3 for `name` if it is loaded. Returns its duration in seconds, or 0 -> caller uses synth fallback.
    playSample(name, rate = 1.0) {
        const buf = this.buffers[name];
        if (!buf || !this.ctx) return 0;
        const cfg = SAMPLE_CONFIG[name];
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        src.buffer = buf;
        src.playbackRate.value = Math.min(2.5, Math.max(0.4, rate));
        const dur = cfg.max ? Math.min(buf.duration / src.playbackRate.value, cfg.max) : buf.duration / src.playbackRate.value;
        gain.gain.setValueAtTime(cfg.vol, now);
        if (cfg.max && cfg.fade) {
            gain.gain.setValueAtTime(cfg.vol, now + Math.max(0, dur - cfg.fade));
            gain.gain.linearRampToValueAtTime(0, now + dur);
        }
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(now);
        if (cfg.max) src.stop(now + dur + 0.05);
        return dur;
    }

    playBoneCrack() { this.init(); this.playSample('playBoneCrack'); }
    playScreamer() { this.init(); this.playSample('playScreamer'); }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (!this.decodeStarted) {
            this.decodeStarted = true;
            this.decodeSamples();
        }
    }

    playTick(pitchMultiplier = 1.0) {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900 * pitchMultiplier, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.04);
    }

    playDrawerSlide() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(45, this.ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.35);
    }

    playUnlock() { this.playKeyPickup(); }

    playKeyPickup() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
        osc.frequency.setValueAtTime(1800, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.25);
    }

    playMidnightGong() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + 2.5);
        gain.gain.setValueAtTime(0.9, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 2.5);
    }

    playJumpscareSound() {
        this.init();
        const osc1 = this.ctx.createOscillator();
        const osc2 = new OscillatorNode(this.ctx, { type: 'square', frequency: 60 });
        const gain = this.ctx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(180, this.ctx.currentTime);
        osc1.frequency.linearRampToValueAtTime(850, this.ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.2);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);
        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 1.2);
        osc2.stop(this.ctx.currentTime + 1.2);
    }

    // EXTREMER SCHOCK-JUMPSCARE BEI FALSCHER FORMEL / FALSCHEM AUFZUG-CODE!
    triggerScoldJumpscare() {
        this.init();
        const now = this.ctx.currentTime;
        const sampleDur = this.playSample('triggerScoldJumpscare');

        if (!sampleDur) {
        // 1. Brutaler dissonanter Jumpscare-Schrei + Sub-Bass-Schlag
        const freqs = [110, 117, 233, 580, 1140];
        freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
            osc.frequency.setValueAtTime(f, now);
            osc.frequency.exponentialRampToValueAtTime(f * (idx > 2 ? 1.45 : 0.75), now + 0.45);
            gain.gain.setValueAtTime(0.45, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 1.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 1.35);
        });

        // 2. Synthetische wütende Lehrer-Stimm-Kadenz (für 2.4 Sekunden passend zum Wackelkopf)
        const syllables = [140, 165, 130, 180, 155, 125, 170, 195, 160, 145, 185, 120];
        syllables.forEach((sf, i) => {
            const startT = now + 0.15 + i * 0.17;
            const vOsc = this.ctx.createOscillator();
            const vGain = this.ctx.createGain();
            vOsc.type = 'sawtooth';
            vOsc.frequency.setValueAtTime(sf, startT);
            vOsc.frequency.linearRampToValueAtTime(sf * 0.85, startT + 0.14);
            vGain.gain.setValueAtTime(0.28, startT);
            vGain.gain.exponentialRampToValueAtTime(0.01, startT + 0.15);
            vOsc.connect(vGain);
            vGain.connect(this.ctx.destination);
            vOsc.start(startT);
            vOsc.stop(startT + 0.15);
        });

        // 3. Echte deutsche Sprachausgabe (Web Speech API)
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
                const msg = new SpeechSynthesisUtterance("Das hab ich euch schonmal erklärt, das erkläre ich euch jetzt nicht mehr!");
                msg.lang = 'de-DE';
                msg.pitch = 0.55;
                msg.rate = 1.15;
                msg.volume = 1.0;
                window.speechSynthesis.speak(msg);
            } catch (e) {}
        }

        }

        // 4. Vollbild-Overlay mit wackelndem Fleischi-Kopf links einblenden
        if (typeof document !== 'undefined') {
            const el = document.getElementById('scold-jumpscare-overlay');
            if (el) {
                el.style.display = 'flex';
                if (this.scoldTimeout) clearTimeout(this.scoldTimeout);
                this.scoldTimeout = setTimeout(() => {
                    el.style.display = 'none';
                }, Math.max(2700, sampleDur * 1000));
            }
        }
    }

    playDoorSlam() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(130, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.45);
        gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.45);
    }

    playMetalBang() {
        this.init();
        const bufferSize = this.ctx.sampleRate * 0.35;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(380, this.ctx.currentTime);
        filter.Q.setValueAtTime(4.0, this.ctx.currentTime);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.9, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playCableSnap() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(450, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 1.2);
        gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 1.2);
    }

    playWaterSplash(intensity = 0.7) {
        this.init();
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.28);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(520, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 0.28);
        filter.Q.setValueAtTime(1.8, this.ctx.currentTime);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(intensity, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playGlassCrunch() {
        this.init();
        const now = this.ctx.currentTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.22);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const burst = Math.sin(i * 0.45) > 0 ? 1.0 : 0.3;
            data[i] = (Math.random() * 2 - 1) * burst * Math.exp(-i / (this.ctx.sampleRate * 0.07));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2400, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.85, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playSecretWallSlide() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(58, now);
        osc.frequency.linearRampToValueAtTime(42, now + 1.1);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + 1.15);
    }
}

// Every method with an mp3 plays the sample; if it is not loaded (yet / missing) the old synth sound is the fallback.
for (const name of Object.keys(SAMPLE_CONFIG)) {
    if (name === 'triggerScoldJumpscare' || name === 'playBoneCrack' || name === 'playScreamer') continue;
    const synth = AudioSynthesizer.prototype[name];
    AudioSynthesizer.prototype[name] = function (arg) {
        this.init();
        const rate = name === 'playTick' && typeof arg === 'number' ? arg : 1.0;
        if (this.playSample(name, rate)) return;
        if (synth) synth.call(this, arg);
    };
}
