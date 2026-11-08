import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import { BackroomsLogic } from '../public/src/BackroomsLogic.js';

describe('Backrooms 10-Door Rule', () => {
    beforeEach(() => {
        const dom = new JSDOM(`<!DOCTYPE html><div id="hud-message"></div><div id="door-counter-hud"></div>`);
        global.document = dom.window.document;
        global.requestAnimationFrame = () => {};
    });

    afterEach(() => {
        delete global.document;
        delete global.requestAnimationFrame;
    });

    it('must trigger the true exit on exactly the 10th opened door', () => {
        let levelLoaded = false;
        const mockEngine = { 
            loadNextLevel: () => { levelLoaded = true; },
            spawnMonsterBehindPlayer: () => {} 
        };
        const logic = new BackroomsLogic(mockEngine, 10);
        
        for (let i = 0; i < 9; i++) {
            logic.onDoorInteract({ userData: { opened: false }, rotation: { y: 0 } });
        }
        expect(levelLoaded).to.be.false;
        
        logic.onDoorInteract({ userData: { opened: false }, rotation: { y: 0 } });
        expect(levelLoaded).to.be.true;
    });
});
