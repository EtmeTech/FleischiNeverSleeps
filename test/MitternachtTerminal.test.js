import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import { MitternachtTerminal } from '../public/src/MitternachtTerminal.js';

describe('MitternachtTerminal Logic', () => {
    let terminal;

    beforeEach(() => {
        const dom = new JSDOM(`
            <div id="formula-overlay"></div>
            <input id="formula-input" />
        `);
        global.document = dom.window.document;
        terminal = new MitternachtTerminal(() => {});
    });

    it('should strip whitespace and normalize valid inputs', () => {
        const input1 = " x = ( -b +- sqrt ( b^2 - 4ac ) ) / ( 2a ) ";
        expect(terminal.validate(input1)).to.be.true;
    });

    it('should accept mathematically identical syntax variations', () => {
        const input2 = "(-b+-sqrt(b*b-4*a*c))/(2*a)";
        expect(terminal.validate(input2)).to.be.true;
    });

    it('should reject incorrect formulas', () => {
        const wrongInput = "x = (-b + sqrt(b^2 + 4ac)) / a";
        expect(terminal.validate(wrongInput)).to.be.false;
    });
});
