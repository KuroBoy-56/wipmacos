import { showsAutoDemo } from './login-demo.util';

describe('showsAutoDemo', () => {
    const base = { blocked: false, review: false, panelDemo: null, distributorDemo: null };

    it('follows the panel demo config when the theme is off', () => {
        expect(showsAutoDemo({ ...base, panelDemo: true })).toBe(true);
        expect(showsAutoDemo({ ...base, panelDemo: false, distributorDemo: true })).toBe(false);
    });

    it('hides the button with Omitir when the panel did not say there is a demo', () => {
        expect(showsAutoDemo(base)).toBe(false);
    });

    it('uses the distributor demo only when features did not answer', () => {
        expect(showsAutoDemo({ ...base, distributorDemo: true })).toBe(true);
        expect(showsAutoDemo({ ...base, distributorDemo: false })).toBe(false);
    });

    it('shows the theme Auto-Demo with the theme on, never on a blocked device', () => {
        expect(showsAutoDemo({ ...base, review: true, panelDemo: false })).toBe(true);
        expect(showsAutoDemo({ ...base, review: true, blocked: true })).toBe(false);
    });
});
