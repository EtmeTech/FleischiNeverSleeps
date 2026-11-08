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
