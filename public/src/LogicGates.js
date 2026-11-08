export class HighVoltageTerminal {
    constructor(onPumpsActivated) {
        this.onPumpsActivated = onPumpsActivated;
        this.switches = { A: false, B: false, C: false };
    }

    toggleSwitch(id) {
        if (this.switches[id] !== undefined) {
            this.switches[id] = !this.switches[id];
            this.evaluateSystem();
        }
    }

    evaluateSystem() {
        // PUMP STATUS = (A AND B) OR (NOT C)[cite: 1]
        const A = this.switches.A;
        const B = this.switches.B;
        const C = this.switches.C;
        
        const isPumpActive = (A && B) || (!C);
        
        if (isPumpActive && A && B && C) { // The required state is A=1, B=1, C=1[cite: 1]
            console.log("Pumps activated! Water draining... 45 second sprint starts NOW!");
            this.onPumpsActivated();
        }
    }
}
